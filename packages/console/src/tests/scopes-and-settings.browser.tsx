/**
 * The three scopes, and the connections that live in Settings.
 *
 * Two requirements are being asserted together here, because they are the same
 * requirement seen from two sides: **the scope is in the URL and the navigation
 * changes with it** (R37), and **Settings is where the three integrations live,
 * outside the fleet view** (R96–R100).
 *
 * A Site is a physical grouping and the page has to say so. If a screen ever
 * renders a Site as a tenancy or a security boundary, an operator will eventually
 * rely on an isolation that does not exist, and that is a sentence worth testing
 * rather than a comment worth writing.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole } from "../test/render-console";

const rowsOf = (grid: HTMLElement): HTMLElement[] =>
  [...grid.querySelectorAll("tr[data-row]")] as HTMLElement[];

const hasRow = (grid: HTMLElement, name: string): boolean =>
  rowsOf(grid).some((row) => row.querySelector('[data-column="name"]')?.textContent === name);

const nameOf = (row: HTMLElement): string =>
  row.querySelector('[data-column="name"]')?.textContent ?? "";

/**
 * The individual text nodes under an element.
 *
 * Node by node rather than one concatenated string, because a concatenation
 * glues "Details" to the next cell's name and a check for an opaque run then
 * matches the *seam* between two labels. A credential value, if one were ever
 * rendered, would be inside a single text node -- which is the thing worth
 * asserting.
 */
const textNodes = (root: Node): string[] => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    found.push(node.textContent ?? "");
  }
  return found;
};

describe("the scope switcher", () => {
  it("puts the scope in the URL and rebuilds the sidebar with it", async () => {
    await renderConsole("/fleet/nodes");
    // Wait for the screen an operator would be looking at before clicking
    // anything in it: a click that lands while the first route is still resolving
    // is a click on a console that has not finished starting, and asserting on
    // that would be testing the router's loading state rather than a scope.
    await screen.findByRole("table", { name: "Nodes" });
    expect(screen.getByRole("link", { name: "Fleet" }).getAttribute("aria-current")).toBe("page");

    const fleetNav = screen.getByRole("complementary", { name: "Fleet navigation" });
    expect(within(fleetNav).getByText("Fleet")).toBeDefined();
    // The Fleet sidebar is the estate's resources, and no credentials.
    expect(within(fleetNav).getByRole("link", { name: "Nodes" })).toBeDefined();

    fireEvent.click(screen.getByRole("link", { name: "Settings" }));

    // Waited for on the sidebar rather than on the top bar. A link marks itself
    // current the moment the location changes, which is a tick before the new
    // scope's layout has rendered -- so waiting on the top bar asserts that the
    // URL moved, not that the console did.
    //
    // A different sidebar entirely, then: not the fleet's with one item removed.
    const settingsNav = await screen.findByRole("complementary", { name: "Settings navigation" });
    expect(within(settingsNav).queryByRole("link", { name: "Nodes" })).toBeNull();
    expect(within(settingsNav).getByRole("link", { name: "Connections" })).toBeDefined();
    expect(within(settingsNav).getByRole("link", { name: "Console" })).toBeDefined();
  });

  it("does not discard the operator's place in the scope they left", async () => {
    const { router } = await renderConsole("/fleet/nodes?size=5&sort=cores");
    await screen.findByRole("table", { name: "Nodes" });

    // Leave for another scope, having paged and sorted this one.
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(
        new URL(router.state.location.href, window.location.origin).searchParams.get("page"),
      ).toMatch(/^pt_/);
    });
    const left = router.state.location.href;

    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => {
      expect(new URL(router.state.location.href, window.location.origin).pathname).toBe(
        "/settings/connections",
      );
    });

    // Back, and the page, the sort and the size are all where they were.
    router.history.back();
    await waitFor(() => {
      expect(router.state.location.href).toBe(left);
    });
  });

  it("keeps a Site visible in the URL when the scope is switched away and back", async () => {
    const { router } = await renderConsole("/site/accra-lab/nodes");
    await screen.findByRole("table", { name: "Nodes" });

    const siteLink = screen.getByRole("link", { name: "Site" });
    expect(siteLink.getAttribute("href")).toContain("/site/accra-lab");
    fireEvent.click(screen.getByRole("link", { name: "Fleet" }));
    await waitFor(() => {
      expect(new URL(router.state.location.href, window.location.origin).pathname).toBe(
        "/fleet/nodes",
      );
    });
  });
});

describe("a Site scope", () => {
  it("narrows to one lab", async () => {
    await renderConsole("/site/accra-lab/nodes");
    const grid = await screen.findByRole("table", { name: "Nodes" });

    // Eight accra machines, and not one of the other eleven.
    expect(rowsOf(grid)).toHaveLength(8);
    expect(hasRow(grid, "accra-desk-01")).toBe(true);
    expect(hasRow(grid, "kumasi-desk-01")).toBe(false);
    expect(hasRow(grid, "takoradi-nas-01")).toBe(false);
  });

  it("says what a Site is where an operator chooses one", async () => {
    // A Site is a latency and failure boundary. Not a tenancy, not a security
    // boundary, and the console must never imply that it is either. The sentence
    // belongs to the page whose question is "which lab".
    await renderConsole("/site");
    await screen.findByRole("table", { name: "Sites" });
    const chooser = screen.getByRole("region", { name: "Sites" });
    expect(chooser.textContent).toContain("not a tenancy");
    expect(chooser.textContent).toContain("not a security one");
  });

  it("does not repeat that sentence on every screen in the scope", async () => {
    // Once the Site index has said what a Site is, the sidebar's whole job is to
    // get to one of them. A sentence under the lab list was a sentence under
    // every Peers row in the scope, saying the same thing on all of them.
    await renderConsole("/site/accra-lab/nodes");
    await screen.findByRole("table", { name: "Nodes" });
    const nav = screen.getByRole("complementary", { name: "Site navigation" });
    expect(nav.textContent).not.toContain("not a tenancy");
    expect(within(nav).getByRole("link", { name: "accra-lab" })).toBeDefined();
  });

  it("lists the labs, so a scope is a place an operator can be", async () => {
    await renderConsole("/site");
    const grid = await screen.findByRole("table", { name: "Sites" });

    expect(grid.textContent).toContain("accra-lab");
    expect(grid.textContent).toContain("kumasi-store");
    expect(grid.textContent).toContain("takoradi-annex");
    // Machine counts per lab, so the choice is informed.
    expect(grid.textContent).toContain("8 Nodes");
    expect(grid.textContent).toContain("6 Nodes");
    expect(grid.textContent).toContain("5 Nodes");
  });

  it("says a Site that answers to nothing exists, rather than showing an empty lab", async () => {
    await renderConsole("/site/nowhere/nodes");

    expect(await screen.findByText("No Site is called “nowhere”")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Nodes" })).toBeNull();
  });

  it("has an error state that is not a blank screen", async () => {
    await renderConsole("/site?sentinel=upstream-unavailable");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("upstream_unavailable");
    expect(alert.textContent).toMatch(/req_/);
  });
});

describe("Settings, and the three connections", () => {
  it("holds the three upstream connections, outside the fleet view", async () => {
    await renderConsole("/settings/connections");
    const grid = await screen.findByRole("table", { name: "Connections" });

    expect(rowsOf(grid).map(nameOf)).toEqual([
      expect.stringContaining("proxmox-accra"),
      expect.stringContaining("netbird-accra"),
      expect.stringContaining("dokploy-accra"),
    ]);

    // Nothing of the estate's is on this page: no machines, no guests.
    const main = screen.getByRole("main");
    expect(main.textContent).not.toContain("accra-desk-01");
  });

  it("states that Proxmox needs both an API token and a PAM SSH key", async () => {
    await renderConsole("/settings/connections");
    const grid = await screen.findByRole("table", { name: "Connections" });

    const proxmox = rowsOf(grid)[0];
    if (proxmox === undefined) throw new Error("no Proxmox row");
    const credentials = proxmox.querySelector<HTMLElement>('[data-column="credentials"]');
    if (credentials === null) throw new Error("no credentials cell");

    // Two requirements, named in Proxmox's own words, and not presented as one.
    expect(credentials.textContent).toContain("API token");
    expect(credentials.textContent).toContain("PAM SSH key");
    expect(within(credentials).getAllByText("held")).toHaveLength(2);

    // And the reason, which is a property of Proxmox rather than a preference --
    // read from the requirement, so it cannot drift from the contract.
    fireEvent.click(within(proxmox).getByRole("link", { name: "Details" }));
    const requirements = await screen.findByText("What it needs");
    expect(requirements.textContent).toBeDefined();
    const page = screen.getByRole("main");
    expect(page.textContent).toContain(
      "Cloud-init snippets need SFTP and a PAM account. The API token cannot upload them.",
    );
  });

  it("shows that a credential is held, and never renders one back", async () => {
    await renderConsole("/settings/connections");
    const grid = await screen.findByRole("table", { name: "Connections" });

    const proxmox = rowsOf(grid)[0];
    if (proxmox === undefined) throw new Error("no Proxmox row");
    const credentials = proxmox.querySelector<HTMLElement>('[data-column="credentials"]');
    if (credentials === null) throw new Error("no credentials cell");

    // The fact, and when it became true. Rotation is the question an operator
    // has about a stored credential, and it is answerable without the credential.
    expect(credentials.textContent).toContain("held");
    expect(credentials.textContent).toContain("since 2026-03-04 09:00:00Z");

    // Nothing rendered here is a long opaque run. A credential value would be,
    // and the contract has no field for one -- so its absence is asserted rather
    // than assumed, node by node so the check cannot match a seam between labels.
    const opaque = /[A-Za-z0-9+/]{24,}={0,2}/;
    for (const node of [...textNodes(credentials), ...textNodes(grid)]) {
      expect(node).not.toMatch(opaque);
    }
  });

  it("runs a connection test and reports pass or fail with a sovren code", async () => {
    await renderConsole("/settings/connections");
    const grid = await screen.findByRole("table", { name: "Connections" });

    // NetBird, which the estate has tested: it answers.
    const netbird = rowsOf(grid)[1];
    if (netbird === undefined) throw new Error("no NetBird row");
    fireEvent.click(within(netbird).getByRole("button", { name: "Test connection" }));

    const passed = await screen.findByText("netbird-accra answers");
    expect(passed.textContent).toBeDefined();
    // A latency and a requestId: what was observed, and nothing more.
    expect(screen.getByTestId("toasts").textContent).toMatch(/req_/);

    // Dokploy, whose credential the last test rejected. The test itself ran --
    // it is a 200 either way -- so the console says what it observed rather than
    // reporting a failure to run.
    const dokploy = rowsOf(screen.getByRole("table", { name: "Connections" }))[2];
    if (dokploy === undefined) throw new Error("no Dokploy row");
    fireEvent.click(within(dokploy).getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(screen.getByText("dokploy-accra does not answer")).toBeDefined();
    });
    const toasts = screen.getByTestId("toasts");
    expect(toasts.textContent).toContain("upstream_unauthenticated");
    expect(toasts.textContent).toMatch(/req_/);
    expect(screen.queryByText(/did not run/)).toBeNull();
  });

  it("has an error state that is not a blank screen", async () => {
    await renderConsole("/settings/connections?sentinel=unauthorised");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("unauthorised");
    expect(alert.textContent).toMatch(/req_/);
  });

  it("opens an integration by name and by id, because the contract accepts both", async () => {
    await renderConsole("/settings/connections/proxmox-accra");
    const byName = await screen.findByRole("region", { name: "proxmox-accra" });
    const id = byName.querySelector('[data-identity="true"] code')?.textContent;
    expect(id).toMatch(/^cn_/);

    await renderConsole(`/settings/connections/${String(id)}`);
    const byId = await screen.findByRole("region", { name: "proxmox-accra" });
    expect(byId.textContent).toContain("PAM SSH key");
  });

  it("says a connection nothing answers to is not found, rather than showing a blank page", async () => {
    await renderConsole("/settings/connections/not-a-connection");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(screen.getByRole("link", { name: /Back to the connections/ })).toBeDefined();
  });
});
