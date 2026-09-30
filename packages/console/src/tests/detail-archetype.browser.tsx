/**
 * The detail archetype, instantiated with a resource the console has no screen for.
 *
 * This is the reuse acceptance criterion as a test, and the same shape of one the
 * list archetype has. Three screens will be built on `DetailPage` and `DetailTable`
 * without editing them, so the thing worth pinning is that they work for a resource
 * and a collection the console has never seen, and that the states a screen inherits
 * for free -- the identity block, the tab in the URL, the four states -- are actually
 * inherited rather than left to each screen.
 *
 * ## Why some of this is not reachable through a URL
 *
 * The section states that matter most here -- a section that fails while the page is
 * fine, and a section whose rows survive a failed refresh -- cannot be produced by the
 * console's `?sentinel=`, because that control fails *every* request at once, including
 * the page's. They are built from a query result instead, which is the archetype's own
 * contract: what it reads from a hook, and what it does with a page, an error and an
 * empty page. That is the same seam the list archetype's own test uses, and it is the
 * seam a screen author needs when one of these states has to be looked at.
 */

import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { DetailPage } from "@/components/sovren/detail/detail-page";
import { DetailTable } from "@/components/sovren/detail/detail-table";
import { StateBadge } from "@/components/sovren/state-badge";
import type { ListColumn } from "@/components/sovren/list-page";

/** A resource the console has no screen for, standing in for a `Peer` or a `Task`. */
interface Thing {
  id: string;
  name: string;
  state: string;
  /** A field the estate did not report, which is a real state here. */
  note: string | null;
}

const THING: Thing = {
  id: "th_01hq2v7xk3",
  name: "thing-one",
  state: "connected",
  note: null,
};

const COLUMNS: readonly ListColumn<Thing>[] = [
  {
    key: "name",
    header: "Thing",
    width: 200,
    identity: true,
    render: (thing) => thing.name,
  },
  {
    key: "state",
    header: "State",
    width: 120,
    render: (thing) => <StateBadge value={thing.state} />,
  },
];

/**
 * A query result in the shape the archetype reads.
 *
 * Built by hand rather than by a hook, because this test is about the archetype's
 * contract with a screen: what it takes from a generated hook and what it does with
 * each of the four states. A hook over a fake endpoint would be testing the mock
 * backend again, which the Node detail test already does.
 */
const result = (
  data: unknown,
  overrides: { isPending?: boolean; isFetching?: boolean } = {},
): {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
} => ({
  data,
  isPending: overrides.isPending ?? false,
  isFetching: overrides.isFetching ?? false,
  refetch: () => undefined,
});

const PAGE = (items: Thing[]): unknown => ({ status: 200, data: { items, nextPage: null } });

const FAILURE = (code: string): unknown => ({
  status: 503,
  data: {
    code,
    message: "Proxmox is not answering.",
    requestId: "req_detail_archetype",
    retryable: true,
  },
});

/**
 * Render a screen inside a router of its own, at a URL.
 *
 * The tree carries an index route at `/things` as well as the detail route, because
 * the archetype's breadcrumb and its "show the whole list" link both point there --
 * and a router asked for a path it holds no route for renders its 404, so an absent
 * route would turn a test about the archetype into a test about the router.
 */
const renderInRoute = async (Screen: () => React.ReactNode, initialEntry = "/things/thing-one") => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const thingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/things",
    component: () => <p>the whole list</p>,
  });
  const thingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/things/$thing",
    component: () => <Screen />,
  });
  const routeTree = rootRoute.addChildren([thingsRoute, thingRoute]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // The router resolves its first match asynchronously, so a screen about to be
  // asserted on has to be waited for rather than read immediately.
  await router.load();
  return router;
};

/** A detail page over the stand-in resource, with three tabs and no mock backend. */
/**
 * The page over the stand-in resource.
 *
 * Takes its query as a prop so a test can hand it a pending or a failed response
 * without a second component, and so the "the same component, a different answer"
 * cases really are the same component. The route below wraps it, because a route's
 * component takes no props and passing one anyway is a type error rather than a
 * convention.
 */
const ThingDetail = ({
  query = result({ status: 200, data: THING }),
}: {
  query?: ReturnType<typeof result>;
}) => (
  <DetailPage<Thing>
    query={query}
    icon={Boxes}
    breadcrumb={{ label: "Things", to: "/things" }}
    error={(failure) => <p role="alert">{failure.code}</p>}
  >
    {(thing) => ({
      title: thing.name,
      identity: {
        id: thing.id,
        created: "2026-01-02T03:04:05.000Z",
        updated: "2026-02-03T04:05:06.000Z",
      },
      tabs: [
        { key: "overview", label: "Overview", content: <p>the overview of {thing.name}</p> },
        { key: "rows", label: "Rows", content: <p>the rows of {thing.name}</p> },
        { key: "notes", label: "Notes", content: <p>{thing.note ?? "no note"}</p> },
      ],
    })}
  </DetailPage>
);

/** `ThingDetail` as a route component: no props, the good answer. */
const DefaultThingDetail = () => <ThingDetail />;

describe("the detail archetype", () => {
  it("opens a resource the console has no screen for, with the identity block", async () => {
    await renderInRoute(DefaultThingDetail);

    expect(screen.getByRole("region", { name: "thing-one" })).toBeDefined();
    const block = document.querySelector('[data-identity="true"]');
    expect(block?.textContent).toContain("th_01hq2v7xk3");
    expect(block?.textContent).toContain("2026-01-02 03:04:05Z");
    expect(block?.textContent).toContain("2026-02-03 04:05:06Z");
  });

  it("reads the tab out of the URL and puts the others in it", async () => {
    const router = await renderInRoute(DefaultThingDetail);
    const bar = await screen.findByRole("navigation", { name: "thing-one tabs" });

    // Three tabs, and the first is showing because the URL named none.
    expect([...bar.querySelectorAll("a")].map((a) => a.dataset["tab"])).toEqual([
      "overview",
      "rows",
      "notes",
    ]);
    expect(document.querySelector('[data-tab-panel="overview"]')).not.toBeNull();
    expect(router.state.location.search).toEqual({});

    // A link to another tab, carrying the rest of the URL with it.
    const notes = bar.querySelector<HTMLAnchorElement>('[data-tab="notes"]');
    expect(notes?.getAttribute("href")).toBe("/things/thing-one?tab=notes");
  });

  it("opens on the tab the URL names", async () => {
    await renderInRoute(DefaultThingDetail, "/things/thing-one?tab=rows");
    const bar = await screen.findByRole("navigation", { name: "thing-one tabs" });

    expect(bar.querySelector('[data-tab="rows"]')?.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector('[data-tab-panel="rows"]')?.textContent).toBe(
      "the rows of thing-one",
    );
    // And only that one, so a page is not rendering three sections to show one.
    expect(document.querySelector('[data-tab-panel="overview"]')).toBeNull();
  });

  it("keeps a parameter it does not own, so a breadcrumb has something to carry back", async () => {
    await renderInRoute(DefaultThingDetail, "/things/thing-one?q=kumasi&sort=cores&tab=notes");
    await screen.findByRole("navigation", { name: "thing-one tabs" });

    // Switching tabs keeps the foreign parameters, and so does the breadcrumb: the
    // list's filters do not belong to this page and are not this page's to drop.
    const crumb = document.querySelector('[data-breadcrumb="list"]');
    expect(crumb?.getAttribute("href")).toBe("/things?q=kumasi&sort=cores");
  });

  it("shows a skeleton while pending and nothing else", async () => {
    await renderInRoute(() => <ThingDetail query={result(undefined, { isPending: true })} />);
    const loading = await screen.findByRole("generic", { hidden: true, name: "Loading" });
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("navigation", { name: "thing-one tabs" })).toBeNull();
  });

  it("hands a failure to the screen's own error, rather than showing an empty page", async () => {
    await renderInRoute(() => <ThingDetail query={result(FAILURE("upstream_unavailable"))} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("upstream_unavailable");
    // No tab bar, and no identity block: there is no resource to describe.
    expect(screen.queryByRole("navigation", { name: "thing-one tabs" })).toBeNull();
    expect(document.querySelector('[data-identity="true"]')).toBeNull();
  });

  it("narrowing on the response, not on the body: a 200 with an error body is a value", async () => {
    // The client's contract is a union discriminated on `status`. A screen that
    // narrowed on the body instead would call this an error; the archetype narrows on
    // `status`, so it is a resource -- and the record of that is the point of the
    // assertion rather than an accident of the fixture.
    const confused = {
      status: 200,
      // An error-shaped body on the success arm. It carries `code` and `requestId`,
      // so a screen that narrowed on the body -- the mistake `isSovrenError` exists
      // to warn about -- would call this a failure and render its error state.
      data: { ...THING, code: "not_found", requestId: "req_x" },
    };
    await renderInRoute(() => (
      <DetailPage<Thing>
        query={result(confused)}
        icon={Boxes}
        breadcrumb={{ label: "Things", to: "/things" }}
        error={(failure) => <p role="alert">{failure.code}</p>}
      >
        {(thing) => ({
          title: thing.name,
          identity: { id: thing.id, created: "", updated: "" },
          tabs: [{ key: "overview", label: "Overview", content: <p>loaded</p> }],
        })}
      </DetailPage>
    ));

    // A resource, not a failure: the tab bar and the identity block are on the page.
    expect(await screen.findByRole("region", { name: "thing-one" })).toBeDefined();
    expect(screen.getByText("loaded")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the table inside a detail tab", () => {
  const ThingTable = ({
    query = result(PAGE([THING])),
    more,
  }: {
    query?: ReturnType<typeof result> & { isFetching?: boolean };
    more?: { to: string; label: string };
  }) => (
    <DetailTable<Thing>
      caption="Things"
      query={query}
      columns={COLUMNS}
      rowKey={(thing) => thing.id}
      empty={{ title: "No Thing at all" }}
      {...(more === undefined ? {} : { more })}
    />
  );

  it("renders a collection the console has no screen for", async () => {
    await renderInRoute(() => <ThingTable />);
    const grid = await screen.findByRole("table", { name: "Things" });
    expect(grid.querySelectorAll("tr[data-row]")).toHaveLength(1);
    expect(screen.getByText("thing-one")).toBeDefined();
  });

  it("renders the empty state the screen wrote, not a blank table", async () => {
    await renderInRoute(() => <ThingTable query={result(PAGE([]))} />);
    expect(await screen.findByText("No Thing at all")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Things" })).toBeNull();
  });

  it("renders the error state with the code and the requestId, from the response alone", async () => {
    await renderInRoute(() => <ThingTable query={result(FAILURE("upstream_unavailable"))} />);
    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("upstream_unavailable");
    expect(alert.textContent).toContain("req_detail_archetype");
  });

  it("keeps the rows it had when the refresh fails, and marks them stale", async () => {
    /**
     * The failure arrives through state, so the second render of the *same* component
     * sees a failed refresh after a good one. A test that mounted two components
     * would be testing two screens rather than one screen changing -- and a state
     * change is what a react-query cache does when a refetch comes back with an
     * error, which is the thing being tested.
     */
    const Table = () => {
      const [broken, setBroken] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setBroken(true);
            }}
          >
            fail the next refresh
          </button>
          <ThingTable
            query={result(
              broken
                ? FAILURE("upstream_unavailable")
                : PAGE([THING, { ...THING, id: "th_2", name: "thing-two" }]),
            )}
          />
        </>
      );
    };

    await renderInRoute(Table);
    expect(screen.getByText("thing-one")).toBeDefined();
    expect(screen.getByText("thing-two")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "fail the next refresh" }));

    await waitFor(() => {
      expect(screen.getByText(/The last refresh of this section failed/)).toBeDefined();
    });
    // The rows stayed, and the failure is stated as a failure with its code -- not as
    // an empty table, and not as fresh data.
    expect(screen.getByText("thing-one")).toBeDefined();
    expect(screen.getByText("thing-two")).toBeDefined();
    expect(screen.getByText("upstream_unavailable")).toBeDefined();
  });

  it("says a section is bounded rather than paginating inside a detail page", async () => {
    // A page token in a detail page's URL would collide with the list's own token
    // that the breadcrumb is carrying back: two cursors, one parameter. So a section
    // states the bound and links out, which is where paginating belongs.
    const paged = {
      status: 200,
      data: { items: [THING], nextPage: "pt_eyJhIjoiVGhpbmctb25lIn0" },
    };
    await renderInRoute(() => (
      <ThingTable query={result(paged)} more={{ to: "/things", label: "Every Thing" }} />
    ));
    // The bound is stated in words, and the way out is the full list rather than a
    // second cursor in this page's URL.
    expect(await screen.findByText("More rows than this section shows.")).toBeDefined();
    expect(screen.getByRole("link", { name: /Every Thing/ }).getAttribute("href")).toBe("/things");
  });
});
