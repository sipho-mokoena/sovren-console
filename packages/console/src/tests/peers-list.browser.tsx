/**
 * The Peers list, in a browser, against the generated mock backend.
 *
 * The seam is the whole point: the estate is seeded by the world builder, the
 * handlers are the ones orval generated from the document, the client is the one
 * orval generated, and the only thing between them is the console. A screen that
 * renders seeded rows here is a screen that will render real rows.
 *
 * Expected values are literals, or values read out of the estate file by name. A
 * test that recomputed its expectation the way the code computes it would agree by
 * construction and assert nothing -- so the row counts are written out and the row
 * contents are named, not derived.
 *
 * ## What the timestamps are asserted against, and why
 *
 * The `lastSeen` cell carries a relative label and an absolute one. Tests assert
 * the **absolute** one, because the relative one is a function of the wall clock:
 * the estate's `now` is a fixed instant, and a machine running the test is at some
 * other one, so "9h ago" is "7h ago" depending on the day. The absolute stamp is
 * a fact about the estate and is the half that is worth pinning.
 *
 * The staleness assertions deliberately assert `data-status` and not the word. A
 * test that asserted "the row says stale" would pass on any screen that merely
 * printed the string; the `data-status` marker is what the control plane's
 * decision is rendered *from*, and the absence of a threshold in the UI is proved
 * by the fact that no local code computes one.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole } from "../test/render-console";

/** The Peers table, once it has rendered. */
const peersTable = async (): Promise<HTMLElement> =>
  await screen.findByRole("table", { name: "Peers" });

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

/** The control plane's reachability verdict, as the row rendered it. */
const statusOf = (row: HTMLElement): string | null =>
  row.querySelector('[data-column="status"] [data-status]')?.getAttribute("data-status") ?? null;

/** The reachability filter's four toggles, as a scoped query. */
const statusFilter = (): HTMLElement =>
  screen.getByRole("group", {
    name: "Filter Peers by reachability",
  });

describe("Fleet → Peers", () => {
  it("renders a page of seeded Peers, and stops at the document's default page size", async () => {
    await renderConsole("/fleet/peers");
    const grid = await peersTable();

    // The header, plus twenty-five rows: the document's default `size`, and a
    // server-side cut, not a client-side one.
    expect(within(grid).getAllByRole("row")).toHaveLength(26);

    // The whole estate is forty-seven peers, so a page that shows all of them
    // would be ignoring the document's own default.
    expect(rowsOf(grid)).toHaveLength(25);
  });

  it("shows what a Peer is: overlay address, OS, NetBird Groups, last seen", async () => {
    await renderConsole("/fleet/peers");
    const row = rowNamed(await peersTable(), "accra-desk-01");

    // The machine's own overlay address, and the name NetBird resolves it by --
    // which is the peer's name, so a query for the name across the whole row finds
    // two elements in every row. Scoping to the identity column avoids that.
    expect(cellOf(row, "address")).toContain("100.64.0.12");
    expect(cellOf(row, "os")).toBe("linux");
    expect(cellOf(row, "lastSeen")).toContain("2026-09-29 05:58:00Z");
    expect(statusOf(row)).toBe("connected");
  });

  it("names Groups the way NetBird names them, not with a sovren synonym", async () => {
    await renderConsole("/fleet/peers?size=60");
    const grid = await peersTable();

    // A machine in the estate, in Infrastructure; a Service host's machine in
    // Service Hosts; an operator's laptop in Operators. The words are NetBird's,
    // capitalised as NetBird capitalises them, because a sovren synonym would
    // force the operator to hold a translation table.
    expect(cellOf(rowNamed(grid, "accra-desk-01"), "groups")).toContain("Infrastructure");
    expect(cellOf(rowNamed(grid, "accra-server-01"), "groups")).toContain("Service Hosts");
    expect(cellOf(rowNamed(grid, "accra-desk-01"), "groups")).toContain("All");

    // And a roster peer, which is in no Site and behind no Node, is still a Peer.
    const laptop = rowNamed(grid, "ops-laptop-sipho");
    expect(cellOf(laptop, "groups")).toContain("Operators");
    expect(
      laptop.querySelector('[data-column="node"] [data-node]')?.getAttribute("data-node"),
    ).toBe("none");
    expect(cellOf(laptop, "node")).toBe("not estate hardware");
  });

  it("makes a peer that dropped off visible as one, without opening anything", async () => {
    await renderConsole("/fleet/peers?size=60");
    const grid = await peersTable();

    // ops-laptop-sipho has not been heard from in six days. The verdict is the
    // control plane's -- it arrives as `Peer.status` and is rendered as a badge and
    // a marker, and the console holds no threshold of its own to compare the
    // timestamp against.
    const dropped = rowNamed(grid, "ops-laptop-sipho");
    expect(statusOf(dropped)).toBe("stale");
    expect(within(dropped).getByText("stale")).toBeDefined();
    expect(within(dropped).getByText("not seen lately")).toBeDefined();
    expect(cellOf(dropped, "lastSeen")).toContain("2026-09-23 06:00:00Z");

    // A live peer is distinguishable from it in the row and not only in the badge:
    // different tone, different second line, a different marker.
    const live = rowNamed(grid, "accra-desk-01");
    expect(statusOf(live)).toBe("connected");
    expect(within(live).getByText("answering")).toBeDefined();

    const toneOf = (row: HTMLElement): string | null =>
      row.querySelector('[data-column="status"] [data-state]')?.getAttribute("data-tone") ?? null;
    expect(toneOf(dropped)).toBe("warn");
    expect(toneOf(live)).toBe("ok");
  });

  it("keeps stale, disconnected and connected apart, because they are three problems", async () => {
    await renderConsole("/fleet/peers?size=60");
    const grid = await peersTable();

    // A machine that is merely asleep comes back; one that is off does not. The
    // contract says so about the vocabulary, and the screen does not collapse the
    // two into "not connected".
    expect(statusOf(rowNamed(grid, "ops-laptop-sipho"))).toBe("stale");
    expect(statusOf(rowNamed(grid, "phone-sipho"))).toBe("stale");
    expect(statusOf(rowNamed(grid, "ci-runner-02"))).toBe("disconnected");
    expect(statusOf(rowNamed(grid, "accra-laptop-01"))).toBe("disconnected");

    // A guest that is stopped is still enrolled and still holds its address, so its
    // peer is `disconnected` rather than absent -- and the VM is still on the VMs
    // list. Two views of the same fact, neither contradicting the other.
    expect(statusOf(rowNamed(grid, "golden"))).toBe("disconnected");
    expect(statusOf(rowNamed(grid, "legacy-erp"))).toBe("disconnected");

    const toneOf = (row: HTMLElement): string | null =>
      row.querySelector('[data-column="status"] [data-state]')?.getAttribute("data-tone") ?? null;
    expect(toneOf(rowNamed(grid, "ops-laptop-sipho"))).toBe("warn");
    expect(toneOf(rowNamed(grid, "ci-runner-02"))).toBe("bad");
  });

  it("filters by staleness, and puts the filter in the URL", async () => {
    const { router } = await renderConsole("/fleet/peers?size=60");
    await peersTable();

    // The vocabulary is the document's: connected, stale, disconnected, unknown.
    expect(
      within(statusFilter())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["connected", "stale", "disconnected", "unknown"]);

    fireEvent.click(within(statusFilter()).getByRole("button", { name: "stale" }));

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("status")).toBe("stale");
    });
    await waitFor(() => {
      // Two peers in the estate are stale, and the view is narrowed by the control
      // plane rather than by a predicate in the browser.
      expect(rowsOf(screen.getByRole("table", { name: "Peers" }))).toHaveLength(2);
    });
    const grid = screen.getByRole("table", { name: "Peers" });
    expect(hasRow(grid, "ops-laptop-sipho")).toBe(true);
    expect(hasRow(grid, "phone-sipho")).toBe(true);
    expect(hasRow(grid, "accra-desk-01")).toBe(false);
    for (const row of rowsOf(grid)) expect(statusOf(row)).toBe("stale");

    // The pressed control wears the badge, so the choice and its consequence read
    // as one thing rather than as a highlighted word and a table of amber.
    expect(
      within(statusFilter()).getByRole("button", { name: "stale" }).getAttribute("aria-pressed"),
    ).toBe("true");

    // And the way back to everything is the control just used.
    fireEvent.click(within(statusFilter()).getByRole("button", { name: "stale" }));
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("status")).toBeNull();
    });
  });

  it("filters by a NetBird Group, and by name, both in the URL", async () => {
    const { router } = await renderConsole("/fleet/peers?size=60");
    await peersTable();

    fireEvent.change(screen.getByLabelText("Filter Peers by NetBird Group"), {
      target: { value: "Service Hosts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Group" }));

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("group")).toBe("Service Hosts");
    });
    await waitFor(() => {
      // Four machines whose names say they are servers, and twelve guests that
      // host a Service and have enrolled -- the four server machines and the
      // twelve guests, and not one of the other thirty peers.
      expect(rowsOf(screen.getByRole("table", { name: "Peers" }))).toHaveLength(16);
    });
    const grid = screen.getByRole("table", { name: "Peers" });
    for (const row of rowsOf(grid)) {
      expect(row.querySelector('[data-groups] [data-group="Service Hosts"]')).not.toBeNull();
    }
    expect(hasRow(grid, "accra-server-01")).toBe(true);
    expect(hasRow(grid, "postgres-main")).toBe(true);
    expect(hasRow(grid, "accra-desk-01")).toBe(false);

    // The view is a link, so it survives a reload and a hand to a colleague.
    expect(router.state.location.href).toContain("group=Service");

    // A name filter on top of it, narrowed by the same list state.
    fireEvent.change(screen.getByLabelText("Filter Peers by name"), {
      target: { value: "kumasi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply the name filter" }));
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("q")).toBe("kumasi");
    });
    await waitFor(() => {
      // The five kumasi Service hosts -- two websites, a database, a cache and the
      // store room's own server -- with the Group filter still on underneath.
      expect(rowsOf(screen.getByRole("table", { name: "Peers" }))).toHaveLength(5);
    });
  });

  it("ignores a filter value the contract does not define, rather than asking for it", async () => {
    const { router } = await renderConsole("/fleet/peers?status=stalee&size=60");
    await peersTable();

    // `PeerStatus` is a closed vocabulary, so a URL naming a state the document
    // does not declare is no filter at all. Asking the control plane for it would
    // be a request nothing can answer. All forty-six peers, unfiltered.
    expect(rowsOf(screen.getByRole("table", { name: "Peers" }))).toHaveLength(46);
    for (const button of within(statusFilter()).getAllByRole("button")) {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }

    // And the link is still shareable, because the URL is the whole state.
    expect(currentUrl(router).searchParams.get("status")).toBe("stalee");
  });

  it("puts a sort in the URL and orders the rows it is showing", async () => {
    const { router } = await renderConsole("/fleet/peers?size=60");
    const grid = await peersTable();
    fireEvent.click(within(grid).getByRole("button", { name: /^OS/ }));

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("os");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "Peers" }));
      // Ascending by OS, and the sort is client-side over the page the server
      // served -- no list operation declares a sort parameter, so there is nothing
      // to send. android is the first value the document declares, and the estate's
      // only android peer is the phone.
      expect(cellOf(rows[0] as HTMLElement, "name")).toBe("phone-sipho");
      expect(cellOf(rows[0] as HTMLElement, "os")).toBe("android");
      expect(cellOf(rows.at(-1) as HTMLElement, "os")).toBe("macos");
    });

    // Pressing the same header again reverses it, in the URL.
    fireEvent.click(
      within(screen.getByRole("table", { name: "Peers" })).getByRole("button", { name: /^OS/ }),
    );
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("-os");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "Peers" }));
      expect(cellOf(rows[0] as HTMLElement, "os")).toBe("macos");
    });
  });

  it("paginates on the opaque token the server hands out, never an offset", async () => {
    const { router } = await renderConsole("/fleet/peers?size=25");
    expect(rowsOf(await peersTable())).toHaveLength(25);

    const next = screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);

    // The token is in the URL, and it is opaque: not an integer, so a client
    // cannot construct one and a control plane cannot be asked to skip rows.
    const token = currentUrl(router).searchParams.get("page");
    expect(token).toMatch(/^pt_/);
    expect(Number.isNaN(Number(token))).toBe(true);

    await waitFor(() => {
      expect(hasRow(screen.getByRole("table", { name: "Peers" }), "accra-desk-01")).toBe(false);
    });
    // The estate's own order, which is not alphabetical: the second page carries on
    // from the twenty-fifth peer rather than starting again. Twenty-one left of the
    // forty-six.
    expect(rowsOf(screen.getByRole("table", { name: "Peers" }))).toHaveLength(21);

    // And back, over the same tokens, because a keyset cursor is walkable in both
    // directions.
    const back = screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("page")).toBeNull();
    });
  });

  it("renders the error state, with the code and the requestId, as Nodes does", async () => {
    // The archetype owns this state, and this screen gets it by supplying nothing.
    await renderConsole("/fleet/peers?sentinel=conflict");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("conflict");
    expect(alert.textContent).toMatch(/requestId\s*req_/);
    expect(within(alert).getByRole("button", { name: /Try again/ })).toBeDefined();
  });

  it("distinguishes a stale view from a broken one, and never calls a failed refresh fresh", async () => {
    const { router } = await renderConsole("/fleet/peers");
    await peersTable();
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
    expect(rowNamed(await peersTable(), "accra-desk-01")).toBeDefined();
    expect(screen.getByText("upstream_unavailable")).toBeDefined();
    expect(screen.getByText(/The last refresh failed/)).toBeDefined();
  });

  it("renders an empty state that is not a blank screen", async () => {
    await renderConsole("/fleet/peers?q=no-such-machine");

    expect(await screen.findByText("No Peer matches “no-such-machine”")).toBeDefined();
    expect(screen.getByRole("button", { name: /Clear the filters/ })).toBeDefined();
  });

  it("says which filter matched nothing, and why that is not the same as no peers", async () => {
    // A Group nobody in the estate is in, so the answer really is empty -- and the
    // empty state names the filter that emptied it rather than the estate.
    await renderConsole("/fleet/peers?group=No%20Such%20Group");

    expect(await screen.findByText("No Peer in the Group “No Such Group”")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Peers" })).toBeNull();
  });

  it("reads a different estate from the URL, and says which one it is serving", async () => {
    await renderConsole("/fleet/peers?estate=compact");

    // The compact estate is three peers, and it carries the awkward cases: a peer
    // not seen in six days, with no Node and no Site behind it.
    await waitFor(() => {
      expect(rowsOf(screen.getByRole("table", { name: "Peers" }))).toHaveLength(3);
    });
    const grid = screen.getByRole("table", { name: "Peers" });
    expect(statusOf(rowNamed(grid, "ops-laptop-sipho"))).toBe("stale");
    expect(rowNamed(grid, "ops-laptop-sipho").querySelector('[data-node="none"]')).not.toBeNull();
    expect(screen.getByText("serving the compact estate")).toBeDefined();
  });
});

describe("Site → Peers", () => {
  it("is the same screen, filtered to one lab, and the Node column goes away", async () => {
    await renderConsole("/site/accra-lab/peers");
    const grid = await peersTable();

    // The eight machines in accra-lab, and the fifteen guests of theirs that have
    // enrolled. The roster peers are in no Site at all, so the site filter removes
    // them -- an operator's own laptop is not in the lab, and pretending otherwise
    // would be a Site reading as a tenancy, which R28 says it is not.
    expect(rowsOf(grid)).toHaveLength(23);
    expect(hasRow(grid, "accra-desk-01")).toBe(true);
    expect(hasRow(grid, "paperless")).toBe(true);
    expect(hasRow(grid, "ops-laptop-sipho")).toBe(false);
    expect(hasRow(grid, "kumasi-desk-01")).toBe(false);

    // Every row is in the lab, so naming the machine in every row would be
    // repeating what the sidebar already says.
    expect(grid.querySelector('th[data-column="node"]')).toBeNull();
    expect(within(grid).getByRole("columnheader", { name: /^Peer/ })).toBeDefined();
  });

  it("says a Site that nothing answers to, rather than listing it as empty", async () => {
    await renderConsole("/site/no-such-lab/peers");

    expect(await screen.findByText("No Site is called “no-such-lab”")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Peers" })).toBeNull();
  });
});
