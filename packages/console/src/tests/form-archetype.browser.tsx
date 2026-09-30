/**
 * The form archetype, on its own: no list, no shell, no mock backend.
 *
 * The reuse acceptance criterion as a test, and the same shape of one the list
 * and detail archetypes have. The create and edit screens are built on this
 * without editing it, so what is worth pinning is that a page works for a
 * resource the console has no screen for, and that the states a screen inherits
 * for free -- the page header, the breadcrumb, the second column, the field
 * wiring, the failure summary, the way out -- are actually inherited.
 *
 * ## Why the list is absent on purpose
 *
 * "A create form deep-linked directly, with no list behind it, still works" is
 * the criterion this file exists for, and the only honest way to test it is a
 * router that holds *no* list route: if the page quietly depended on a list
 * having been mounted -- on a filter, a page token, a query result -- a test with
 * a list would pass and a form linked into a chat would not.
 *
 * So the tree here is one route with no siblings, the page still submits, still
 * reports a refusal, and still has somewhere to go.
 *
 * What this file cannot reach is anything about a *real* list: the round trip
 * through the router, the address a form is reached with, the three ways out
 * agreeing after a real navigation. That is the screen test's job, and it is the
 * screen test's because only a real route has a real list to come back to.
 */

import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { HardDrive } from "lucide-react";
import type { ErrorResponse, Task } from "@sovren/client";

import { FormPage } from "@/components/sovren/form/form-page";
import { FormFailure } from "@/components/sovren/form/form-failure";
import { TextField, problemFor, problemsOf } from "@/components/sovren/form/field";
import {
  acceptedToast,
  readAcceptedTask,
  refusedToast,
} from "@/components/sovren/form/accepted-task";

/**
 * A form screen for a resource the console has no screen for, standing in for a
 * `Node` or a `Peer`. It supplies only what a screen supplies.
 */
const Page = ({ onSubmit }: { onSubmit?: () => void } = {}): ReactNode => {
  const [failure, setFailure] = useState<ErrorResponse | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  return (
    <FormPage
      icon={HardDrive}
      title="Create Thing"
      description="A thing, on a machine the console has no screen for."
      returnTo={{ label: "things", href: "/things?q=only" }}
      {...(onSubmit === undefined
        ? {}
        : {
            onSubmit: () => {
              setBusy(true);
              onSubmit();
            },
          })}
      submit={{ label: "Create the thing", busy }}
      failure={failure}
      note="A create is accepted with a Task rather than a finished thing."
      aside={{
        label: "The machine this lands on",
        content: <p data-aside="content">whatever the second column is for</p>,
      }}
    >
      <TextField
        label="Name"
        required
        value="a-thing"
        onChange={() => undefined}
        hint="A name the control plane will have opinions about."
        {...(problemFor(failure, "name") === undefined
          ? {}
          : { problem: problemFor(failure, "name") })}
      />
      <TextField
        label="Cores"
        required
        type="number"
        value="0"
        onChange={() => undefined}
        {...(problemFor(failure, "cores") === undefined
          ? {}
          : { problem: problemFor(failure, "cores") })}
      />
      <button
        type="button"
        onClick={() => {
          setFailure({
            code: "invalid_request",
            message: "2 fields could not be accepted as written.",
            requestId: "req_form_archetype",
            details: [
              {
                path: "cores",
                constraint: "atLeast1",
                message: "A thing needs at least one core.",
              },
              {
                path: "name",
                constraint: "nameTaken",
                message: "a-thing is already in the estate.",
              },
            ],
          });
        }}
      >
        Refuse it
      </button>
    </FormPage>
  );
};

/** The page, in a router that holds nothing but the page. */
const renderInRoute = async (Screen: () => ReactNode, initialEntry = "/things/new") => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const thingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/things/new",
    component: Screen,
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/things",
    component: () => <p>the list an operator was reading</p>,
  });
  const routeTree = rootRoute.addChildren([listRoute, thingsRoute]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await router.load();
  return router;
};

/** The form page, by what a screen is identified by. */
const page = (name: string): HTMLElement => {
  const found = screen
    .getAllByRole("region", { name })
    .find((element) => element.getAttribute("data-page") === "form");
  if (found === undefined) throw new Error(`no form page named ${name}`);
  return found;
};

describe("the form archetype", () => {
  it("is a page, not a dialog, and needs nothing behind it", async () => {
    await renderInRoute(Page);

    // R39: a form is a page of its own. The accessibility tree has to say so
    // too -- a `role="dialog"` on a full-page route is a form that reads as a
    // modal to a screen reader and invites the operator to look for something to
    // dismiss it with.
    const form = page("Create Thing");
    expect(form.getAttribute("data-page")).toBe("form");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Create Thing" })).toBeDefined();

    // A breadcrumb above the fields, and the page's own place in the console said
    // the way every other page says it.
    const crumb = within(form).getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "things" }).getAttribute("href")).toBe(
      "/things?q=only",
    );
    expect(within(crumb).getByText("Create Thing")).toBeDefined();

    // Nothing is behind it. That is the criterion, and a tree with no list route
    // is the only way to assert it rather than assume it.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("the list an operator was reading")).toBeNull();

    // The submit control is the page's, in the page's own action row.
    expect(within(form).getByRole("button", { name: "Create the thing" })).toBeDefined();
  });

  it("sends the operator back by the crumb and by Cancel, to the same address", async () => {
    const router = await renderInRoute(Page);
    const form = page("Create Thing");

    /**
     * The two ways out are one address, and the archetype holds them together.
     *
     * A form reached from a filtered, sorted, third page of a list has to put the
     * operator back on *that* list, and three ways out exist: the browser's back
     * button (which works because the operator arrived on a link), the crumb, and
     * Cancel. The last two are hrefs this archetype builds, from one required
     * prop, so they cannot disagree -- and Cancel is an anchor, so
     * `getAttribute("href")` is the assertion rather than a click.
     */
    const crumb = within(form).getByRole("navigation", { name: "Breadcrumb" });
    const cancel = within(form).getByRole("link", { name: "Cancel" });
    expect(cancel.getAttribute("href")).toBe(
      within(crumb).getByRole("link", { name: "things" }).getAttribute("href"),
    );
    expect(cancel.getAttribute("href")).toBe("/things?q=only");

    // And following it arrives where the crumb points, list and all.
    fireEvent.click(cancel);
    await vi.waitFor(() => {
      expect(screen.getByText("the list an operator was reading")).toBeDefined();
    });
    expect(router.state.location.pathname).toBe("/things");
  });

  it("gives the width beside the fields to a second, named column", async () => {
    await renderInRoute(Page);
    const form = page("Create Thing");

    // Not decoration: the measure is capped so a field is readable, and the rest
    // of a wide window is for something worth reading. A named landmark, because
    // "the fields" and "the thing they are about" are two regions an operator
    // navigating by region should be able to tell apart.
    const aside = within(form).getByRole("complementary", { name: "The machine this lands on" });
    expect(within(aside).getByText("whatever the second column is for")).toBeDefined();
  });

  it("submits from Enter in a field, and not twice while it is working", async () => {
    const onSubmit = vi.fn();
    await renderInRoute(() => <Page onSubmit={onSubmit} />);
    const form = page("Create Thing");

    // A form a keyboard user can submit from any field, which is what wrapping
    // the controls in a real `<form>` buys.
    fireEvent.submit(
      within(form).getByRole("textbox", { name: /Name/ }).closest("form") as HTMLFormElement,
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // A busy submission is not a second one, and the control says so rather than
    // silently doing nothing: the name grows a "working" and the control is
    // disabled, so a second Enter has nothing to press.
    const working = within(form).getByRole("button", { name: /Create the thing/ });
    expect((working as HTMLButtonElement).disabled).toBe(true);
    expect(working.getAttribute("aria-busy")).toBe("true");
    expect(working.textContent).toContain("working");
    fireEvent.submit(
      within(form).getByRole("textbox", { name: /Name/ }).closest("form") as HTMLFormElement,
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("puts a refused submission on the control that caused it, and names the constraint", async () => {
    await renderInRoute(Page);
    const form = page("Create Thing");

    fireEvent.click(within(form).getByRole("button", { name: "Refuse it" }));

    // The summary: the code, the requestId, and every `path · constraint` the
    // control plane sent. This is what an operator quotes in a report.
    const alert = within(form).getByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("invalid_request");
    expect(alert.textContent).toContain("req_form_archetype");
    expect(alert.textContent).toContain("atLeast1");
    expect(alert.textContent).toContain("nameTaken");

    // And the same facts on the controls themselves, wired for a keyboard and a
    // screen reader rather than only drawn in red.
    // A control's description may be more than one element -- a hint and a
    // problem -- so what a test reads is every id the control points at.
    const describedBy = (control: HTMLElement): string => {
      const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    };

    const cores = within(form).getByRole("spinbutton", { name: /Cores/ });
    expect(cores.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(cores)).toContain("atLeast1");
    expect(describedBy(cores)).toContain("A thing needs at least one core.");

    const name = within(form).getByRole("textbox", { name: /Name/ });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(name)).toContain("nameTaken");
    // The hint is still there too, rather than replaced by the complaint.
    expect(describedBy(name)).toContain("opinions about");
  });

  it("moves the focus to the first field the refusal named", async () => {
    await renderInRoute(Page);
    const form = page("Create Thing");

    fireEvent.click(within(form).getByRole("button", { name: "Refuse it" }));

    // The first refused field in reading order is where an operator who pressed
    // Enter lands, and this form's first field is the one the control plane
    // complained about twice over. A refusal that leaves the focus on the button
    // that was pressed makes an operator read the whole form to find out what was
    // wrong.
    expect(document.activeElement).toBe(within(form).getByRole("textbox", { name: /Name/ }));
  });

  it("renders a failure that names no field, and points at it", async () => {
    render(
      <FormFailure
        error={{
          code: "not_found",
          message: "No Node answers to kumasi-rig-09.",
          requestId: "req_x",
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(alert.textContent).toContain("No Node answers to kumasi-rig-09.");
    expect(alert.textContent).toContain("req_x");
    // Nothing to point at, so the summary is the whole of it.
    expect(problemsOf({ code: "not_found", message: "", requestId: "" })).toHaveLength(0);
  });
});

describe("a long action's answer", () => {
  /** A `Task` as the document declares it. A literal, not a recomputation. */
  const TASK = {
    id: "tk_pending-web-07",
    name: "create-web-07",
    kind: "vm_create",
    target: { resource: "vm", id: "vm_pending-web-07", name: "web-07" },
    state: "queued",
    terminalState: null,
    failureReason: null,
    cancelledReason: null,
    startedAt: null,
    finishedAt: null,
    lastSeq: null,
    logCount: 0,
    created: "2026-09-29T06:00:00Z",
    updated: "2026-09-29T06:00:00Z",
    disabledActions: [],
  } as const;

  it("reads the Task off a 202, because a create does not answer 200", () => {
    // This is the trap the whole module is here for. `readOne` treats anything
    // that is not a 200 as an error, and a create answers 202 -- so a create read
    // the other way round reports a Task body as a failure the control plane
    // never sent.
    const read = readAcceptedTask({ status: 202, data: TASK });
    expect(read.kind).toBe("accepted");
    expect(read.kind === "accepted" && read.task.id).toBe("tk_pending-web-07");
  });

  it("reads a refusal off every other status, code and requestId intact", () => {
    for (const status of [400, 404, 409, 422, 500]) {
      const read = readAcceptedTask({
        status,
        data: { code: "conflict", message: "no", requestId: `req_${String(status)}` },
      });
      expect(read.kind).toBe("refused");
      expect(read.kind === "refused" && read.error.requestId).toBe(`req_${String(status)}`);
    }
  });

  it("reports what crossed the wire, and nothing about how it ends", () => {
    const toast = acceptedToast("Creating", "web-07", TASK as never);

    // Present tense, the resource's own name, and the four facts that arrived.
    expect(toast.title).toBe("Creating web-07");
    expect(toast.detail).toBe("202 · vm_create · queued · tk_pending-web-07");
    // `queued` is what the control plane said, and the console does not improve
    // on it: the boot takes four minutes and nothing has observed the end of it.
    expect(toast.title).not.toContain("succeeded");
  });

  it("reports a refusal as a refusal, with the two things an operator can quote", () => {
    const toast = refusedToast("delete", "postgres-main", {
      code: "conflict",
      message: "it is in use",
      requestId: "req_delete",
    });

    expect(toast.title).toBe("The control plane will not delete postgres-main");
    expect(toast.detail).toBe("conflict · req_delete");
  });

  /**
   * The destructive action's 202, asserted here rather than through the screen.
   *
   * `VMDelete` answers `202` with a `Task` like every other long action, and it is
   * deliberately **not** served by the mock backend -- a screen test that clicked
   * through the confirmation would leave the worker unable to finish, because a
   * test cannot add a handler of its own. So what is pinned here is the half that
   * is the console's rather than the backend's: the narrow, and the wording. The
   * confirmation itself is asserted on the screen, where it is rendered.
   */
  it("reports a teardown as a request for one, never as a finished deletion", () => {
    const task = {
      ...TASK,
      id: "tk_pending-vm_delete",
      name: "delete-postgres-main",
      kind: "vm_delete",
    } as unknown as Task;
    const read = readAcceptedTask({ status: 202, data: task });
    expect(read.kind).toBe("accepted");

    const toast = acceptedToast("Deleting", "postgres-main", task);
    expect(toast.title).toBe("Deleting postgres-main");
    expect(toast.detail).toBe("202 · vm_delete · queued · tk_pending-vm_delete");
    // The word an operator would act on wrongly. The teardown is a Task nobody
    // has watched finish, and the console never claims it did (R44).
    expect(toast.title).not.toMatch(/deleted/i);
  });
});
