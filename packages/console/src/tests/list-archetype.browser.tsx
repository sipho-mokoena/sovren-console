/**
 * The list archetype, instantiated with a column set the console has no screen
 * for yet.
 *
 * This is the reuse acceptance criterion as a test. Three more agents will drop
 * Peers, VMs and Tasks into the archetype without editing it, so the thing worth
 * pinning is that it works for a row type it has never seen and inside a router
 * that is not the console's own -- which is also how each of those agents will
 * test their screen.
 *
 * The rows here are Peers-shaped rather than Node-shaped on purpose: a component
 * that happened to work because the Nodes screen shaped it correctly is not
 * reusable, and this is the assertion that it is not that.
 */

import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { Users } from "lucide-react";

import { ListPage } from "@/components/sovren/list-page";
import type { ListColumn } from "@/components/sovren/list-page";
import { StateBadge } from "@/components/sovren/state-badge";
import { useListState } from "@/lib/list-state";

/** A row the console has no screen for, standing in for a `Peer`. */
interface Row {
  id: string;
  name: string;
  state: string;
}

const ROWS: readonly Row[] = [
  { id: "pr_1", name: "ops-laptop-sipho", state: "connected" },
  { id: "pr_2", name: "ops-laptop-grace", state: "stale" },
  { id: "pr_3", name: "phone-sipho", state: "disconnected" },
];

/**
 * A query result in the shape the archetype reads.
 *
 * Built by hand rather than by a hook, because this test is about the archetype's
 * contract with a screen: what it needs from a generated hook's result, and what
 * it does with a page, an error and an empty page. The alternative -- a hook over
 * a fake endpoint -- would be testing the mock backend again, which the Nodes
 * test already does.
 */
const result = (data: unknown, overrides: { isPending?: boolean; isFetching?: boolean } = {}) => ({
  data,
  isPending: overrides.isPending ?? false,
  isFetching: overrides.isFetching ?? false,
  // A second ago, so the stamp reads "just now" whatever day the suite runs on.
  // A fixed instant would make this test fail in September and pass in December.
  dataUpdatedAt: Date.now() - 1_000,
  refetch: () => undefined,
});

const COLUMNS: readonly ListColumn<Row>[] = [
  {
    key: "name",
    header: "Peer",
    width: 200,
    identity: true,
    sortable: true,
    sortValue: (row) => row.name,
    render: (row) => row.name,
  },
  {
    key: "state",
    header: "Status",
    width: 120,
    sortable: true,
    sortValue: (row) => row.state,
    render: (row) => <StateBadge value={row.state} />,
  },
];

const OWNED = ["size", "page", "sort"] as const;
const SORTABLE = ["name", "state"] as const;

/**
 * Render a screen inside a router of its own.
 *
 * A memory history and a one-route tree, which is what a screen agent needs: the
 * archetype reads and writes the URL, so a test of it needs a URL, and it does
 * not need the console's shell to have one.
 */
const renderInRoute = async (Screen: () => React.ReactNode, initialEntry = "/things") => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const thingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/things",
    component: () => <Screen />,
  });
  const routeTree = rootRoute.addChildren([thingsRoute]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

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

const Things = () => {
  const list = useListState({ key: "test/things", owned: OWNED, sortable: SORTABLE });
  return (
    <ListPage<Row>
      title="Things"
      icon={Users}
      description="A column set the console has no screen for."
      query={result({ status: 200, data: { items: ROWS, nextPage: null } })}
      list={list}
      columns={COLUMNS}
      rowKey={(row) => row.id}
      empty={{ title: "No things" }}
    />
  );
};

describe("the list archetype", () => {
  it("renders a page of rows from a column set it has never seen", async () => {
    await renderInRoute(Things);

    const grid = screen.getByRole("table", { name: "Things" });
    expect(grid.querySelectorAll("tr[data-row]")).toHaveLength(3);
    expect(screen.getByText("ops-laptop-sipho")).toBeDefined();
    // The fixed shape: header, refresh with a last-updated stamp, table,
    // pagination bar.
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDefined();
    expect(screen.getByText("Updated just now")).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeDefined();
  });

  it("renders the empty state a screen wrote, not a blank table", async () => {
    const Empty = () => {
      const state = useListState({ key: "test/things", owned: OWNED, sortable: SORTABLE });
      return (
        <ListPage<Row>
          title="Things"
          icon={Users}
          query={result({ status: 200, data: { items: [], nextPage: null } })}
          list={state}
          columns={COLUMNS}
          rowKey={(row) => row.id}
          empty={{ title: "No things yet", body: "Nothing has been made." }}
        />
      );
    };
    await renderInRoute(Empty);

    expect(screen.getByText("No things yet")).toBeDefined();
    expect(screen.getByText("Nothing has been made.")).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders the error state a screen did not write, from the response alone", async () => {
    const Broken = () => {
      const state = useListState({ key: "test/things", owned: OWNED, sortable: SORTABLE });
      return (
        <ListPage<Row>
          title="Things"
          icon={Users}
          query={result({
            status: 503,
            data: {
              code: "upstream_unavailable",
              message: "NetBird is not answering.",
              requestId: "req_archetype",
              retryable: true,
            },
          })}
          list={state}
          columns={COLUMNS}
          rowKey={(row) => row.id}
          empty={{ title: "No things" }}
        />
      );
    };
    await renderInRoute(Broken);

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("upstream_unavailable");
    expect(alert.textContent).toContain("req_archetype");
  });

  it("keeps the rows it had when the refresh fails, and marks them stale", async () => {
    /**
     * Flipped between renders, so the second render of the *same* component sees
     * a failed refresh after a good one. A test that rendered two different
     * components would be testing two screens rather than one screen changing.
     */
    const page = { broken: false };

    const Stale = () => {
      const state = useListState({ key: "test/things", owned: OWNED, sortable: SORTABLE });
      return (
        <ListPage<Row>
          title="Things"
          icon={Users}
          query={
            page.broken
              ? result({
                  status: 503,
                  data: {
                    code: "upstream_unavailable",
                    message: "NetBird is not answering.",
                    requestId: "req_stale",
                  },
                })
              : result({ status: 200, data: { items: ROWS, nextPage: null } })
          }
          list={state}
          columns={COLUMNS}
          rowKey={(row) => row.id}
          empty={{ title: "No things" }}
        />
      );
    };

    const router = await renderInRoute(Stale);
    expect(screen.getByText("ops-laptop-sipho")).toBeDefined();

    // A refetch that fails replaces the response, and the archetype keeps the
    // last good page rather than blanking the table.
    page.broken = true;
    router.history.push("/things?refresh=1");

    await waitFor(() => {
      expect(screen.getByText(/The last refresh failed/)).toBeDefined();
    });
    expect(screen.getByText("ops-laptop-sipho")).toBeDefined();
    expect(screen.getByText(/^Stale — updated/)).toBeDefined();
  });
});
