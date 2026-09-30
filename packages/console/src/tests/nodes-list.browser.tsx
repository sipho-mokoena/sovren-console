/**
 * The Nodes list, in a browser, against the generated mock backend.
 *
 * The seam is the whole point: the estate is seeded by the world builder, the
 * handlers are the ones orval generated from the document, the client is the one
 * orval generated, and the only thing between them is the console. A screen that
 * renders seeded rows here is a screen that will render real rows.
 *
 * Expected values are literals, or values read out of the estate file by name.
 * A test that recomputed its expectation the way the code computes it would agree
 * by construction and assert nothing -- so the row counts are written out and
 * the row contents are named, not derived.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole } from "../test/render-console";

/** The Nodes table, once it has rendered. */
const nodesTable = async (): Promise<HTMLElement> =>
  await screen.findByRole("table", { name: "Nodes" });

/**
 * The address the console is at, as a URL.
 *
 * The router's `href` is a path, because that is what a router holds; the origin
 * comes from the document so the two can be compared as URLs rather than as
 * strings with a query appended in the right order by luck.
 */
const currentUrl = (router: { state: { location: { href: string } } }): URL =>
  new URL(router.state.location.href, window.location.origin);

/** The rows of a table, header excluded. */
const rowsOf = (grid: HTMLElement): HTMLElement[] =>
  [...grid.querySelectorAll("tr[data-row]")] as HTMLElement[];

/**
 * One row, found by the name in its identity column.
 *
 * Scoped to the identity column deliberately: a Node's name is also its overlay
 * hostname, so a query for the name across the whole row finds two elements in
 * every row. That is a true fact about the estate and a nuisance for a test.
 */
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

describe("Fleet → Nodes", () => {
  it("renders a row per seeded Node, from the mock backend", async () => {
    await renderConsole("/fleet/nodes");
    const grid = await nodesTable();

    // The header, plus the nineteen Nodes the fleet estate is seeded with.
    expect(within(grid).getAllByRole("row")).toHaveLength(20);

    // Rows from three different Sites, which is also the assertion that the Fleet
    // scope is not quietly filtering itself to one lab.
    expect(cellOf(rowNamed(grid, "accra-desk-01"), "site")).toBe("accra-lab");
    expect(cellOf(rowNamed(grid, "kumasi-desk-01"), "site")).toBe("kumasi-store");
    expect(cellOf(rowNamed(grid, "takoradi-nas-01"), "site")).toBe("takoradi-annex");
  });

  it("shows what a Node actually has: CPU, cores, memory, drives, overlay", async () => {
    await renderConsole("/fleet/nodes");
    const row = rowNamed(await nodesTable(), "accra-desk-01");

    // The 2009 Core 2 Duo, reported as itself rather than as the fleet floor.
    expect(cellOf(row, "cpu")).toContain("Intel Core 2 Duo E8400");
    expect(cellOf(row, "cores")).toBe("2");
    expect(cellOf(row, "memory")).toBe("4.0 GiB of 4.0 GiB");
    expect(cellOf(row, "drives")).toBe("2 × 1000 GiB");
    expect(cellOf(row, "overlay")).toContain("100.64.0.12");
    expect(cellOf(row, "status")).toBe("online");

    // And heterogeneity survives to the screen: a 2020 Ryzen beside the 2009
    // desktop, with the cores each of them actually has.
    expect(cellOf(rowNamed(await nodesTable(), "accra-rig-01"), "cores")).toBe("8");
  });

  it("makes a Node with no overlay address visible as one, not as an empty cell", async () => {
    await renderConsole("/fleet/nodes");
    const grid = await nodesTable();

    // takoradi-nas-01 is the estate's unenrolled machine. `overlay` is null
    // there, which is a real state and has to read as one.
    const unenrolled = rowNamed(grid, "takoradi-nas-01");
    expect(
      unenrolled
        .querySelector('[data-column="overlay"] [data-overlay]')
        ?.getAttribute("data-overlay"),
    ).toBe("null");
    expect(within(unenrolled).getByText("not enrolled")).toBeDefined();

    // An enrolled Node is marked as enrolled, so the two are distinguishable
    // without opening anything.
    const enrolled = rowNamed(grid, "accra-desk-01");
    expect(
      enrolled
        .querySelector('[data-column="overlay"] [data-overlay]')
        ?.getAttribute("data-overlay"),
    ).toBe("enrolled");
  });

  it("renders a disabled action with the sovren code that refuses it", async () => {
    await renderConsole("/fleet/nodes");
    const row = rowNamed(await nodesTable(), "accra-desk-01");

    const migrate = within(row).getByRole("button", { name: "Migrate" }) as HTMLButtonElement;
    expect(migrate.disabled).toBe(true);

    // The code, not a sentence. The control and the request it would have made
    // speak one vocabulary, so a greyed button and a failed request are readable
    // by the same rule.
    expect(within(row).getByText("action_not_permitted")).toBeDefined();

    // The sentence is still reachable, because an operator should not need to
    // know the vocabulary to find out what to do next.
    expect(migrate.getAttribute("aria-describedby")).not.toBeNull();
    expect(row.textContent).toContain("Migrate is unavailable");
  });

  it("has fixed row heights and both sticky columns", async () => {
    await renderConsole("/fleet/nodes");
    const grid = await nodesTable();

    for (const row of rowsOf(grid)) expect(row.className).toContain("h-8");

    const identity = grid.querySelector('th[data-column="name"]');
    expect(identity?.className).toContain("sticky");
    expect(identity?.className).toContain("left-0");

    // The action column is the last header, pinned to the right.
    const actions = within(grid).getAllByRole("columnheader").at(-1);
    expect(actions?.textContent).toBe("Actions");
    expect(actions?.className).toContain("right-0");
  });

  it("paginates on the opaque token the server hands out, never an offset", async () => {
    const { router } = await renderConsole("/fleet/nodes?size=5");
    expect(rowsOf(await nodesTable())).toHaveLength(5);

    const next = screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);

    // The token is in the URL, and it is opaque: not an integer, so a client
    // cannot construct one and a control plane cannot be asked to skip rows.
    const token = currentUrl(router).searchParams.get("page");
    expect(token).toMatch(/^pt_/);
    expect(Number.isNaN(Number(token))).toBe(true);

    // A different page, so different rows: the first machine is behind us and the
    // sixth has arrived. The estate's own order, which is not alphabetical.
    await waitFor(() => {
      expect(hasRow(screen.getByRole("table", { name: "Nodes" }), "kumasi-desk-01")).toBe(true);
    });
    expect(hasRow(screen.getByRole("table", { name: "Nodes" }), "accra-desk-01")).toBe(false);
    expect(rowsOf(screen.getByRole("table", { name: "Nodes" }))).toHaveLength(5);

    // And back, over the same tokens, because a keyset cursor is walkable in
    // both directions.
    const back = screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("page")).toBeNull();
    });
  });

  it("puts a filter in the URL, and the back button returns to the previous view", async () => {
    const { router } = await renderConsole("/fleet/nodes");
    await nodesTable();

    fireEvent.change(screen.getByLabelText("Filter Nodes by name"), {
      target: { value: "kumasi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply the name filter" }));

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("q")).toBe("kumasi");
    });
    await waitFor(() => {
      // Six kumasi machines, and not one of the other thirteen.
      expect(rowsOf(screen.getByRole("table", { name: "Nodes" }))).toHaveLength(6);
    });
    expect(hasRow(screen.getByRole("table", { name: "Nodes" }), "accra-desk-01")).toBe(false);

    // The view is a link, so it survives a reload: the URL is the whole state.
    expect(router.state.location.href).toContain("q=kumasi");

    // And the back button returns to the view before it, filters and all.
    fireEvent.click(screen.getByRole("link", { name: "Site" }));
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/site");
    });
    router.history.back();
    await waitFor(() => {
      const back2 = currentUrl(router);
      expect(back2.pathname).toBe("/fleet/nodes");
      expect(back2.searchParams.get("q")).toBe("kumasi");
    });
  });

  it("puts a sort in the URL and orders the rows it is showing", async () => {
    const { router } = await renderConsole("/fleet/nodes?size=19");
    const grid = await nodesTable();
    fireEvent.click(within(grid).getByRole("button", { name: /^Cores/ }));

    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("cores");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "Nodes" }));
      // Ascending by cores, so the narrowest machine leads and the widest -- the
      // twenty-four core Xeon Gold, the estate's largest -- trails.
      expect(cellOf(rows[0] as HTMLElement, "cores")).toBe("2");
      expect(cellOf(rows.at(-1) as HTMLElement, "cores")).toBe("24");
    });

    // Pressing the same header again reverses it, in the URL.
    fireEvent.click(
      within(screen.getByRole("table", { name: "Nodes" })).getByRole("button", { name: /^Cores/ }),
    );
    await waitFor(() => {
      expect(currentUrl(router).searchParams.get("sort")).toBe("-cores");
    });
    await waitFor(() => {
      const rows = rowsOf(screen.getByRole("table", { name: "Nodes" }));
      expect(cellOf(rows[0] as HTMLElement, "cores")).toBe("24");
    });
  });

  it("distinguishes a stale view from a broken one, and never calls a failed refresh fresh", async () => {
    const { router } = await renderConsole("/fleet/nodes");
    await nodesTable();
    expect(screen.getByText("Updated just now")).toBeDefined();

    // Stage a failure without leaving the list, which is what a refresh failing
    // looks like: the rows are still real, the last good answer is still the last
    // good answer, and the new request came back with a code.
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
    expect(rowNamed(await nodesTable(), "accra-desk-01")).toBeDefined();
    expect(screen.getByText("upstream_unavailable")).toBeDefined();
    expect(screen.getByText(/The last refresh failed/)).toBeDefined();
  });

  it("renders the error state, with the code and the requestId, when nothing has ever loaded", async () => {
    await renderConsole("/fleet/nodes?sentinel=conflict");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("conflict");

    // The requestId is what joins what the operator sees to the audit log.
    expect(alert.textContent).toMatch(/requestId\s*req_/);

    // An error state that only reports is a dead end, so there is something to do.
    expect(within(alert).getByRole("button", { name: /Try again/ })).toBeDefined();
  });

  it("renders an empty state that is not a blank screen", async () => {
    await renderConsole("/fleet/nodes?q=no-such-machine");

    expect(await screen.findByText("No Node matches “no-such-machine”")).toBeDefined();
    expect(screen.getByRole("button", { name: /Clear the filter/ })).toBeDefined();
  });

  it("reads a different estate from the URL, and says which one it is serving", async () => {
    await renderConsole("/fleet/nodes?estate=compact");

    // The compact estate is two Nodes, so the dense table is exercised at a
    // width where a lab does not fit -- with every column still present.
    await waitFor(() => {
      expect(rowsOf(screen.getByRole("table", { name: "Nodes" }))).toHaveLength(2);
    });
    expect(screen.getByText("serving the compact estate")).toBeDefined();
  });
});
