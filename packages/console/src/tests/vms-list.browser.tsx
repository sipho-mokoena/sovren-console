/**
 * The VMs list, in a browser, against the generated mock backend.
 *
 * The estate is seeded by the world builder, the handlers are the ones orval
 * generated from the document, the client is the one orval generated, and the only
 * thing between them is the console. A screen that renders seeded rows here is a
 * screen that will render real rows.
 *
 * Expected values are literals, or values read out of the estate file by name. A
 * test that recomputed its expectation the way the code computes it would agree by
 * construction and assert nothing.
 *
 * ## The awkward cases are the point
 *
 * Four rows in this estate exist so that a screen can be caught being wrong about
 * them, and every one of them is asserted below: a guest whose create Task is
 * still running (`grafana-canary`), a guest whose Task failed and says why
 * (`legacy-erp`), a guest that never got as far as enrolling (`golden-tpl`), and
 * a migration the document cannot perform on anything at all.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Vm } from "@sovren/client";

import { RunStateCell, migrateRefusal } from "../routes/fleet/vms/-list";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { renderConsole } from "../test/render-console";

/** The VMs table, once it has rendered. */
const vmsTable = async (): Promise<HTMLElement> =>
  await screen.findByRole("table", { name: "VMs" });

/** The address the console is at, as a URL. */
const currentUrl = (router: { state: { location: { href: string } } }): URL =>
  new URL(router.state.location.href, window.location.origin);

/** The rows of a table, header excluded. */
const rowsOf = (grid: HTMLElement): HTMLElement[] =>
  [...grid.querySelectorAll("tr[data-row]")] as HTMLElement[];

/** One row, found by the name in its identity column. */
const rowNamed = (grid: HTMLElement, name: string): HTMLElement => {
  const found = rowsOf(grid).find(
    (row) => row.querySelector('[data-column="name"]')?.textContent === name,
  );
  if (found === undefined)
    throw new Error(`no row named ${name} among ${String(rowsOf(grid).length)}`);
  return found;
};

/** Whether the table has a row with this name. */
const hasRow = (grid: HTMLElement, name: string): boolean =>
  rowsOf(grid).some((row) => row.querySelector('[data-column="name"]')?.textContent === name);

/** One cell of one row, by column key. */
const cellOf = (row: HTMLElement, column: string): string =>
  row.querySelector(`[data-column="${column}"]`)?.textContent ?? "";

/** The run state, as the row rendered the contract's value. */
const runStateOf = (row: HTMLElement): string | null =>
  row.querySelector('[data-column="runState"] [data-run-state]')?.getAttribute("data-run-state") ??
  null;

/** The tone the shared state table gave that state. */
const toneOf = (row: HTMLElement): string | null =>
  row
    .querySelector('[data-column="runState"] [data-run-state] [data-state]')
    ?.getAttribute("data-tone") ?? null;

/** The migrate control in a row, whatever its label says. */
const migrateOf = (row: HTMLElement): HTMLButtonElement =>
  within(row).getByRole("button", { name: "Migrate" }) as HTMLButtonElement;

describe("Fleet → VMs", () => {
  it("renders a page of seeded VMs, and stops at the document's default page size", async () => {
    await renderConsole("/fleet/vms");
    const grid = await vmsTable();

    // The header, plus twenty-five rows: the document's default `size`, and a
    // server-side cut rather than a client-side one.
    expect(within(grid).getAllByRole("row")).toHaveLength(26);
    expect(hasRow(grid, "netbird")).toBe(true);
  });

  it("puts the node, the overlay address, the CPU floor and the memory on one row", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();
    const row = rowNamed(grid, "postgres-main");

    // The join is a column, not a query: the document hands the VM its Node, and
    // nothing here correlates two lists. So the machine, the guest and the address
    // are one row, which is the whole ticket.
    expect(cellOf(row, "node")).toBe("accra-server-02");
    expect(cellOf(row, "overlay")).toContain("100.64.0.47");
    expect(cellOf(row, "memory")).toBe("32 GiB");
    expect(cellOf(row, "cpu")).toContain("kvm64");
    expect(cellOf(row, "purpose")).toBe("service");
    expect(runStateOf(row)).toBe("running");
    expect(cellOf(row, "site")).toBe("accra-lab");

    // The same guest seen on a row with nothing to join: the Node column names the
    // machine rather than an id, because a name is what a path parameter and a
    // console both speak.
    expect(cellOf(rowNamed(grid, "wireguard-lab"), "node")).toBe("kumasi-rig-01");
    expect(cellOf(rowNamed(grid, "wireguard-lab"), "site")).toBe("kumasi-store");
  });

  it("shows the CPU model as the fleet's floor, and refuses the migration it cannot perform", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();

    // R63: every VM in the estate runs `kvm64`, the lowest common denominator --
    // including the ones hosted on a 2019 Ryzen and the ones on a 2009 Core 2 Duo.
    // A table that reported the host's CPU here would be reporting a fiction.
    for (const row of rowsOf(grid)) {
      expect(cellOf(row, "cpu")).toContain("kvm64");
    }

    // R64: no live migration across mixed or heterogeneous CPUs -- and the document
    // declares no `migrate` operation at all. So no row offers one: the control is
    // rendered, greyed, and labelled with the sovren code that refuses it.
    for (const row of rowsOf(grid)) {
      expect(migrateOf(row).disabled).toBe(true);
      expect(within(row).getByText("action_not_permitted")).toBeDefined();
    }

    // Which refusal a row shows is a *precedence*, and this is where it is
    // asserted. `legacy-erp` has a refusal the control plane declared for it, so
    // that one wins over anything derived from `canMigrate: false`. The estate
    // used to drop `disabledActions` on the way out, which made the declared
    // branch dead code and forced this assertion to check the fallback; now the
    // declared refusal is what renders, and the rule is the thing worth pinning.
    const refused = migrateOf(rowNamed(grid, "legacy-erp"));
    expect(refused.disabled).toBe(true);
    expect(refused.getAttribute("title")).toBe(
      "The host Node's CPU is below the fleet floor, so this VM cannot be migrated anywhere in the estate.",
    );

    // And the fallback still answers for a VM nobody declared anything about,
    // which is the branch that has to survive the branch above it winning.
    const undeclared = migrateRefusal({
      id: "vm_undeclared",
      name: "undeclared",
      node: { id: "nd_accra_desk_01", name: "accra-desk-01" },
      site: { id: "st_accra", name: "accra-lab" },
      purpose: "workload",
      cpuModel: "kvm64",
      cores: 1,
      memoryBytes: 536_870_912,
      runState: "stopped",
      overlay: null,
      transitionalTask: null,
      failureReason: null,
      canMigrate: false,
      disabledActions: [],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });
    expect(undeclared.reason).toBe("action_not_permitted");
    expect(undeclared.explanation).toContain("CPU model is below the fleet floor");

    // And the sentence is reachable by a keyboard and a screen reader, not only by
    // a pointer hovering a title.
    expect(refused.getAttribute("aria-describedby")).not.toBeNull();
    expect(rowNamed(grid, "legacy-erp").textContent).toContain("Migrate is unavailable");
  });

  it("makes a VM whose create Task is still running visibly in flight", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();
    const canary = rowNamed(grid, "grafana-canary");
    const state = canary.querySelector('[data-column="runState"] [data-run-state]');

    // `transitional` means a Task is running and the outcome has not been observed
    // yet. It is neither running nor stopped, and the console says which of the
    // three it is rather than letting a badge imply.
    expect(runStateOf(canary)).toBe("transitional");
    expect(within(canary).getByText("transitional")).toBeDefined();
    expect(within(canary).queryByText("running")).toBeNull();
    expect(within(canary).queryByText("stopped")).toBeNull();

    // The Task in flight is named inline by the contract, so the operator can go
    // and watch the work rather than infer it. The id is an id, and the kind and
    // state behind it are reachable from the same cell.
    const task = state?.querySelector("[data-task]") ?? null;
    expect(task?.getAttribute("data-task")).toMatch(/^tk_/);
    expect(task?.getAttribute("title")).toBe("vm_create · running");
  });

  it("makes a VM whose Task failed visibly failed, distinct from stopped, and names the reason", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();
    const erp = rowNamed(grid, "legacy-erp");

    // Not stopped. A failure is never mistaken for an operator having asked for it.
    expect(runStateOf(erp)).toBe("failed");
    expect(within(erp).getByText("failed")).toBeDefined();
    expect(within(erp).queryByText("stopped")).toBeNull();

    // The reason, in the control plane's own words. This is the difference between
    // "something went wrong" and a machine an operator can act on.
    expect(cellOf(erp, "runState")).toContain(
      "the guest agent stopped responding after the storage controller reset, and the VM was not restarted",
    );
    expect(erp.querySelector('[data-failure="reported"]')).not.toBeNull();

    // And it is a different colour as well as a different word, because a dense
    // table is read by tone before it is read.
    expect(toneOf(erp)).toBe("bad");
  });

  it("keeps the four ordinary states in four tones, from one shared table", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();

    // sky for in flight, emerald for up, muted for stopped, destructive for failed.
    // Four states a person must never confuse, and they do not have to read a word
    // to tell them apart.
    expect(toneOf(rowNamed(grid, "grafana-canary"))).toBe("info");
    expect(toneOf(rowNamed(grid, "postgres-main"))).toBe("ok");
    expect(toneOf(rowNamed(grid, "golden-tpl"))).toBe("neutral");
    expect(toneOf(rowNamed(grid, "legacy-erp"))).toBe("bad");

    // A stopped VM carries no reason and no Task: there is nothing to report, and
    // a line saying so would be inventing a fact.
    const stopped = rowNamed(grid, "golden-tpl");
    expect(cellOf(stopped, "runState")).toBe("stopped");
    expect(stopped.querySelector("[data-failure]")).toBeNull();
    expect(stopped.querySelector("[data-task]")).toBeNull();
  });

  it("makes a VM with no overlay address visibly without one", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();

    // Four in this estate have not enrolled: a template that has never been
    // started, two builds that never finished, and the canary still being created.
    for (const name of ["golden-tpl", "spare-bench-01", "lab-build-02", "grafana-canary"]) {
      const row = rowNamed(grid, name);
      expect(
        row.querySelector('[data-column="overlay"] [data-overlay]')?.getAttribute("data-overlay"),
      ).toBe("null");
      expect(within(row).getByText("not enrolled")).toBeDefined();
    }

    // The same word the Nodes list uses for a machine that never enrolled, so one
    // word means one thing across the console -- and never an empty cell, which in
    // a nine-column table reads as healthy.
    const enrolled = rowNamed(grid, "postgres-main");
    expect(
      enrolled
        .querySelector('[data-column="overlay"] [data-overlay]')
        ?.getAttribute("data-overlay"),
    ).toBe("enrolled");
    expect(within(enrolled).queryByText("not enrolled")).toBeNull();

    // The estate's own consistency: a stopped guest and a transitional one are
    // different reasons for the same absence, and the screen does not invent a
    // difference the contract did not state.
    expect(runStateOf(rowNamed(grid, "golden-tpl"))).toBe("stopped");
    expect(runStateOf(rowNamed(grid, "grafana-canary"))).toBe("transitional");
  });

  it("renders `purpose`, so a Service host is distinguishable from an experiment", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();

    // The three values the contract declares, spelled as it spells them.
    expect(cellOf(rowNamed(grid, "postgres-main"), "purpose")).toBe("service");
    expect(cellOf(rowNamed(grid, "netbird"), "purpose")).toBe("infrastructure");
    expect(cellOf(rowNamed(grid, "legacy-erp"), "purpose")).toBe("workload");

    for (const row of rowsOf(grid)) {
      const purpose = row.querySelector('[data-column="purpose"] [data-purpose]');
      expect(["infrastructure", "service", "workload"]).toContain(
        purpose?.getAttribute("data-purpose"),
      );
    }
  });

  it("filters by purpose and by run state, both in the URL", async () => {
    const { router } = await renderConsole("/fleet/vms?size=60");
    await vmsTable();

    // The choices are the document's, so a value the document removes leaves
    // nothing behind and one it adds appears on the next regeneration.
    expect(
      within(screen.getByRole("group", { name: "Filter VMs by purpose" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["infrastructure", "service", "workload"]);
    expect(
      within(screen.getByRole("group", { name: "Filter VMs by run state" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["transitional", "running", "stopped", "paused", "suspended", "failed"]);

    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter VMs by purpose" })).getByRole("button", {
        name: "service",
      }),
    );
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("purpose")).toBe("service");
    });
    await waitFor(() => {
      // The thirteen guests that host a Service, and not one of the other fourteen.
      expect(rowsOf(screen.getByRole("table", { name: "Infrastructure" }))).toHaveLength(13);
    });
    // A purpose filter is also a view, and the heading says so: `service` is one
    // of the two answers to "which kind of machine am I looking at".
    expect(screen.getByRole("heading", { name: "Infrastructure" })).toBeDefined();
    const grid = screen.getByRole("table", { name: "Infrastructure" });
    expect(hasRow(grid, "postgres-main")).toBe(true);
    expect(hasRow(grid, "netbird")).toBe(false);
    expect(hasRow(grid, "legacy-erp")).toBe(false);
    for (const row of rowsOf(grid)) {
      expect(
        row.querySelector('[data-column="purpose"] [data-purpose]')?.getAttribute("data-purpose"),
      ).toBe("service");
    }

    // The run-state filter can ask for the two states the word alone cannot settle.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter VMs by run state" })).getByRole("button", {
        name: "transitional",
      }),
    );
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("runState")).toBe("transitional");
    });
    await waitFor(() => {
      // One VM in the estate is still being built.
      const narrowed = screen.getByRole("table", { name: "Infrastructure" });
      expect(rowsOf(narrowed)).toHaveLength(1);
      expect(runStateOf(rowNamed(narrowed, "grafana-canary"))).toBe("transitional");
    });
    // The purpose filter is still on underneath, and the two agree.
    expect(currentUrl(router).searchParams.get("purpose")).toBe("service");

    // And the failed one, which is a workload rather than a Service host, is not in
    // either view -- the two filters are both the control plane's.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter VMs by run state" })).getByRole("button", {
        name: "failed",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("table")).toBeNull();
    });
    expect(await screen.findByText("No VM is failed")).toBeDefined();
  });

  it("puts a sort in the URL and orders the rows it is showing", async () => {
    const { router } = await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();
    fireEvent.click(within(grid).getByRole("button", { name: /^State/ }));

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("runState");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "VMs" }));
      // Ascending over the contract's own six run states, which happen to order
      // failed first and transitional last. Both awkward rows land at the ends of
      // the table, which is where an operator scanning for trouble looks.
      expect(runStateOf(rows[0] as HTMLElement)).toBe("failed");
      expect(runStateOf(rows.at(-1) as HTMLElement)).toBe("transitional");
    });

    // The same header again reverses it, in the URL.
    fireEvent.click(
      within(screen.getByRole("table", { name: "VMs" })).getByRole("button", { name: /^State/ }),
    );
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("-runState");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "VMs" }));
      expect(runStateOf(rows[0] as HTMLElement)).toBe("transitional");
    });

    // And by purpose, the other sortable column the ticket names.
    fireEvent.click(
      within(screen.getByRole("table", { name: "VMs" })).getByRole("button", { name: /^Purpose/ }),
    );
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("purpose");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "VMs" }));
      expect(cellOf(rows[0] as HTMLElement, "purpose")).toBe("infrastructure");
      expect(cellOf(rows.at(-1) as HTMLElement, "purpose")).toBe("workload");
    });
  });

  it("paginates on the opaque token the server hands out, never an offset", async () => {
    const { router } = await renderConsole("/fleet/vms?size=25");
    expect(rowsOf(await vmsTable())).toHaveLength(25);

    const next = screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement;
    fireEvent.click(next);

    const token = currentUrl(router).searchParams.get("page");
    expect(token).toMatch(/^pt_/);
    expect(Number.isNaN(Number(token))).toBe(true);

    await waitFor(() => {
      // The last two guests in the estate's order are the two the awkward cases
      // live on, which is a coincidence this test is glad of rather than a
      // dependency: the point is that the second page is a different page.
      const grid = screen.getByRole("table", { name: "VMs" });
      expect(rowsOf(grid)).toHaveLength(2);
      expect(hasRow(grid, "grafana-canary")).toBe(true);
      expect(hasRow(grid, "legacy-erp")).toBe(true);
    });
  });

  it("renders the error state, the stale view and the empty state as Nodes does", async () => {
    await renderConsole("/fleet/vms?sentinel=conflict");
    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("conflict");
    expect(alert.textContent).toMatch(/requestId\s*req_/);
  });

  it("distinguishes a stale view from a broken one, and never calls a failed refresh fresh", async () => {
    const { router } = await renderConsole("/fleet/vms");
    await vmsTable();
    expect(screen.getByText("Updated just now")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Failure the mock backend serves"), {
      target: { value: "upstream-unavailable" },
    });
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sentinel")).toBe("upstream-unavailable");
    });
    await waitFor(() => {
      expect(screen.getByText(/^Stale — updated/)).toBeDefined();
    });

    // The rows stayed, the failure is stated as a failure, and the stamp says the
    // data is old rather than claiming it was just refreshed.
    expect(rowNamed(await vmsTable(), "netbird")).toBeDefined();
    expect(screen.getByText("upstream_unavailable")).toBeDefined();
  });

  it("renders an empty state that is not a blank screen", async () => {
    await renderConsole("/fleet/vms?q=no-such-machine");

    expect(await screen.findByText("No VM matches “no-such-machine”")).toBeDefined();
    expect(screen.getByRole("button", { name: /Clear the filters/ })).toBeDefined();
  });

  it("offers the create action as a link to the form's own route, carrying this view", async () => {
    await renderConsole("/fleet/vms?purpose=service&sort=runState&size=60");
    // `purpose=service` is a view as well as a filter, so the table is the
    // Infrastructure list. The create link below is the same either way.
    await screen.findByRole("table", { name: "Infrastructure" });

    // R49: the form is a route, so the create action is an anchor and can be
    // copied, bookmarked and middle-clicked. It is no longer a greyed button --
    // that was the placeholder this ticket replaced.
    const create = screen.getByRole("link", { name: "Create VM" });
    const href = new URL(create.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/vms/new");

    // R50: the panel opens over *this* view, so the link carries the filters, the
    // sort and the page size the operator was reading. Dropping them would put
    // them back on page one of an unfiltered list when they closed the panel.
    expect(href.searchParams.get("purpose")).toBe("service");
    expect(href.searchParams.get("sort")).toBe("runState");
    expect(href.searchParams.get("size")).toBe("60");
  });

  it("gives every row an edit link to that VM's own form route", async () => {
    await renderConsole("/fleet/vms?size=60");
    const grid = await vmsTable();
    const row = rowNamed(grid, "postgres-main");

    const edit = within(row).getByRole("link", { name: "Edit" });
    const href = new URL(edit.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/vms/postgres-main/edit");

    // And the panel it opens over this list, filters and all.
    expect(href.searchParams.get("size")).toBe("60");
  });

  it("reads a different estate from the URL, and says which one it is serving", async () => {
    await renderConsole("/fleet/vms?estate=compact");

    // The compact estate is three VMs, and it carries the same awkward cases at one
    // row each: one in flight and one failed.
    await waitFor(() => {
      expect(rowsOf(screen.getByRole("table", { name: "VMs" }))).toHaveLength(3);
    });
    const grid = screen.getByRole("table", { name: "VMs" });
    expect(runStateOf(rowNamed(grid, "sovren-cp"))).toBe("transitional");
    expect(runStateOf(rowNamed(grid, "legacy-erp"))).toBe("failed");
    expect(rowNamed(grid, "sovren-cp").querySelector('[data-overlay="null"]')).not.toBeNull();
    expect(screen.getByText("serving the compact estate")).toBeDefined();
  });
});

describe("a VM state the estate does not currently contain", () => {
  /**
   * The two null branches of the run-state cell, rendered directly.
   *
   * `transitionalTask` and `failureReason` are both `| null` in the contract, and
   * no VM in the fleet estate is in a state where either is null -- so a screen
   * could render both branches as an absent line and every other test here would
   * still pass. The literals below are a `Vm` the contract allows and this estate
   * happens not to hold, and what is asserted is what the cell puts on screen.
   */
  const base: Vm = {
    id: "vm_01hq2v0000",
    name: "no-such-vm",
    node: { id: "nd_01hq2n0000", name: "some-node" },
    site: { id: "st_01hq2sa000", name: "some-site", description: null },
    purpose: "workload",
    cpuModel: "kvm64",
    cores: 2,
    memoryBytes: 4 * 1024 ** 3,
    runState: "failed",
    overlay: null,
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    created: "2026-09-29T05:00:00.000Z",
    updated: "2026-09-29T05:00:00.000Z",
  };

  it("says so when a failed VM carries no reason, rather than showing an empty cell", () => {
    render(
      <span data-column="runState">
        <RunStateCell vm={base} />
      </span>,
    );

    // The badge is still `failed`: the state is the contract's whatever else is
    // missing. The missing reason is a separate, visible fact.
    expect(screen.getByText("failed")).toBeDefined();
    expect(screen.getByText("no reason reported")).toBeDefined();
    expect(document.querySelector("[data-failure]")?.getAttribute("data-failure")).toBe("absent");
  });

  it("says so when a transitional VM names no Task, rather than implying nothing is in flight", () => {
    render(
      <span data-column="runState">
        <RunStateCell vm={{ ...base, runState: "transitional" }} />
      </span>,
    );

    expect(screen.getByText("transitional")).toBeDefined();
    expect(screen.getByText("in flight, no Task named")).toBeDefined();
    expect(document.querySelector("[data-task]")?.getAttribute("data-task")).toBe("absent");
  });

  it("refuses migration on a VM that could otherwise be migrated, because the contract has no such operation", () => {
    // Every VM in the estate is seeded with `canMigrate: false`, so the floor rule
    // answers for all of them and the third branch -- a VM above the floor, refused
    // because there is no migrate operation to perform -- is never reached from a
    // row. It is the ticket's own point, so it is asserted against a `Vm` the
    // contract allows: the control is rendered, greyed, and names the reason.
    render(
      <DisabledActionButton
        action="migrate"
        refusal={migrateRefusal({ ...base, canMigrate: true })}
      />,
    );

    const control = screen.getByRole("button", { name: "Migrate" }) as HTMLButtonElement;
    expect(control.disabled).toBe(true);
    expect(control.getAttribute("title")).toBe(
      "The contract declares no operation that migrates a VM.",
    );
    expect(screen.getByText("action_not_permitted")).toBeDefined();
  });
});

describe("Site → VMs", () => {
  it("is the same screen, filtered to one lab", async () => {
    await renderConsole("/site/accra-lab/vms");
    const grid = await vmsTable();

    // The sixteen guests on accra-lab's eight machines, including the failed one
    // and none of the estate's other eleven.
    expect(rowsOf(grid)).toHaveLength(16);
    expect(hasRow(grid, "postgres-main")).toBe(true);
    expect(hasRow(grid, "legacy-erp")).toBe(true);
    expect(hasRow(grid, "netbird")).toBe(true);
    expect(hasRow(grid, "kumasi-web-01")).toBe(false);
    expect(hasRow(grid, "grafana-canary")).toBe(false);

    // The Site column is gone, because every row is in the lab the sidebar already
    // names. Its absence is the scope working, not a column that failed to load.
    expect(grid.querySelector('th[data-column="site"]')).toBeNull();
  });

  it("says a Site that nothing answers to, rather than listing it as empty", async () => {
    await renderConsole("/site/no-such-lab/vms");

    expect(await screen.findByText("No Site is called “no-such-lab”")).toBeDefined();
    expect(screen.queryByRole("table", { name: "VMs" })).toBeNull();
  });
});
