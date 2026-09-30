/**
 * Fleet → Tasks, in a browser, against the generated mock backend.
 *
 * The same seam as the Nodes list: the estate is seeded by the world builder,
 * the handlers are orval's, the client is orval's, and the only thing between
 * them is this screen and the archetype. The estate is seeded with a Task in
 * every state the vocabulary declares -- `queued`, `running`, `succeeded`,
 * `failed`, `cancelled` -- so the awkward cases are rows rather than fixtures
 * invented for a test.
 *
 * Expected values are literals or values read out of the estate by name. Nothing
 * here is recomputed the way the code computes it, or the test would agree by
 * construction and assert nothing.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole } from "../test/render-console";

/** The Tasks table, once it has rendered. */
const tasksTable = async (): Promise<HTMLElement> =>
  await screen.findByRole("table", { name: "Tasks" });

/** The rows of a table, header excluded. */
const rowsOf = (grid: HTMLElement): HTMLElement[] =>
  [...grid.querySelectorAll("tr[data-row]")] as HTMLElement[];

/** One row, found by the Task's own label in its identity column. */
const rowNamed = (grid: HTMLElement, name: string): HTMLElement => {
  const found = rowsOf(grid).find(
    (row) => row.querySelector('[data-column="name"]')?.textContent === name,
  );
  if (found === undefined)
    throw new Error(`no row named ${name} among ${String(rowsOf(grid).length)}`);
  return found;
};

/** One cell of one row, by column key. */
const cellOf = (row: HTMLElement, column: string): string =>
  row.querySelector(`[data-column="${column}"]`)?.textContent ?? "";

const currentUrl = (router: { state: { location: { href: string } } }): URL =>
  new URL(router.state.location.href, window.location.origin);

describe("Fleet → Tasks", () => {
  it("renders a row per seeded Task, with kind, target, state and start time", async () => {
    await renderConsole("/fleet/tasks");
    const grid = await tasksTable();

    // The header, plus the twenty-three Tasks the fleet estate is seeded with.
    expect(within(grid).getAllByRole("row")).toHaveLength(24);

    const create = rowNamed(grid, "create-grafana-canary");
    expect(cellOf(create, "kind")).toBe("vm_create");
    // The target as the Task recorded it: the guest it was building.
    expect(cellOf(create, "target")).toContain("grafana-canary");
    expect(cellOf(create, "target")).toContain("VM");
    expect(cellOf(create, "state")).toBe("running");
    // Eleven minutes ago, in the estate's clock.
    expect(cellOf(create, "started")).toMatch(/^2026-/);

    // And a run against a Site rather than a guest, so the column says which kind
    // of thing it was: an Ansible apply over a lab reads nothing like a create.
    const apply = rowNamed(grid, "terraform-accra");
    expect(cellOf(apply, "kind")).toBe("terraform_apply");
    expect(cellOf(apply, "target")).toContain("accra-lab");
    expect(cellOf(apply, "target")).toContain("Site");
  });

  it("says a Task that never started has not started, rather than showing a gap", async () => {
    await renderConsole("/fleet/tasks?state=queued");
    const grid = await tasksTable();

    // `startedAt` is null on a queued Task, and "—" in a column of timestamps
    // reads as missing data rather than as a Task no provisioner has claimed.
    const queued = rowNamed(grid, "restore-grafana-canary");
    expect(cellOf(queued, "started")).toBe("not started");
    expect(
      queued.querySelector('[data-column="started"] [data-started]')?.getAttribute("data-started"),
    ).toBe("never");
  });

  it("makes a failed Task visibly failed, with its reason, in the row", async () => {
    await renderConsole("/fleet/tasks?state=failed");
    const grid = await tasksTable();

    // The estate's three failures: a snapshot that could not be quiesced, an
    // apply that failed, and a connection test whose credential was rejected.
    expect(rowsOf(grid).map((row) => cellOf(row, "name"))).toEqual([
      "snapshot-grafana-canary-base",
      "terraform-takoradi",
      "test-connection-dokploy",
    ]);

    const snapshot = rowNamed(grid, "snapshot-grafana-canary-base");
    // The reason is in the row, not behind a click and not in a tooltip: this is
    // the column the ticket is about.
    expect(cellOf(snapshot, "reason")).toBe(
      "the guest agent did not answer within 30s, so the snapshot could not be quiesced",
    );
    // And it is a failure, not an absence: a distinct badge, in the tone a
    // failure gets everywhere else in the console.
    const badge = snapshot.querySelector('[data-column="state"] [data-state]');
    expect(badge?.getAttribute("data-state")).toBe("failed");
    expect(badge?.getAttribute("data-tone")).toBe("bad");

    // The other failed Task names its own reason, so the column is per row and
    // not a single sentence the screen made up.
    expect(cellOf(rowNamed(grid, "test-connection-dokploy"), "reason")).toBe(
      "the API key was rejected: 401 from the Dokploy instance",
    );
  });

  it("tells a Task that never ran from one that failed", async () => {
    await renderConsole("/fleet/tasks?state=queued");
    const grid = await tasksTable();

    const queued = rowNamed(grid, "restore-grafana-canary");
    const badge = queued.querySelector('[data-column="state"] [data-state]');
    expect(badge?.getAttribute("data-state")).toBe("queued");
    // Not painted as a fault, and carrying no reason at all: it has not failed,
    // it has not started, and the two are different facts.
    expect(badge?.getAttribute("data-tone")).not.toBe("bad");
    expect(cellOf(queued, "reason")).toBe("");
  });

  it("distinguishes a cancelled Task from a failed one, because they mean different things", async () => {
    await renderConsole("/fleet/tasks?state=cancelled");
    const grid = await tasksTable();

    const cancelled = rowNamed(grid, "create-lab-build-02");
    const badge = cancelled.querySelector('[data-column="state"] [data-state]');
    expect(badge?.getAttribute("data-state")).toBe("cancelled");
    // A human asked for this one. It is not a fault, so it is not painted as one.
    expect(badge?.getAttribute("data-tone")).not.toBe("bad");

    // The reason says who, not what broke.
    expect(cellOf(cancelled, "reason")).toBe("Cancelled by an operator from the console.");
    expect(cellOf(cancelled, "reason")).not.toContain("did not answer");
  });

  it("keeps a run whose target the console cannot open, because the target is a copy", async () => {
    await renderConsole("/fleet/tasks");
    const grid = await tasksTable();

    /**
     * The awkward case, as the estate can express it.
     *
     * `Task.target` is recorded at creation and never joined at read time, so a
     * run from last week is still here after the thing it worked on is gone. The
     * estate's own consistency check forbids a target that does not resolve --
     * which is the right rule for a *live* target, and the reason the console
     * cannot demonstrate this by finding a dangling reference. What it can
     * demonstrate is the property that makes it work: the target cell is a copy
     * read off the Task, and the only link in the row is the Task.
     */
    const apply = rowNamed(grid, "terraform-accra");
    expect(apply.querySelector('[data-column="target"] a')).toBeNull();
    expect(cellOf(apply, "target")).toContain("accra-lab");

    // A run against a Site -- a resource with no detail page in this console at
    // all -- is listed, and its row opens the Task rather than the target.
    const link = within(apply).getByRole("link");
    expect(link.getAttribute("href")).toBe("/fleet/tasks/tk_01hq2t0014");
  });

  it("links a row by the Task's id, which is the only key a Task answers to", async () => {
    await renderConsole("/fleet/tasks");
    const grid = await tasksTable();

    // `Task.name` is a label like "create web-01", not a key: a Task is never
    // renamed, so the identity link is its id.
    const row = rowNamed(grid, "create-netbird");
    expect(within(row).getByRole("link").getAttribute("href")).toBe("/fleet/tasks/tk_01hq2t0001");
    // And the row key is the id too, so a re-render cannot shuffle a page.
    expect(row.getAttribute("data-row")).toBe("tk_01hq2t0001");
  });

  it("offers cancel on a running Task and refuses it, with a code, on a finished one", async () => {
    await renderConsole("/fleet/tasks");
    const grid = await tasksTable();

    // Running: there is a process to signal, so the control is live.
    const running = within(rowNamed(grid, "create-grafana-canary")).getByRole("button", {
      name: "Cancel",
    }) as HTMLButtonElement;
    expect(running.disabled).toBe(false);

    // Succeeded: there is not, and the console says so with the contract's code
    // rather than hiding the control (R43).
    const finished = rowNamed(grid, "create-netbird");
    const refused = within(finished).getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(refused.disabled).toBe(true);
    expect(within(finished).getByText("action_not_permitted")).toBeDefined();
    expect(finished.textContent).toContain("Cancel is unavailable");
  });

  it("narrows by state, and keeps the filter in the URL", async () => {
    const { router } = await renderConsole("/fleet/tasks");
    await tasksTable();

    fireEvent.change(screen.getByLabelText("Filter Tasks by state"), {
      target: { value: "failed" },
    });

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("state")).toBe("failed");
    });
    await waitFor(() => {
      expect(rowsOf(screen.getByRole("table", { name: "Tasks" }))).toHaveLength(3);
    });
    expect(
      rowsOf(screen.getByRole("table", { name: "Tasks" })).map((row) => cellOf(row, "state")),
    ).toEqual(["failed", "failed", "failed"]);

    // The view is a link, so a colleague can be sent to exactly it.
    expect(router.state.location.href).toContain("state=failed");
    // And the filter does not throw away the console's own controls, which are the
    // only way to reproduce a failure in the dev server (R56).
    expect(currentUrl(router).searchParams.get("estate")).toBeNull();
  });

  it("narrows by kind as well as by state, and both at once", async () => {
    const { router } = await renderConsole("/fleet/tasks?state=succeeded");
    await tasksTable();

    fireEvent.change(screen.getByLabelText("Filter Tasks by kind"), {
      target: { value: "connection_test" },
    });

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("kind")).toBe("connection_test");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "Tasks" }));
      // Two of the three connection tests succeeded; the third is a failure, and
      // the state filter is still narrowing.
      expect(rows.map((row) => cellOf(row, "name"))).toEqual([
        "test-connection-proxmox",
        "test-connection-netbird",
      ]);
    });
  });

  it("ignores a state the vocabulary does not contain, rather than sending it", async () => {
    const { router } = await renderConsole("/fleet/tasks?state=stuck");
    const grid = await tasksTable();

    // `stuck` is not a Task state on purpose: a Task left running by a killed
    // process is marked failed on recovery, so there is no state that quietly
    // persists. A URL can say it; the contract cannot hold it, so nothing is sent
    // and the control is honest about what is being shown.
    expect(rowsOf(grid)).toHaveLength(23);
    expect((screen.getByLabelText("Filter Tasks by state") as HTMLSelectElement).value).toBe("");
    expect(currentUrl(router).searchParams.get("state")).toBe("stuck");
  });

  it("paginates on the opaque token, and says how many rows are on the page", async () => {
    const { router } = await renderConsole("/fleet/tasks?size=10");
    expect(rowsOf(await tasksTable())).toHaveLength(10);
    expect(screen.getByText("10 rows on this page")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("page")).toMatch(/^pt_/);
    });
    await waitFor(() => {
      expect(rowsOf(screen.getByRole("table", { name: "Tasks" }))).toHaveLength(10);
    });
  });

  it("renders an empty state that is not a blank screen, and offers the way out", async () => {
    await renderConsole("/fleet/tasks?state=queued&kind=ansible_run");

    expect(await screen.findByText("No Task matches this filter")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Tasks" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Clear the filters/ }));
    await waitFor(async () => {
      expect(await screen.findByRole("table", { name: "Tasks" })).toBeDefined();
    });
  });

  it("reads every state from the control plane, in the vocabulary it declares", async () => {
    await renderConsole("/fleet/tasks?size=25");
    const grid = await tasksTable();

    // The whole estate, with the states the control plane recorded. Counted by
    // hand from the estate file rather than recomputed from the code, because a
    // test that derived its expectation the way the screen derives it would agree
    // by construction.
    const states = rowsOf(grid).map((row) => cellOf(row, "state"));
    expect(states.filter((state) => state === "succeeded")).toHaveLength(17);
    expect(states.filter((state) => state === "failed")).toHaveLength(3);
    expect(states.filter((state) => state === "running")).toHaveLength(1);
    expect(states.filter((state) => state === "cancelled")).toHaveLength(1);
    expect(states.filter((state) => state === "queued")).toHaveLength(1);
    // And nothing outside the fixed vocabulary. There is no "stuck": a Task left
    // running by a killed process is marked failed on recovery, so no state
    // quietly persists.
    expect([...new Set(states)].sort()).toEqual([
      "cancelled",
      "failed",
      "queued",
      "running",
      "succeeded",
    ]);
  });

  it("a failed refresh changes no row's state, because the state is not the screen's", async () => {
    // The estate is a description of what exists and a control plane holds Task
    // state rather than the console's memory of it (R48). So a refresh that fails
    // leaves the rows and their states alone -- marked stale, and stated as a
    // failure, rather than blanked or invented.
    await renderConsole("/fleet/tasks?state=running");
    const grid = await tasksTable();
    expect(rowsOf(grid).map((row) => `${cellOf(row, "name")}:${cellOf(row, "state")}`)).toEqual([
      "create-grafana-canary:running",
    ]);

    fireEvent.change(screen.getByLabelText("Failure the mock backend serves"), {
      target: { value: "upstream-unavailable" },
    });

    await waitFor(() => {
      expect(screen.getByText(/^Stale — updated/)).toBeDefined();
    });
    expect(screen.getByText("upstream_unavailable")).toBeDefined();
    expect(
      rowsOf(screen.getByRole("table", { name: "Tasks" })).map(
        (row) => `${cellOf(row, "name")}:${cellOf(row, "state")}`,
      ),
    ).toEqual(["create-grafana-canary:running"]);
  });

  it("is in the Fleet sidebar as a page rather than as something not built yet", async () => {
    await renderConsole("/fleet/nodes");
    const nav = screen.getByRole("complementary", { name: "Fleet navigation" });

    // Rendered as a link, which is what `ready` means in the registry.
    const tasks = within(nav).getByRole("link", { name: "Tasks" });
    expect(tasks.getAttribute("href")).toBe("/fleet/tasks");
  });
});
