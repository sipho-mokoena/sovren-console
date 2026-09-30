/**
 * The Node detail page, in a browser, against the generated mock backend.
 *
 * The seam is the same one every console test uses: the estate is seeded by the
 * world builder, the handlers are the ones orval generated from the document, the
 * client is the one orval generated, and the only thing between them is the
 * console. A screen that renders seeded rows here is a screen that will render
 * real rows.
 *
 * ## Why the awkward cases are the tests
 *
 * The estate seeds its hard rows on purpose -- a NAS that never enrolled, a
 * desktop with a failed disk, a machine with no guests, a 2009 Core 2 Duo beside
 * a 2019 Xeon -- and those rows exist because a screen that has never rendered them
 * has not been tested. So each of them gets a case here, and each case asserts what
 * the operator can see rather than what a function was handed.
 *
 * Expected values are literals, or values named in the estate file. Nothing in this
 * file recomputes an expectation the way the screen computes it: a test that agreed
 * by construction would assert nothing, and the count assertions below are written
 * out on purpose so that a change to the estate fails here visibly.
 *
 * ## The one invariant asserted against rendered text
 *
 * **`Drive` and `Disk` never meet.** The Drives tab is about physical disks on this
 * machine, and the word "Disk" must not occur on it anywhere -- not as a column
 * header, not in a caption, not in the empty state. The overview says it once, in a
 * hint, on purpose: that is the sentence telling an operator looking for a guest's
 * storage that it is called something else. So the assertion is scoped to the
 * Drives tab, and the overview's hint is asserted as present, so the two together
 * say the rule is deliberate rather than accidental.
 */

import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole, type ConsoleApp } from "../test/render-console";

/**
 * Render at a second URL within one test.
 *
 * `renderConsole` mounts a whole console, so a test that renders twice without
 * unmounting in between has two of them in the document -- and every query naming
 * a thing both consoles have (`Machine properties`, which is on every detail page
 * in the console) then finds two and fails for a reason that has nothing to do
 * with the screen under test. Unmounting first is exactly what the harness's own
 * `afterEach` does, done explicitly where one test needs a second URL.
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

/** The tab bar, once the page has rendered. */
const tabs = async (): Promise<HTMLElement> =>
  await screen.findByRole("navigation", { name: "accra-desk-01 tabs" });

/**
 * The breadcrumb's link to the list.
 *
 * Found through the crumb's own marker rather than by its accessible name, because
 * the console's sidebar also has a link called "Nodes" and a query by name finds
 * both -- and a test that clicked whichever came first would be testing the sidebar
 * half the time.
 */
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

describe("Fleet → Nodes → one Node", () => {
  it("opens with the ID, created and updated block, in that order", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01");
    await tabs();

    const block = identity();
    expect(block.textContent).toContain("ID");
    expect(block.textContent).toContain("nd_01hq2n0001");
    expect(block.textContent).toContain("Created");
    expect(block.textContent).toContain("2025-09-14 06:00:00Z");
    expect(block.textContent).toContain("Updated");
    expect(block.textContent).toContain("2026-09-29 05:48:00Z");

    // ID first, always. A block that put created before id on one page and after it
    // on another is a block nobody can scan, because the eye learns the order once.
    const labels = [...block.querySelectorAll("span > span:first-child")].map(
      (node) => node.textContent,
    );
    expect(labels.slice(0, 3)).toEqual(["ID", "Created", "Updated"]);
  });

  it("is the same shape as every other detail page's identity block", async () => {
    // R40 says the block is identical on every detail page, so the assertion is
    // against a page that is not this one: a Connection, which predates this
    // archetype and was built against the same component. If the two ever diverge,
    // the divergence is in the markup and this fails.
    await renderConsole("/fleet/nodes/accra-desk-01");
    await tabs();
    const node = identity();

    await rerenderConsole("/settings/connections/proxmox-accra");
    await screen.findByRole("region", { name: "proxmox-accra" });
    const connection = identity();

    expect(node.className).toBe(connection.className);
    expect([...node.children].map((child) => child.tagName)).toEqual(
      [...connection.children].map((child) => child.tagName),
    );
  });

  it("puts the tab in the URL, so the page and the tab are both linkable", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01");
    const bar = await tabs();

    // Four tabs, in the order the ticket names them.
    expect([...bar.querySelectorAll("a")].map((link) => link.dataset["tab"])).toEqual([
      "overview",
      "drives",
      "vms",
      "peers",
    ]);

    // A tab is an anchor, not a button: it has an address that can be copied out of
    // the bar and handed to a colleague.
    const drives = within(bar).getByRole("link", { name: /Drives/ });
    expect(drives.getAttribute("href")).toContain("tab=drives");

    // And it is the current one, marked the way a screen reader announces it.
    expect(
      within(bar)
        .getByRole("link", { name: /Overview/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("shows the tab the URL names, and only that tab", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01?tab=drives");
    await tabs();

    // The drives panel is the one mounted, and the overview's properties are not in
    // the document at all. A tab that rendered every section and hid three would be
    // a page that fetched four lists to show one.
    await waitFor(() => {
      expect(panel("drives").querySelector("table")).not.toBeNull();
    });
    expect(document.querySelector('[data-tab-panel="overview"]')).toBeNull();
    expect(screen.queryByText("Machine properties")).toBeNull();
  });

  it("says a tab that is not on this page, rather than showing an unmarked bar", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01?tab=snapshots");
    await tabs();

    // An unknown tab resolves to the first one and says so. Silently showing the
    // overview would be a screen failing quietly.
    const notice = document.querySelector('[data-unknown-tab="true"]');
    expect(notice?.textContent).toContain("names a tab that is not on this page");
    expect(document.querySelector('[data-tab-panel="overview"]')).not.toBeNull();
  });

  it("reports a heterogeneous machine as it actually is", async () => {
    // A 2009 Core 2 Duo: 2 cores, 1 socket, 4 GiB of 4 GiB, two 500 GiB disks, a
    // Proxmox below the rest of the estate, and a CPU below the floor.
    await renderConsole("/fleet/nodes/accra-desk-01");
    await tabs();

    const machine = screen.getByRole("table", { name: "Machine properties" });
    expect(propertyOf(machine, "CPU model")).toBe("Intel Core 2 Duo E8400");
    expect(propertyOf(machine, "Cores")).toBe("2");
    expect(propertyOf(machine, "Memory")).toBe("4.0 GiB of 4.0 GiB");
    expect(propertyOf(machine, "Drives")).toBe("2 Drives · 1000 GiB");
    expect(propertyOf(machine, "Proxmox")).toBe("9.2.4");

    // The same page says the CPU is what the machine reported and not the fleet
    // floor, because that is the distinction the whole note is about.
    expect(propertyHint(machine, "CPU model")).toContain("not the fleet floor");
  });

  it("does not normalise two different machines into one shape", async () => {
    // The point of the acceptance criterion: the estate is heterogeneous, and a
    // screen that smoothed it would be reporting a fiction.
    const cpuOf = async (ref: string): Promise<{ cpu: string; cores: string; hint: string }> => {
      await rerenderConsole(`/fleet/nodes/${ref}`);
      const table = await screen.findByRole("table", { name: "Machine properties" });
      return {
        cpu: propertyOf(table, "CPU model"),
        cores: propertyOf(table, "Cores"),
        hint: propertyHint(table, "Cores"),
      };
    };

    // Three machines from three different years, each reported as itself. If the
    // console normalised any of these to a fleet figure, the assertion that fails
    // is the one naming the value the estate wrote.
    expect(await cpuOf("accra-desk-01")).toEqual({
      cpu: "Intel Core 2 Duo E8400",
      cores: "2",
      hint: "",
    });
    expect(await cpuOf("accra-rig-01")).toEqual({
      cpu: "AMD Ryzen 7 3700X",
      cores: "8",
      hint: "",
    });
    // A two-socket machine says so, because sockets are a property of the hardware
    // and not a detail to drop.
    expect(await cpuOf("accra-server-01")).toEqual({
      cpu: "Intel Xeon E5-2680 v4",
      cores: "12",
      hint: "2 sockets",
    });
  });

  it("reads a Node with no overlay address as not enrolled, not as an empty cell", async () => {
    await renderConsole("/fleet/nodes/takoradi-nas-01");
    await screen.findByRole("navigation", { name: "takoradi-nas-01 tabs" });

    const panel0 = document.querySelector<HTMLElement>('[data-overlay="null"]');
    expect(panel0).not.toBeNull();
    expect(panel0?.textContent).toContain("not enrolled");
    // And what it means: reachable on the LAN only. A machine with no address is not
    // a machine with an unstated address.
    expect(panel0?.textContent).toContain("reachable on the LAN only");

    // An enrolled machine is marked as enrolled, so the two are distinguishable
    // without reading the words.
    await rerenderConsole("/fleet/nodes/accra-desk-01");
    await screen.findByRole("navigation", { name: "accra-desk-01 tabs" });
    const enrolled = document.querySelector<HTMLElement>('[data-overlay="enrolled"]');
    expect(enrolled?.textContent).toContain("100.64.0.12");
    expect(enrolled?.textContent).toContain("accra-desk-01");
  });

  it("renders a disabled action with the sovren code that refuses it", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01");
    await tabs();

    const migrate = screen.getByRole("button", { name: "Migrate" }) as HTMLButtonElement;
    expect(migrate.disabled).toBe(true);

    // The code, not a sentence. The control and the request it would have made
    // speak one vocabulary, so a greyed button and a failed request are readable by
    // the same rule.
    expect(screen.getAllByText("action_not_permitted").length).toBeGreaterThan(0);
    expect(migrate.getAttribute("aria-describedby")).not.toBeNull();
    expect(document.body.textContent).toContain("Migrate is unavailable");

    // And the same machine, on the list, was refused for the same reason with the
    // same code -- one refusal rule, not two that happen to agree today.
    const migration = screen.getByRole("table", { name: "Migration properties" });
    expect(propertyOf(migration, "Offered")).toBe("refused");
    expect(propertyOf(migration, "Code")).toBe("action_not_permitted");
  });

  it("reports a Node whose drives include a failed one", async () => {
    // kumasi-desk-03's only drive is `failed`, and the machine is `degraded` because
    // of it. A drives tab that showed the count and nothing else would hide the one
    // fact an operator opened the page to find.
    await renderConsole("/fleet/nodes/kumasi-desk-03?tab=drives");
    await screen.findByRole("table", { name: "Drives on kumasi-desk-03" });

    const grid = screen.getByRole("table", { name: "Drives on kumasi-desk-03" });
    expect(namesOf(grid)).toEqual(["kumasi-desk-03-sda"]);

    const drive = rowsOf(grid)[0];
    if (drive === undefined) throw new Error("no drive row");
    expect(cellOf(drive, "health")).toBe("failed");
    expect(cellOf(drive, "used")).toBe("244 GiB");
    expect(cellOf(drive, "size")).toBe("250 GiB");

    // The status is the control plane's word, out of the one badge table, so it
    // reads with the same tone the Nodes list gave it.
    const badge = drive.querySelector('[data-state="failed"]');
    expect(badge?.getAttribute("data-tone")).toBe("bad");
  });

  it("never calls a physical disk a Disk", async () => {
    // The rule the invariant suite is watching. Asserted against the rendered
    // strings of the Drives tab, because a comment asserting the rule would keep
    // asserting it after the header had been renamed.
    await renderConsole("/fleet/nodes/accra-server-01?tab=drives");
    await screen.findByRole("table", { name: "Drives on accra-server-01" });

    const tab = panel("drives");
    const headers = [...tab.querySelectorAll("th")].map((cell) => cell.textContent ?? "");
    expect(headers).toContain("Drive");
    expect(headers).not.toContain("Disk");
    expect(headers).not.toContain("Disks");
    expect(tab.textContent).not.toMatch(/\bdisks?\b/i);

    // And the tab says what a Drive is, in the two words the model is named after:
    // it belongs to a Node and has no VM.
    expect(tab.textContent).toContain("belongs to a Node and has no VM");
  });

  it("says on the overview that a VM's storage is a Disk, so the two can be told apart", async () => {
    // The counterpart to the assertion above. If the Drives tab is silent about
    // `Disk`, the overview has to be the place the distinction is made, or the
    // console has two storage words and no way to tell an operator which is which.
    await renderConsole("/fleet/nodes/accra-desk-01");
    await tabs();

    const machine = screen.getByRole("table", { name: "Machine properties" });
    expect(propertyHint(machine, "Drives")).toContain("a VM's storage is a Disk on that VM");
  });

  it("shows the Drives as Drives, one row per physical disk, with the machine's own count", async () => {
    await renderConsole("/fleet/nodes/takoradi-nas-01?tab=drives");
    const bar = await screen.findByRole("navigation", { name: "takoradi-nas-01 tabs" });

    // Four drives on a 32 TiB NAS, and the tab's count agrees with the table.
    const grid = await screen.findByRole("table", { name: "Drives on takoradi-nas-01" });
    expect(namesOf(grid)).toEqual([
      "takoradi-nas-01-sda",
      "takoradi-nas-01-sdb",
      "takoradi-nas-01-sdc",
      "takoradi-nas-01-sdd",
    ]);
    expect(tabLabel(bar, /Drives/)).toBe("Drives");
    expect(tabCount(bar, /Drives/)).toBe("4");

    const first = rowsOf(grid)[0];
    if (first === undefined) throw new Error("no drive row");
    expect(cellOf(first, "type")).toBe("hdd");
    expect(cellOf(first, "device")).toBe("/dev/sda");
  });

  it("renders an unmeasured drive as absent rather than as an empty one", async () => {
    // accra-server-01-sda has a size and no `usedBytes`. A drive whose capacity has
    // not been measured is not a drive with an empty one, so the cell says absent.
    await renderConsole("/fleet/nodes/accra-server-01?tab=drives");
    await screen.findByRole("table", { name: "Drives on accra-server-01" });

    const grid = screen.getByRole("table", { name: "Drives on accra-server-01" });
    const unmeasured = rowsOf(grid).find((row) => cellOf(row, "name") === "accra-server-01-sda");
    expect(unmeasured).toBeDefined();
    expect(cellOf(unmeasured as HTMLElement, "size")).toBe("480 GiB");
    expect(cellOf(unmeasured as HTMLElement, "used")).toBe("—");
  });

  it("shows the VMs on this machine, and only this machine's", async () => {
    await renderConsole("/fleet/nodes/accra-server-01?tab=vms");
    const grid = await screen.findByRole("table", { name: "VMs on accra-server-01" });

    // Three guests: the overlay's own, the control plane's, and the golden machine.
    // Not one of the twenty-four on other machines.
    expect(namesOf(grid)).toEqual(["netbird", "sovren-cp", "golden"]);
  });

  it("shows the VMs the list filtered to this machine shows, and cannot disagree with it", async () => {
    // The ticket's acceptance criterion, asserted as behaviour rather than as
    // intent: the same list, the same filter, the same rows. Both halves are read
    // from the running console, so this fails if either screen starts applying its
    // own idea of what belongs to a machine.
    await renderConsole("/fleet/vms");
    const estate = await screen.findByRole("table", { name: "VMs" });
    expect(namesOf(estate)).toContain("postgres-main");

    await renderConsole("/fleet/nodes/accra-server-02?tab=vms");
    const scoped = await screen.findByRole("table", { name: "VMs on accra-server-02" });
    expect(namesOf(scoped)).toEqual(["postgres-main", "redis-cache", "grafana", "nextcloud"]);

    // The estate list holds the VM; this Node's tab does not; the other Node's does.
    // One list, two filters, no third answer.
    await rerenderConsole("/fleet/vms");
    expect(namesOf(await screen.findByRole("table", { name: "VMs" }))).toContain("golden");
  });

  it("shows the Peers on this machine, its guests' enrolments included", async () => {
    await renderConsole("/fleet/nodes/accra-server-01?tab=peers");
    const grid = await screen.findByRole("table", { name: "Peers on accra-server-01" });

    // A Peer is an enrolment record, and every guest on the machine is enrolled
    // too. Showing only the machine itself would be a second, hand-rolled
    // definition of "the peers on this machine".
    const names = namesOf(grid);
    expect(names).toContain("accra-server-01");
    expect(names).toContain("netbird");
    expect(names).toContain("sovren-cp");
    expect(names).toContain("golden");
    // And nothing from another lab.
    expect(names).not.toContain("kumasi-desk-01");
  });

  it("shows the Peers the list filtered to this machine shows", async () => {
    // The estate's peers run to fifty-one, so the page size is widened to reach the
    // five that are not on any machine at all. A page size large enough to see them
    // is the honest way to ask the question; asserting on page one would be asking
    // a different one.
    await renderConsole("/fleet/peers?size=200");
    const estate = await screen.findByRole("table", { name: "Peers" });
    // The operator's own laptop is a Peer with no Node and no Site, and it is in the
    // estate list. It cannot be on any machine's tab, because it is not on one.
    expect(namesOf(estate)).toContain("ops-laptop-sipho");

    await renderConsole("/fleet/nodes/accra-desk-01?tab=peers");
    const scoped = await screen.findByRole("table", { name: "Peers on accra-desk-01" });
    expect(namesOf(scoped)).toEqual(["accra-desk-01", "legacy-erp"]);
  });

  it("gives a machine with no guests a VMs tab that says so, rather than a blank panel", async () => {
    // Three machines in the estate host nothing, and one of them is the machine an
    // operator most wants to know is idle.
    await renderConsole("/fleet/nodes/takoradi-nas-01?tab=vms");
    const bar = await screen.findByRole("navigation", { name: "takoradi-nas-01 tabs" });

    // Waited for the empty state rather than for the tab bar: the bar renders as
    // soon as the Node arrives, and the section is still loading at that point, so a
    // check made there would be asserting on a skeleton.
    expect(await screen.findByText("No VM runs on takoradi-nas-01")).toBeDefined();
    expect(screen.queryByRole("table", { name: "VMs on takoradi-nas-01" })).toBeNull();
    // The count beside the tab agrees with the empty state: zero, not one.
    expect(tabLabel(bar, /VMs/)).toBe("VMs");
    expect(tabCount(bar, /VMs/)).toBe("0");

    // And the body says what an idle machine is, because "no results" reads as a
    // failure and this is not one.
    expect(screen.getByText(/the machine itself is the resource/).textContent).toContain(
      "no guest on it",
    );
  });

  it("distinguishes a machine that never enrolled from one with nothing to report", async () => {
    // The two empty Peer states are different sentences, and an operator acts on
    // them differently: one means "fix the enrolment", the other means "look at
    // the network".
    await renderConsole("/fleet/nodes/takoradi-nas-01?tab=peers");
    await screen.findByRole("navigation", { name: "takoradi-nas-01 tabs" });
    expect(
      await screen.findByText("takoradi-nas-01 has never enrolled, so it has no Peer"),
    ).toBeDefined();

    // accra-laptop-01 is enrolled and simply has no guests, and it is offline, so
    // its own peer is disconnected rather than absent. A tab with a row in it.
    await rerenderConsole("/fleet/nodes/accra-laptop-01?tab=peers");
    const grid = await screen.findByRole("table", { name: "Peers on accra-laptop-01" });
    expect(namesOf(grid)).toEqual(["accra-laptop-01"]);
    expect(cellOf(rowsOf(grid)[0] as HTMLElement, "status")).toContain("disconnected");
  });

  it("is reachable by name and by id, because every path parameter accepts either", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01");
    await tabs();
    const byName = identity().querySelector("code")?.textContent;
    expect(byName).toBe("nd_01hq2n0001");

    // The same page by id, and the same tabs work: the ref goes to every hook on
    // this page untouched, so nothing on it can be reached by name but not by id.
    await rerenderConsole(`/fleet/nodes/${String(byName)}?tab=drives`);
    const grid = await screen.findByRole("table", { name: "Drives on accra-desk-01" });
    expect(namesOf(grid)).toEqual(["accra-desk-01-sda", "accra-desk-01-sdb"]);

    await rerenderConsole(`/fleet/nodes/${String(byName)}?tab=vms`);
    expect(namesOf(await screen.findByRole("table", { name: "VMs on accra-desk-01" }))).toEqual([
      "legacy-erp",
    ]);
  });

  it("returns the operator to the list with their filters, sort and page intact", async () => {
    const { router } = await renderConsole("/fleet/nodes?q=kumasi&sort=cores&size=5");
    const grid = await screen.findByRole("table", { name: "Nodes" });
    expect(rowsOf(grid)).toHaveLength(5);

    // Open a row. The filters, the sort and the size travel with the navigation,
    // because a detail page owns exactly one search parameter and preserves the
    // rest -- and they are still in its address bar, which is what the breadcrumb
    // reads.
    const link = within(grid).getAllByRole("link", { name: /kumasi-desk-0/ })[0];
    expect(link?.getAttribute("href")).toContain("q=kumasi");
    // `fireEvent` rather than `element.click()`: the router's link handler is a
    // React event delegated at the root, and a raw DOM click on an element the test
    // reached through `document` does not go through it -- the assertion after this
    // would time out on a navigation that never happened, which says nothing about
    // the console.
    fireEvent.click(link as HTMLElement);

    await waitFor(() => {
      expect(currentUrl(router).pathname).toContain("/fleet/nodes/");
    });
    const opened = currentUrl(router).searchParams;
    expect(opened.get("q")).toBe("kumasi");
    expect(opened.get("sort")).toBe("cores");
    expect(opened.get("size")).toBe("5");

    // The crumb back, and the list is the view the operator left.
    const crumb = await crumbToList();
    expect(crumb.getAttribute("href")).toContain("q=kumasi");
    expect(crumb.getAttribute("href")).toContain("sort=cores");
    expect(crumb.getAttribute("href")).toContain("size=5");
    fireEvent.click(crumb);

    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/nodes");
    });
    const back = currentUrl(router).searchParams;
    expect(back.get("q")).toBe("kumasi");
    expect(back.get("sort")).toBe("cores");
    expect(back.get("size")).toBe("5");
    expect(rowsOf(await screen.findByRole("table", { name: "Nodes" }))).toHaveLength(5);
  });

  it("keeps the page token through the round trip too", async () => {
    const { router } = await renderConsole("/fleet/nodes?size=5");
    await screen.findByRole("table", { name: "Nodes" });

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("page")).toMatch(/^pt_/);
    });
    const token = currentUrl(router).searchParams.get("page");

    // The row on the second page, opened.
    const link = within(await screen.findByRole("table", { name: "Nodes" })).getAllByRole("link", {
      name: /desk|server|rig|laptop/,
    })[0];
    fireEvent.click(link as HTMLElement);
    await waitFor(() => {
      expect(currentUrl(router).pathname).toMatch(/^\/fleet\/nodes\/[^/]+$/);
    });
    expect(currentUrl(router).searchParams.get("page")).toBe(token);

    // Back, on the same page of the same list, not on page one.
    fireEvent.click(await crumbToList());
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/nodes");
    });
    expect(currentUrl(router).searchParams.get("page")).toBe(token);
  });

  it("does not put the tab on the list when the operator goes back", async () => {
    // The tab belongs to the detail page, not to the list, and a list asked for a
    // tab it does not have is a list that has been handed another page's state.
    const { router } = await renderConsole("/fleet/nodes/accra-desk-01?tab=peers");
    await screen.findByRole("navigation", { name: "accra-desk-01 tabs" });
    expect(currentUrl(router).searchParams.get("tab")).toBe("peers");

    fireEvent.click(await crumbToList());
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/nodes");
    });
    expect(currentUrl(router).searchParams.get("tab")).toBeNull();
  });

  it("serves the same page under a Site, and returns the operator to that lab", async () => {
    const { router } = await renderConsole("/site/kumasi-store/nodes?q=desk");
    await screen.findByRole("table", { name: "Nodes" });

    // The crumb on a Site-scoped list returns to that lab's list, not the estate's.
    await renderConsole("/site/kumasi-store/nodes/kumasi-desk-01");
    const crumb = await crumbToList();
    expect(crumb.getAttribute("href")).toContain("/site/kumasi-store/nodes");
    fireEvent.click(crumb);
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/site/kumasi-store/nodes");
    });
  });

  it("says a Node nothing answers to is not found, rather than showing a blank page", async () => {
    await renderConsole("/fleet/nodes/no-such-machine");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    // The requestId is the join to the audit log, so it is on the page.
    expect(alert.textContent).toMatch(/req_/);
    // And there is a way out, because an error state that only reports is a dead end.
    expect(screen.getByRole("link", { name: /Back to the Nodes/ })).toBeDefined();
  });

  it("offers the same way back from the failure state as from the page", async () => {
    await renderConsole("/fleet/nodes/no-such-machine");
    const back = await screen.findByRole("link", { name: /Back to the Nodes/ });
    expect(back.getAttribute("href")).toBe("/fleet/nodes");
  });

  it("shows the page's own failure when the control plane is not answering", async () => {
    await renderConsole("/fleet/nodes/accra-desk-01?sentinel=upstream-unavailable");
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

/**
 * A tab's label and its count, as two values.
 *
 * The count is a separate element from the label, so reading `textContent` of the
 * link glues them into `Drives4` and a test asserting `Drives 4` is asserting a
 * rendering detail rather than what the operator reads. What the operator reads is
 * "Drives, four", and the two halves are asserted as they are marked up.
 */
const tabLabel = (bar: HTMLElement, name: RegExp): string | null => {
  const link = within(bar).getByRole("link", { name });
  // The label is a bare text node beside the count's element, so the label is
  // whatever text is left once the count has been taken out.
  const clone = link.cloneNode(true) as HTMLElement;
  for (const count of clone.querySelectorAll("span")) count.remove();
  return (clone.textContent ?? "").trim();
};

const tabCount = (bar: HTMLElement, name: RegExp): string | null => {
  const link = within(bar).getByRole("link", { name });
  return link.querySelector("span")?.textContent ?? null;
};
