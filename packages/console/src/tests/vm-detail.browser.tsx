/**
 * The VM detail page, in a browser, against the generated mock backend.
 *
 * The seam is the one every console test uses: the estate is seeded by the world
 * builder, the handlers are the ones orval generated from the document, the
 * client is the one orval generated, and the only thing between them is the
 * console. A screen that renders seeded rows here is a screen that will render
 * real rows.
 *
 * ## Why the awkward cases are the tests
 *
 * The estate seeds its hard rows on purpose -- a guest with no overlay address, a
 * guest that failed and names why, a guest still being built with a `Task` in
 * flight behind it, a template nobody has ever started -- and those rows exist
 * because a screen that has never rendered them has not been tested. So each of
 * them gets a case here, and each case asserts what the operator can see.
 *
 * Expected values are literals, or values named in the estate file. Nothing here
 * recomputes an expectation the way the screen computes it: the timestamps are
 * written out, so a change to the estate's clock fails here visibly.
 *
 * ## The one invariant asserted against rendered text
 *
 * **On the Disks tab, `Disk` and never `Drive`.** The tab is about VM storage, and
 * the word "drive" must not occur inside it -- not as a column header, not in a
 * caption, not in an empty state. A `Drive` is a physical disk on a `Node` and it
 * lives on that machine's own page, and an operator who cannot resolve either word
 * to a schema reads them from the console. The assertion is scoped to the tab's
 * panel, because the tab's *description* is where the distinction is deliberately
 * stated -- the same split the Node detail page makes, and both halves are
 * asserted so the rule reads as deliberate rather than accidental.
 */

import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole, type ConsoleApp } from "../test/render-console";

/**
 * Render at a second URL within one test.
 *
 * `renderConsole` mounts a whole console, so a test that renders twice without
 * unmounting in between has two of them in the document -- and every query naming
 * a thing both consoles have then finds two and fails for a reason that has
 * nothing to do with the screen under test.
 */
const rerenderConsole = async (url: string): Promise<ConsoleApp> => {
  cleanup();
  return await renderConsole(url);
};

/** The address the console is at, as a URL. */
const currentUrl = (router: { state: { location: { href: string } } }): URL =>
  new URL(router.state.location.href, window.location.origin);

/** The rows of a table, header excluded. */
const rowsOf = (grid: HTMLElement): HTMLElement[] =>
  [...grid.querySelectorAll("tr[data-row]")] as HTMLElement[];

/** One cell of one row, by column key. */
const cellOf = (row: HTMLElement, column: string): string =>
  row.querySelector(`[data-column="${column}"]`)?.textContent ?? "";

/** The names in a table's identity column, in the order the table has them. */
const namesOf = (grid: HTMLElement): string[] => rowsOf(grid).map((row) => cellOf(row, "name"));

/** The panel of the tab that is showing, by its key. */
const panel = (key: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-tab-panel="${key}"]`);
  if (found === null) throw new Error(`no panel for the ${key} tab`);
  return found;
};

/** The tab bar of a VM's detail page, once the page has rendered. */
const tabs = async (name: string): Promise<HTMLElement> =>
  await screen.findByRole("navigation", { name: `${name} tabs` });

/** The breadcrumb's link to the list, found by the crumb's own marker. */
const crumbToList = async (): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(document.querySelector('[data-breadcrumb="list"]')).not.toBeNull();
  });
  const crumb = document.querySelector<HTMLElement>('[data-breadcrumb="list"]');
  if (crumb === null) throw new Error("no breadcrumb on the page");
  return crumb;
};

/** The identity block, which every detail page opens with. */
const identity = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[data-identity="true"]');
  if (found === null) throw new Error("no identity block on the page");
  return found;
};

describe("Fleet → VMs → one VM", () => {
  it("opens with the ID, created and updated block, in that order", async () => {
    await renderConsole("/fleet/vms/postgres-main");
    await tabs("postgres-main");

    // R40. The estate wrote this VM 130 days before its fixed `now`, and last
    // touched it three minutes before it. Both are written out rather than
    // recomputed, so a change to the estate fails here rather than agreeing with
    // itself.
    const block = identity();
    expect(block.textContent).toContain("ID");
    expect(block.textContent).toContain("vm_01hq2v0006");
    expect(block.textContent).toContain("Created");
    expect(block.textContent).toContain("2026-05-22 06:00:00Z");
    expect(block.textContent).toContain("Updated");
    expect(block.textContent).toContain("2026-09-29 05:57:00Z");

    const labels = [...block.querySelectorAll("span > span:first-child")].map(
      (node) => node.textContent,
    );
    expect(labels.slice(0, 3)).toEqual(["ID", "Created", "Updated"]);
  });

  it("puts the tab in the URL, so the page and the tab are both linkable", async () => {
    await renderConsole("/fleet/vms/postgres-main");
    const bar = await tabs("postgres-main");

    expect([...bar.querySelectorAll("a")].map((link) => link.dataset["tab"])).toEqual([
      "overview",
      "disks",
      "snapshots",
    ]);

    const disks = within(bar).getByRole("link", { name: "Disks" });
    expect(disks.getAttribute("href")).toContain("tab=disks");
    expect(within(bar).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the tab the URL names, and only that tab", async () => {
    await renderConsole("/fleet/vms/postgres-main?tab=disks");
    await tabs("postgres-main");

    // A detail page costs one request, not three: the overview's properties are
    // not in the document at all when the Disks tab is the one showing.
    await screen.findByRole("table", { name: "Disks on postgres-main" });
    expect(document.querySelector('[data-tab-panel="overview"]')).toBeNull();
    expect(screen.queryByRole("table", { name: "Snapshots on postgres-main" })).toBeNull();
  });

  it("says a tab that is not on this page, rather than showing an unmarked bar", async () => {
    await renderConsole("/fleet/vms/postgres-main?tab=drives");
    await tabs("postgres-main");

    // `drives` is the Node detail page's tab, not this one's. A link that has
    // drifted resolves to the first tab and reports itself, because showing the
    // overview silently is a screen failing quietly.
    const notice = document.querySelector('[data-unknown-tab="true"]');
    expect(notice?.textContent).toContain("names a tab that is not on this page");
    expect(document.querySelector('[data-tab-panel="overview"]')).not.toBeNull();
  });

  it("reports the properties that identify the guest, and nothing it does not", async () => {
    await renderConsole("/fleet/vms/postgres-main");
    await tabs("postgres-main");

    const properties = screen.getByRole("table", { name: "VM properties" });
    expect(propertyOf(properties, "Name")).toBe("postgres-main");
    expect(propertyOf(properties, "Node")).toBe("accra-server-02");
    expect(propertyOf(properties, "Site")).toBe("accra-lab");
    expect(propertyOf(properties, "Purpose")).toBe("service");
    expect(propertyOf(properties, "Cores")).toBe("8");
    expect(propertyOf(properties, "Memory")).toBe("32 GiB");
    expect(propertyOf(properties, "Storage")).toBe("512 GiB");
    expect(propertyOf(properties, "Uptime")).toBe("40d");

    // R63: the CPU model is the fleet floor rather than the host's, and the hint
    // says so, because reporting accra-server-02's Xeon here would be a fiction
    // about a guest that could land on the weakest machine in the estate.
    expect(propertyOf(properties, "CPU model")).toBe("kvm64");
    expect(propertyHint(properties, "CPU model")).toBe("the fleet floor, not the host's");
  });

  it("makes a purpose legible, in the contract's own three words", async () => {
    await renderConsole("/fleet/vms/postgres-main");
    await tabs("postgres-main");

    const properties = screen.getByRole("table", { name: "VM properties" });
    // The value is the contract's word and nothing else -- a purpose is not a
    // state, so it is not a badge...
    expect(propertyOf(properties, "Purpose")).toBe("service");
    // ...and the sentence beneath it is what makes the field worth reading.
    expect(propertyHint(properties, "Purpose")).toBe("hosts a Dokploy Service");

    // A workload is a different sentence, from the same three-word vocabulary.
    await rerenderConsole("/fleet/vms/legacy-erp");
    await tabs("legacy-erp");
    const workload = screen.getByRole("table", { name: "VM properties" });
    expect(propertyOf(workload, "Purpose")).toBe("workload");
    expect(propertyHint(workload, "Purpose")).toBe("handed to an operator to experiment on");
  });

  it("reads a VM with no overlay address as not enrolled, not as an empty cell", async () => {
    // `golden-tpl` is a template nobody has ever started, so it has enrolled
    // nothing and holds no address. That is a fact about the guest.
    await renderConsole("/fleet/vms/golden-tpl");
    await tabs("golden-tpl");

    const panel0 = document.querySelector<HTMLElement>('[data-overlay="null"]');
    expect(panel0).not.toBeNull();
    expect(panel0?.textContent).toContain("not enrolled");
    expect(panel0?.textContent).toContain("no Peer in the estate");
    expect(panel0?.textContent).toContain("LAN only");

    // And an enrolled guest is marked as enrolled, so the two are distinguishable
    // without reading the words.
    await rerenderConsole("/fleet/vms/postgres-main");
    await tabs("postgres-main");
    const enrolled = document.querySelector<HTMLElement>('[data-overlay="enrolled"]');
    expect(enrolled?.textContent).toContain("100.64.0.47");
    expect(enrolled?.textContent).toContain("postgres-main");
  });

  it("names the failure of a VM that failed, and never mistakes it for a stop", async () => {
    // `legacy-erp` failed because the guest agent stopped responding. A page that
    // rendered that as "stopped" would be telling the operator the wrong thing
    // about a machine that needs attention.
    await renderConsole("/fleet/vms/legacy-erp");
    await tabs("legacy-erp");

    const banner = document.querySelector<HTMLElement>('[data-banner="failed"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("this VM failed");
    expect(banner?.textContent).toContain(
      "the guest agent stopped responding after the storage controller reset",
    );

    // The whole reason, in the properties table too, and not truncated.
    const properties = screen.getByRole("table", { name: "VM properties" });
    expect(propertyOf(properties, "Failure reason")).toBe(
      "the guest agent stopped responding after the storage controller reset, and the VM was not restarted",
    );
    expect(propertyHint(properties, "Failure reason")).toBe(
      "non-null exactly when the state is failed; a failure is never a stop",
    );

    // The state itself, out of the one badge table, so it reads with the same tone
    // the VMs list gave the same row.
    const badge = document.querySelector('[data-run-state="failed"] [data-state="failed"]');
    expect(badge?.getAttribute("data-tone")).toBe("bad");
  });

  it("names the Task in flight on a VM that is still being built", async () => {
    // `grafana-canary` is transitional: a create Task is running, the outcome has
    // not been observed, and there is no overlay address because the guest agent
    // has not run yet. The console never asserts that a boot will finish (R51).
    await renderConsole("/fleet/vms/grafana-canary");
    await tabs("grafana-canary");

    const banner = document.querySelector<HTMLElement>('[data-banner="transitional"]');
    expect(banner?.textContent).toContain("not up and not broken yet");

    // The work, by its own name, linked so the operator can watch it rather than
    // guess at it.
    const task = banner?.querySelector<HTMLElement>("[data-task]");
    expect(task?.getAttribute("data-task")).toBe("tk_01hq2t0005");
    const href = new URL(task?.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/tasks/tk_01hq2t0005");

    // And on the overview, the same link, with the Task's kind beside it.
    const properties = screen.getByRole("table", { name: "VM properties" });
    expect(propertyOf(properties, "Task in flight")).toBe("tk_01hq2t0005");
    expect(propertyHint(properties, "Task in flight")).toBe("vm_create");
  });

  it("renders the null arms of the three nullable fields as themselves", async () => {
    // `postgres-main` is an ordinary running guest, so `transitionalTask` and
    // `failureReason` are null and `overlay` is not. A properties row that
    // silently disappeared would be a screen saying nothing is in flight and
    // nothing went wrong -- which for those two fields is right, but only if it
    // says it.
    await renderConsole("/fleet/vms/postgres-main");
    await tabs("postgres-main");

    const properties = screen.getByRole("table", { name: "VM properties" });
    expect(propertyOf(properties, "Task in flight")).toBe("none");
    expect(propertyOf(properties, "Failure reason")).toBe("none reported");
    expect(properties.querySelector('[data-failure="none"]')).not.toBeNull();
    expect(properties.querySelector('[data-overlay="null"]')).toBeNull();
  });

  it("offers the edit form as a link, carrying this page's place", async () => {
    await renderConsole("/fleet/vms/postgres-main?size=60&sort=memory");
    await tabs("postgres-main");

    // R49: the form is a route, so the control is an anchor. R50: it carries what
    // the operator was reading, so the way back returns here rather than to page
    // one of an unfiltered list.
    const edit = screen.getByRole("link", { name: "Edit" });
    const href = new URL(edit.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/vms/postgres-main/edit");
    expect(href.searchParams.get("size")).toBe("60");
    expect(href.searchParams.get("sort")).toBe("memory");
  });

  it("renders migration as refused, with the code the VMs list uses", async () => {
    // `legacy-erp` has `canMigrate: false`. The refusal is the same function the
    // VMs list's rows are given, so a guest that cannot be migrated says so in the
    // same words and the same code in both places.
    await renderConsole("/fleet/vms/legacy-erp");
    await tabs("legacy-erp");

    const migrate = screen.getByRole("button", { name: "Migrate" }) as HTMLButtonElement;
    expect(migrate.disabled).toBe(true);
    expect(document.body.textContent).toContain("action_not_permitted");

    const migration = screen.getByRole("table", { name: "Migration properties" });
    expect(propertyOf(migration, "Offered")).toBe("refused");
    expect(propertyOf(migration, "Code")).toBe("action_not_permitted");
  });

  it("lists the Disks of this guest, and never calls one a Drive", async () => {
    // `Disk` is VM storage. A `Drive` is a physical disk on a `Node`, it appears
    // on that machine's own page, and the table must not contain the word at all
    // -- asserted against the rendered strings, because a comment asserting the
    // rule would keep asserting it after the header had been renamed. The
    // assertion is scoped to the *table*: the tab's own description, above it, is
    // where the two nouns are told apart on purpose.
    await renderConsole("/fleet/vms/postgres-main?tab=disks");
    const grid = await screen.findByRole("table", { name: "Disks on postgres-main" });

    expect(namesOf(grid)).toEqual(["postgres-main-data", "postgres-main-wal"]);

    const headers = [...grid.querySelectorAll("th")].map((cell) => cell.textContent ?? "");
    expect(headers).toContain("Disk");
    expect(headers).not.toContain("Drive");
    expect(headers).not.toContain("Drives");
    expect(grid.textContent).not.toMatch(/\bdrives?\b/i);

    // Two Disks: 400 GiB of data and 112 GiB of write-ahead log, both qcow2 on
    // the local LVM pool, neither of them the cloud-init drive.
    const [data, wal] = rowsOf(grid);
    if (data === undefined || wal === undefined) throw new Error("no Disk rows");
    expect(cellOf(data, "size")).toBe("400 GiB");
    expect(cellOf(data, "used")).toBe("168 GiB");
    expect(cellOf(data, "storage")).toBe("local-lvm");
    expect(cellOf(data, "format")).toBe("qcow2");
    expect(cellOf(data, "cloudInit")).toBe("no");
    expect(cellOf(wal, "size")).toBe("112 GiB");
    expect(cellOf(wal, "used")).toBe("47 GiB");
  });

  it("says on the Disks tab where a Drive lives, so the two nouns can be told apart", async () => {
    // The counterpart to the assertion above, and the same split the Node detail
    // page makes. The table is free of the word; the tab's own description, above
    // it, is the sentence that makes the distinction deliberate rather than
    // accidental -- and it is inside the tab panel, so the panel is where an
    // operator reads it.
    await renderConsole("/fleet/vms/postgres-main?tab=disks");
    await screen.findByRole("table", { name: "Disks on postgres-main" });

    const tab = panel("disks");
    expect(tab.textContent).toContain("A Disk belongs to a VM and has no Node");
    expect(tab.textContent).toContain("a physical disk is a Drive");
  });

  it("marks the cloud-init Disk, because it must stay attached", async () => {
    // R62: the cloud-init drive stays attached or boot hangs with no useful
    // error. It lives on `local`, not `local-lvm`, because it is a snippet.
    await renderConsole("/fleet/vms/sovren-cp?tab=disks");
    const grid = await screen.findByRole("table", { name: "Disks on sovren-cp" });

    expect(namesOf(grid)).toEqual(["sovren-cp-root", "sovren-cp-data", "sovren-cp-cloudinit"]);
    const cloudInit = rowsOf(grid).find((row) => cellOf(row, "name") === "sovren-cp-cloudinit");
    if (cloudInit === undefined) throw new Error("no cloud-init Disk");
    expect(cellOf(cloudInit, "cloudInit")).toBe("yes · stays attached");
    expect(cellOf(cloudInit, "storage")).toBe("local");
    expect(cellOf(cloudInit, "format")).toBe("raw");
    expect(cellOf(cloudInit, "used")).toBe("1.0 MiB");
  });

  it("lists the Snapshots of this guest, with the parent it names", async () => {
    await renderConsole("/fleet/vms/postgres-main?tab=snapshots");
    const grid = await screen.findByRole("table", { name: "Snapshots on postgres-main" });

    expect(namesOf(grid)).toEqual(["postgres-main-pre-upgrade", "postgres-main-post-upgrade"]);

    const [before, after] = rowsOf(grid);
    if (before === undefined || after === undefined) throw new Error("no Snapshot rows");
    expect(cellOf(before, "description")).toBe("taken before the PostgreSQL upgrade");
    // The first in a chain has no parent, and an absent parent is absent rather
    // than a parent that happens to be the row above it.
    expect(cellOf(before, "parent")).toBe("—");
    expect(cellOf(before, "size")).toBe("41 GiB");
    expect(cellOf(before, "memory")).toBe("not captured");
    // And the second names the first by the id the contract carries.
    expect(cellOf(after, "parent")).toBe("sn_01hq2s0001");
    expect(cellOf(after, "size")).toBe("42 GiB");
  });

  it("disables the snapshot control the contract cannot honour, with the reason", async () => {
    // R43. The document declares `SnapshotList` and no operation that takes one,
    // so the control is rendered greyed and labelled with the sovren code that
    // refuses it. Omitting it would leave an operator who knows Proxmox wondering
    // whether sovren takes snapshots at all; a live control would be a promise
    // the document does not keep.
    await renderConsole("/fleet/vms/postgres-main?tab=snapshots");
    await screen.findByRole("table", { name: "Snapshots on postgres-main" });

    const control = screen.getByRole("button", { name: "Snapshot" }) as HTMLButtonElement;
    expect(control.disabled).toBe(true);
    expect(control.getAttribute("aria-describedby")).not.toBeNull();
    expect(document.body.textContent).toContain("action_not_permitted");
    expect(document.body.textContent).toContain(
      "declares no operation that takes, restores or deletes a Snapshot",
    );
    expect(document.body.textContent).toContain("SnapshotList only");
  });

  it("gives a guest with no Snapshot an empty state that says why", async () => {
    await renderConsole("/fleet/vms/grafana?tab=snapshots");
    await screen.findByRole("navigation", { name: "grafana tabs" });

    expect(await screen.findByText("grafana has no Snapshot")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Snapshots on grafana" })).toBeNull();
    expect(screen.getByText(/the control above is the reason it cannot be taken/)).toBeDefined();
  });

  it("is reachable by name and by id, because every path parameter accepts either", async () => {
    await renderConsole("/fleet/vms/postgres-main");
    await tabs("postgres-main");
    const byName = identity().querySelector("code")?.textContent;
    expect(byName).toBe("vm_01hq2v0006");

    // The same page by id, and the tabs work, because the ref goes to every hook
    // on this page untouched -- so nothing here can be reached by name but not by
    // id.
    await rerenderConsole(`/fleet/vms/${String(byName)}?tab=disks`);
    const grid = await screen.findByRole("table", { name: "Disks on postgres-main" });
    expect(namesOf(grid)).toEqual(["postgres-main-data", "postgres-main-wal"]);

    await rerenderConsole(`/fleet/vms/${String(byName)}?tab=snapshots`);
    expect(
      namesOf(await screen.findByRole("table", { name: "Snapshots on postgres-main" })),
    ).toEqual(["postgres-main-pre-upgrade", "postgres-main-post-upgrade"]);
  });

  it("opens from a row on the VMs list, and returns with the filters intact", async () => {
    const { router } = await renderConsole("/fleet/vms?q=postgres&sort=memory&size=5");
    const grid = await screen.findByRole("table", { name: "VMs" });

    // The row's identity cell is an anchor carrying the list's own search, which
    // is the other half of the return trip: a detail page can only carry back
    // what it was given.
    const link = within(grid).getByRole("link", { name: "postgres-main" });
    expect(link.getAttribute("href")).toContain("q=postgres");
    fireEvent.click(link);

    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms/postgres-main");
    });
    const opened = currentUrl(router).searchParams;
    expect(opened.get("q")).toBe("postgres");
    expect(opened.get("sort")).toBe("memory");
    expect(opened.get("size")).toBe("5");

    // Back, on the view the operator left.
    const crumb = await crumbToList();
    const crumbHref = new URL(crumb.getAttribute("href") ?? "", "http://console.test");
    expect(crumbHref.pathname).toBe("/fleet/vms");
    expect(crumbHref.searchParams.get("q")).toBe("postgres");
    expect(crumbHref.searchParams.get("sort")).toBe("memory");
    expect(crumbHref.searchParams.get("size")).toBe("5");
  });

  it("keeps the console's own controls on the way in and on the way back", async () => {
    // R56: `?estate=` and `?sentinel=` are in nobody's `OWNED` list, and they are
    // the only two handles on reproducing a failure by link. `estate=fleet` is the
    // estate the console is already serving, so this asks the question without
    // making the list unreadable: the parameter that survives is the one the list
    // does not own, which is exactly the one a reader of the breadcrumb's code is
    // looking for. A sentinel would have answered the same question by making
    // every request on the page fail.
    const { router } = await renderConsole("/fleet/vms?q=postgres&estate=fleet");
    const link = within(await screen.findByRole("table", { name: "VMs" })).getByRole("link", {
      name: "postgres-main",
    });
    fireEvent.click(link);

    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms/postgres-main");
    });
    expect(currentUrl(router).searchParams.get("estate")).toBe("fleet");

    const crumbHref = new URL(
      (await crumbToList()).getAttribute("href") ?? "",
      "http://console.test",
    );
    expect(crumbHref.searchParams.get("estate")).toBe("fleet");
    expect(crumbHref.searchParams.get("q")).toBe("postgres");
  });

  it("does not put the tab on the list when the operator goes back", async () => {
    const { router } = await renderConsole("/fleet/vms/postgres-main?tab=snapshots");
    await tabs("postgres-main");
    expect(currentUrl(router).searchParams.get("tab")).toBe("snapshots");

    fireEvent.click(await crumbToList());
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms");
    });
    expect(currentUrl(router).searchParams.get("tab")).toBeNull();
  });

  it("says a VM nothing answers to is not found, rather than showing a blank page", async () => {
    await renderConsole("/fleet/vms/no-such-vm");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    // The requestId is the join to the audit log, so it is on the page.
    expect(alert.textContent).toMatch(/req_/);
    // And there is a way out, because an error state that only reports is a dead end.
    const back = screen.getByRole("link", { name: /Back to the VMs/ });
    expect(back.getAttribute("href")).toBe("/fleet/vms");
  });

  it("shows the page's own failure when the control plane is not answering", async () => {
    await renderConsole("/fleet/vms/postgres-main?sentinel=upstream-unavailable");
    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("upstream_unavailable");
  });
});

/**
 * One property's value, by its label.
 *
 * Read through the `data-property` marker the properties table puts on each row,
 * and with the hint element taken out first -- otherwise a property whose value is
 * a bare string has no child element of its own and the hint is what comes back,
 * which is how a test ends up asserting a sentence when it meant to assert a CPU
 * model.
 */
function propertyOf(table: HTMLElement, label: string): string {
  const cell = propertyCell(table, label);
  const clone = cell.cloneNode(true) as HTMLElement;
  for (const hint of clone.querySelectorAll("div")) hint.remove();
  return (clone.textContent ?? "").trim();
}

/** One property's hint, by its label. */
function propertyHint(table: HTMLElement, label: string): string {
  const cell = propertyCell(table, label);
  return cell.querySelector("td > div")?.textContent ?? "";
}

function propertyCell(table: HTMLElement, label: string): HTMLElement {
  const row = table.querySelector<HTMLElement>(`tr[data-property="${label}"]`);
  if (row === null) throw new Error(`no property labelled ${label}`);
  const cell = row.querySelector<HTMLElement>("td");
  if (cell === null) throw new Error(`property ${label} has no value cell`);
  return cell;
}
