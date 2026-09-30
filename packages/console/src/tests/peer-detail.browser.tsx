/**
 * The Peer detail page, in a browser, against the generated mock backend.
 *
 * Same seam as every other console test: one estate, generated handlers,
 * generated client, and the console in between.
 *
 * ## Why these cases
 *
 * A `Peer` is NetBird's noun and the estate seeds it with the cases that break a
 * screen which assumes a peer is a machine sovren manages: an operator's own
 * laptop, blocked in NetBird and not seen for six days; a phone; a guest that has
 * not checked in because it is stopped; a machine that is both a `Node` and a
 * `Peer`. Each gets a case, and each asserts what the operator can see.
 *
 * The one thing asserted hardest is that **`status` is the control plane's
 * verdict**. The assertion is on the word and the tone together, so a screen that
 * re-derived staleness from `lastSeen` would fail: `stale` with a warning tone is
 * what the control plane said, and a threshold invented here would eventually
 * disagree with it.
 *
 * ## One join deliberately not made
 *
 * The Machine tab lists the guests on the Peer's `Node` and says, in words, that
 * the contract does not say which of them is this Peer. A test asserts that
 * sentence is on the page, because the absence of a join is a fact this console
 * has to be able to show rather than merely get right by accident.
 */

import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole, type ConsoleApp } from "../test/render-console";

/** Render at a second URL within one test, unmounting the first console. */
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

/** The tab bar of a Peer's detail page, once the page has rendered. */
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

describe("Fleet → Peers → one Peer", () => {
  it("opens with the ID, created and updated block, in that order", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");

    // R40, with the estate's own instants written out rather than recomputed: the
    // roster peer was enrolled 300 days before the estate's fixed `now` and has
    // not been seen since six days before it.
    const block = identity();
    expect(block.textContent).toContain("ID");
    expect(block.textContent).toContain("pr_01hq2p0031");
    expect(block.textContent).toContain("Created");
    expect(block.textContent).toContain("2025-12-03 06:00:00Z");
    expect(block.textContent).toContain("Updated");
    expect(block.textContent).toContain("2026-09-23 06:00:00Z");

    const labels = [...block.querySelectorAll("span > span:first-child")].map(
      (node) => node.textContent,
    );
    expect(labels.slice(0, 3)).toEqual(["ID", "Created", "Updated"]);
  });

  it("puts the tab in the URL, so the page and the tab are both linkable", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    const bar = await tabs("ops-laptop-sipho");

    expect([...bar.querySelectorAll("a")].map((link) => link.dataset["tab"])).toEqual([
      "overview",
      "machine",
    ]);

    const machine = within(bar).getByRole("link", { name: "Machine" });
    expect(machine.getAttribute("href")).toContain("tab=machine");
    expect(within(bar).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the tab the URL names, and only that tab", async () => {
    await renderConsole("/fleet/peers/accra-server-01?tab=machine");
    await tabs("accra-server-01");

    await screen.findByRole("table", { name: "VMs on accra-server-01" });
    expect(document.querySelector('[data-tab-panel="overview"]')).toBeNull();
  });

  it("says a tab that is not on this page, rather than showing an unmarked bar", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho?tab=snapshots");
    await tabs("ops-laptop-sipho");

    // `snapshots` is this console's other detail page's tab. A link that has
    // drifted resolves to the first tab and says so.
    const notice = document.querySelector('[data-unknown-tab="true"]');
    expect(notice?.textContent).toContain("names a tab that is not on this page");
    expect(panel("overview")).not.toBeNull();
  });

  it("renders the control plane's verdict, and computes no threshold of its own", async () => {
    // `ops-laptop-sipho` has not been heard from in six days, and the control
    // plane calls that `stale`. The word and the tone are both asserted, so a
    // screen that re-derived staleness from the timestamp would fail here.
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");

    const properties = screen.getByRole("table", { name: "Peer properties" });
    const badge = properties.querySelector('[data-property="Reachability"] [data-state]');
    expect(badge?.textContent).toBe("stale");
    expect(badge?.getAttribute("data-tone")).toBe("warn");

    // And the hint says where the decision was made, which is the console
    // declining to make it.
    expect(propertyHint(properties, "Reachability")).toBe(
      "decided by the control plane from when it last heard; this page holds no threshold of its own",
    );
  });

  it("shows when a peer was last seen, both ways", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");

    const properties = screen.getByRole("table", { name: "Peer properties" });
    // Absolute for the truth: the estate fixed `now`, so this instant is a fact
    // about the fixture rather than about the day the test runs. The relative
    // half is *not* asserted literally, because it is computed against the wall
    // clock at render -- the shape is asserted, not the number, so a suite run a
    // week from the estate's `now` does not fail on a fixture that has not moved.
    const seen = properties.querySelector<HTMLElement>(
      '[data-property="Last seen"] [data-last-seen]',
    );
    expect(seen?.getAttribute("data-last-seen")).toBe("2026-09-23T06:00:00.000Z");
    expect(propertyOf(properties, "Last seen")).toMatch(
      /^(\d+[mhd] ago|just now)2026-09-23 06:00:00Z$/,
    );
    expect(propertyHint(properties, "Last seen")).toBe(
      "relative for the eye, absolute for the truth",
    );

    // A live peer says so, and is not rendered as a stale one.
    await rerenderConsole("/fleet/peers/ops-laptop-grace");
    await tabs("ops-laptop-grace");
    const live = screen.getByRole("table", { name: "Peer properties" });
    expect(propertyOf(live, "Last seen")).toMatch(/^(\d+[mhd] ago|just now)2026-09-29 05:59:00Z$/);
    expect(live.querySelector('[data-property="Reachability"] [data-state]')?.textContent).toBe(
      "connected",
    );
  });

  it("reports a guest that has not checked in as disconnected, not as absent", async () => {
    // `legacy-erp` failed, so its agent stopped and its Peer is `disconnected` --
    // which is a different thing from a VM with no Peer at all. A guest still
    // enrolled and holding its address is not gone.
    await renderConsole("/fleet/peers/legacy-erp");
    await tabs("legacy-erp");

    const properties = screen.getByRole("table", { name: "Peer properties" });
    const badge = properties.querySelector('[data-property="Reachability"] [data-state]');
    expect(badge?.textContent).toBe("disconnected");
    expect(badge?.getAttribute("data-tone")).toBe("bad");
    expect(propertyOf(properties, "Last seen")).toMatch(
      /^(\d+[mhd] ago|just now)2026-09-26 06:00:00Z$/,
    );
    // The overlay address is still there, because the enrolment is still there.
    expect(propertyOf(properties, "Overlay address")).toBe("100.64.0.67");
  });

  it("reports the address, the OS and the enrolment's owner", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");

    const properties = screen.getByRole("table", { name: "Peer properties" });
    expect(propertyOf(properties, "Name")).toBe("ops-laptop-sipho");
    expect(propertyOf(properties, "OS")).toBe("linux");
    expect(propertyOf(properties, "Overlay address")).toBe("100.64.0.241");
    expect(propertyOf(properties, "Overlay name")).toBe("ops-laptop-sipho");
    expect(propertyOf(properties, "User")).toBe("sipho");
    expect(propertyOf(properties, "Blocked")).toBe("no");
  });

  it("reports a NetBird-blocked peer as blocked, and does not offer to unblock it", async () => {
    // `phone-sipho` is administratively blocked in NetBird. sovren does not
    // manage NetBird's access rules, so the fact is reported and nothing more.
    await renderConsole("/fleet/peers/phone-sipho");
    await tabs("phone-sipho");

    const properties = screen.getByRole("table", { name: "Peer properties" });
    expect(propertyOf(properties, "Blocked")).toBe("yes — blocked in NetBird");
    expect(propertyHint(properties, "Blocked")).toBe(
      "reported, not acted on: NetBird owns its access rules",
    );
    expect(propertyOf(properties, "OS")).toBe("android");
    expect(propertyOf(properties, "Last seen")).toMatch(
      /^(\d+[mhd] ago|just now)2026-09-26 06:00:00Z$/,
    );
    // And no control of any kind about it: the document declares no operation
    // that changes a NetBird enrolment, so there is nothing the console may offer
    // -- not even a greyed one, which would imply there was something to grey.
    expect(document.querySelector("[data-disabled-action]")).toBeNull();
    expect(document.querySelector("header [data-vm-action], header button")).toBeNull();
  });

  it("shows the Groups in NetBird's own names, and offers nothing it cannot know", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");

    // The two Groups the estate puts a roster peer in, by name and by NetBird id,
    // and no more: the document declares no operation that enumerates Groups, so
    // the page has no roster of its own to offer and this test would fail if one
    // had been written out.
    const chips = [...document.querySelectorAll<HTMLElement>("[data-group]")];
    expect(chips.map((chip) => chip.getAttribute("data-group"))).toEqual(["All", "Operators"]);
    expect(chips[0]?.textContent).toContain("gp_01hq2g0001");
    expect(chips[1]?.textContent).toContain("gp_01hq2g0004");

    // Each is a link to the Peers list filtered by it -- the list's own filter, on
    // the list's own parameter, not a screen's private idea of the question.
    for (const chip of chips) {
      const href = new URL(chip.getAttribute("href") ?? "", "http://console.test");
      expect(href.pathname).toBe("/fleet/peers");
      expect(href.searchParams.get("group")).toBe(chip.getAttribute("data-group"));
    }
    expect(document.body.textContent).toContain(
      "declares no operation that enumerates Groups and this page will not keep its own copy of the roster",
    );
  });

  it("filters the Peers list by a Group, from the Peer's own page", async () => {
    const { router } = await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");

    const chip = document.querySelector<HTMLElement>('[data-group="Operators"]');
    if (chip === null) throw new Error("no Operators chip");
    fireEvent.click(chip);

    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/peers");
    });
    expect(currentUrl(router).searchParams.get("group")).toBe("Operators");

    // Three roster machines are Operators, and the estate's own machines are not.
    const grid = await screen.findByRole("table", { name: "Peers" });
    const names = namesOf(grid);
    expect(names).toContain("ops-laptop-sipho");
    expect(names).toContain("ops-laptop-grace");
    expect(names).toContain("phone-sipho");
    expect(names).not.toContain("accra-server-01");
  });

  it("says a Peer on no machine is not a gap in the estate", async () => {
    // An operator's laptop is a real Peer with no Node and no Site, and a page
    // that rendered that as missing data would be saying the machine has no owner
    // rather than that sovren does not manage it.
    await renderConsole("/fleet/peers/ops-laptop-sipho?tab=machine");
    await tabs("ops-laptop-sipho");

    expect(
      await screen.findByText("ops-laptop-sipho is not on any Node sovren manages"),
    ).toBeDefined();
    expect(screen.getByText(/an operator's own laptop, a phone and a CI runner/)).toBeDefined();

    // And no invented join: no Node, no Site, and no guests table.
    expect(panel("machine").querySelector("table")).toBeNull();
    expect(document.querySelector("[data-node-link]")).toBeNull();
    expect(document.querySelector('[data-join="absent"]')).toBeNull();
  });

  it("says where a managed Peer is, and links to the machine", async () => {
    // `accra-server-01` is both a `Node` and a `Peer`: the Proxmox machine and
    // the NetBird enrolment share a name and an address, deliberately.
    await renderConsole("/fleet/peers/accra-server-01?tab=machine");
    await tabs("accra-server-01");

    const properties = screen.getByRole("table", { name: "Machine properties" });
    expect(propertyOf(properties, "Node")).toBe("accra-server-01");
    expect(propertyOf(properties, "Site")).toBe("accra-lab");

    const node = properties.querySelector<HTMLElement>("[data-node-link]");
    const href = new URL(node?.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/nodes/accra-server-01");
    expect(node?.getAttribute("data-node-link")).toBe("nd_01hq2n0006");
  });

  it("lists the guests on that machine with the VMs list's own columns", async () => {
    await renderConsole("/fleet/peers/accra-server-01?tab=machine");
    const grid = await screen.findByRole("table", { name: "VMs on accra-server-01" });

    // The same three guests the Node detail page's VMs tab shows for this machine,
    // asked of the same operation with the same filter -- which is what makes the
    // two screens one answer rather than two that happen to agree today.
    expect(namesOf(grid)).toEqual(["netbird", "sovren-cp", "golden"]);

    // And the VMs list's column set, not a hand-written one: a purpose, an
    // overlay, a run state, all rendered as the list renders them.
    const headers = [...grid.querySelectorAll("th")].map((cell) => cell.textContent ?? "");
    expect(headers).toEqual(
      expect.arrayContaining(["VM", "Node", "State", "Purpose", "CPU model", "Memory", "Overlay"]),
    );
    const first = rowsOf(grid)[0];
    if (first === undefined) throw new Error("no guest row");
    expect(cellOf(first, "node")).toBe("accra-server-01");
    expect(cellOf(first, "purpose")).toBe("infrastructure");
  });

  it("says the contract does not say which guest is this Peer, rather than guessing", async () => {
    // `Peer` carries `node` and no link to a `VM`. A page that picked one anyway
    // would be right by luck and wrong the first time a machine and one of its
    // guests shared a name -- which this estate already does on purpose.
    await renderConsole("/fleet/peers/postgres-main?tab=machine");
    await tabs("postgres-main");

    const grid = await screen.findByRole("table", { name: "VMs on accra-server-02" });
    expect(namesOf(grid)).toEqual(["postgres-main", "redis-cache", "grafana", "nextcloud"]);

    const note = document.querySelector<HTMLElement>('[data-join="absent"]');
    expect(note?.textContent).toContain("no link from a");
    expect(note?.textContent).toContain("to the");
    expect(note?.textContent).toContain("it might be");
  });

  it("is reachable by name and by id, because every path parameter accepts either", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho");
    await tabs("ops-laptop-sipho");
    const byName = identity().querySelector("code")?.textContent;
    expect(byName).toBe("pr_01hq2p0031");

    // The same page by id, and the tabs work, because the ref goes to every hook
    // on this page untouched.
    await rerenderConsole(`/fleet/peers/${String(byName)}?tab=machine`);
    expect(
      await screen.findByText("ops-laptop-sipho is not on any Node sovren manages"),
    ).toBeDefined();

    await rerenderConsole(`/fleet/peers/${String(byName)}`);
    const properties = await screen.findByRole("table", { name: "Peer properties" });
    expect(propertyOf(properties, "OS")).toBe("linux");
  });

  it("opens from a row on the Peers list, and returns with the filters intact", async () => {
    const { router } = await renderConsole("/fleet/peers?q=ops-laptop&status=stale&size=5");
    const grid = await screen.findByRole("table", { name: "Peers" });

    // The row's identity cell carries the list's own filters, sort and size, which
    // is the other half of the return trip.
    const link = within(grid).getByRole("link", { name: "ops-laptop-sipho" });
    const href = new URL(link.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/peers/ops-laptop-sipho");
    expect(href.searchParams.get("q")).toBe("ops-laptop");
    expect(href.searchParams.get("status")).toBe("stale");
    expect(href.searchParams.get("size")).toBe("5");

    fireEvent.click(link);
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/peers/ops-laptop-sipho");
    });

    const crumb = await crumbToList();
    const back = new URL(crumb.getAttribute("href") ?? "", "http://console.test");
    expect(back.pathname).toBe("/fleet/peers");
    expect(back.searchParams.get("q")).toBe("ops-laptop");
    expect(back.searchParams.get("status")).toBe("stale");
    expect(back.searchParams.get("size")).toBe("5");

    fireEvent.click(crumb);
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/peers");
    });
    expect(currentUrl(router).searchParams.get("status")).toBe("stale");
    // And the operator lands on the same row they left, under the same name filter.
    expect(namesOf(await screen.findByRole("table", { name: "Peers" }))).toEqual([
      "ops-laptop-sipho",
    ]);
  });

  it("keeps the console's own controls on the way in and on the way back", async () => {
    // R56: `?estate=` is in nobody's `OWNED` list, and it is a handle on
    // reproducing a failure by link. `estate=fleet` is the estate already being
    // served, so this asks the question without making the list unreadable.
    const { router } = await renderConsole("/fleet/peers?q=ops-laptop&estate=fleet");
    const link = within(await screen.findByRole("table", { name: "Peers" })).getByRole("link", {
      name: "ops-laptop-sipho",
    });
    fireEvent.click(link);

    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/peers/ops-laptop-sipho");
    });
    expect(currentUrl(router).searchParams.get("estate")).toBe("fleet");

    const back = new URL((await crumbToList()).getAttribute("href") ?? "", "http://console.test");
    expect(back.searchParams.get("estate")).toBe("fleet");
  });

  it("does not put the tab on the list when the operator goes back", async () => {
    const { router } = await renderConsole("/fleet/peers/accra-server-01?tab=machine");
    await tabs("accra-server-01");
    expect(currentUrl(router).searchParams.get("tab")).toBe("machine");

    fireEvent.click(await crumbToList());
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/peers");
    });
    expect(currentUrl(router).searchParams.get("tab")).toBeNull();
  });

  it("says a Peer nothing answers to is not found, rather than showing a blank page", async () => {
    await renderConsole("/fleet/peers/no-such-peer");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(alert.textContent).toMatch(/req_/);
    const back = screen.getByRole("link", { name: /Back to the Peers/ });
    expect(back.getAttribute("href")).toBe("/fleet/peers");
  });

  it("shows the page's own failure when the control plane is not answering", async () => {
    await renderConsole("/fleet/peers/ops-laptop-sipho?sentinel=upstream-unavailable");
    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("upstream_unavailable");
  });
});

/**
 * One property's value, by its label.
 *
 * Read through the `data-property` marker the properties table puts on each row,
 * with the hint element taken out first -- otherwise a property whose value is a
 * bare string has no child element of its own and the hint is what comes back.
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
