/**
 * Infrastructure and Workloads: one list, two questions.
 *
 * An operator either runs the estate or uses a box. One table of every guest put
 * a Dokploy host beside the machine somebody was handed last week, and the
 * complaint was not that a row was wrong -- every row was a real VM -- but that
 * the two kinds of thing were on the same piece of paper with nothing saying
 * which kind was which.
 *
 * So the console has two entries and the assertions below are the three things
 * that has to mean:
 *
 *   1. **They are two views, and the page says which one it is.** The heading is
 *      `Infrastructure` or `Workloads`, not `VMs`, because a heading that named
 *      the route rather than the question would leave the two told apart only by
 *      which filter button happened to be pressed.
 *   2. **They are disjoint.** No VM is on both.
 *   3. **Together they are the whole estate.** Every VM the bare `/fleet/vms`
 *      shows is on one of them or the other, and none is counted twice -- which
 *      is what makes "infrastructure or service" and "workload" a partition of
 *      the contract's `purpose` rather than two overlapping favourites.
 *
 * The bare `/fleet/vms` is asserted separately, because the whole arrangement
 * rests on one rule: **the filter is only ever what the URL says.** An operator
 * who arrives at `/fleet/vms` gets every VM in the estate, is told so in the
 * heading and in the page's own switch, and is never quietly handed one of the
 * two views.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole } from "../test/render-console";

/** Every VM name in the fleet estate. */
const ESTATE = [
  "netbird",
  "sovren-cp",
  "dokploy-01",
  "golden",
  "golden-tpl",
  "backup-target",
  "postgres-main",
  "redis-cache",
  "grafana",
  "paperless",
  "immich",
  "nextcloud",
  "takoradi-edge-01",
  "takoradi-media",
  "kumasi-web-01",
  "kumasi-web-02",
  "kumasi-db-01",
  "kumasi-cache-01",
  "grafana-canary",
  "wireguard-lab",
  "k8s-control-01",
  "k8s-worker-01",
  "k8s-worker-02",
  "lab-build-01",
  "spare-bench-01",
  "lab-build-02",
  "legacy-erp",
] as const;

/** `purpose=infrastructure` and `purpose=service`: the machines sovren runs. */
const INFRASTRUCTURE = [
  "netbird",
  "sovren-cp",
  "dokploy-01",
  "golden",
  "golden-tpl",
  "backup-target",
  "postgres-main",
  "redis-cache",
  "grafana",
  "paperless",
  "immich",
  "nextcloud",
  "takoradi-edge-01",
  "takoradi-media",
  "kumasi-web-01",
  "kumasi-web-02",
  "kumasi-db-01",
  "kumasi-cache-01",
  "grafana-canary",
] as const;

/** `purpose=workload`: the boxes handed to an operator. */
const WORKLOADS = [
  "wireguard-lab",
  "k8s-control-01",
  "k8s-worker-01",
  "k8s-worker-02",
  "lab-build-01",
  "spare-bench-01",
  "lab-build-02",
  "legacy-erp",
] as const;

const sorted = (values: readonly string[]): string[] => [...values].sort();

/** The names in a table, header excluded. */
const namesIn = (grid: HTMLElement): string[] =>
  [...grid.querySelectorAll("tr[data-row]")].map(
    (row) => row.querySelector('[data-column="name"]')?.textContent ?? "",
  );

/** The `purpose` each row is carrying, as the contract spelled it. */
const purposesIn = (grid: HTMLElement): string[] =>
  [...grid.querySelectorAll("tr[data-row]")].map(
    (row) =>
      row.querySelector('[data-column="purpose"] [data-purpose]')?.getAttribute("data-purpose") ??
      "",
  );

/** The fleet sidebar, which is where the two entries live. */
const fleetNav = (): HTMLElement => screen.getByRole("complementary", { name: "Fleet navigation" });

/** The page's own view switch, as opposed to the purpose rail that refines it. */
const viewSwitch = (): HTMLElement => screen.getByRole("navigation", { name: "VM view" });

describe("the two views of the VMs list", () => {
  it("reaches each of them from the sidebar, and the heading names the one on screen", async () => {
    await renderConsole("/fleet/nodes");
    await screen.findByRole("table", { name: "Nodes" });

    // Two entries, one list, two questions. The link is the whole of it.
    const infraHref = within(fleetNav()).getByRole("link", { name: "Infrastructure" });
    expect(infraHref.getAttribute("href")).toBe(
      "/fleet/vms?purpose=infrastructure&purpose=service",
    );
    expect(within(fleetNav()).getByRole("link", { name: "Workloads" }).getAttribute("href")).toBe(
      "/fleet/vms?purpose=workload",
    );

    fireEvent.click(infraHref);

    // The heading, not the route: an operator has to be able to tell what they
    // are looking at from the top of the page without reading the URL.
    expect(await screen.findByRole("heading", { name: "Infrastructure" })).toBeDefined();
    expect(namesIn(await screen.findByRole("table", { name: "Infrastructure" })).sort()).toEqual(
      sorted(INFRASTRUCTURE),
    );

    fireEvent.click(within(fleetNav()).getByRole("link", { name: "Workloads" }));

    expect(await screen.findByRole("heading", { name: "Workloads" })).toBeDefined();
    expect(namesIn(await screen.findByRole("table", { name: "Workloads" })).sort()).toEqual(
      sorted(WORKLOADS),
    );

    // Exactly one of the two is ever marked current. A sidebar that highlighted
    // both at once would be saying the two questions are one.
    //
    // Re-queried rather than reading the element captured before the navigations.
    // React re-renders the sidebar on every navigation, and whether it happens to
    // reuse the node is an implementation detail -- reading a detached element
    // passes or fails depending on that, which is how this test was flaky in one
    // run out of three. The assertion is about what is on screen now, so it asks
    // what is on screen now.
    // Asked with `aria-current`, not a class name. The inactive class is
    // `hover:bg-sidebar-accent/60`, which *contains* the active class as a
    // substring, so a class-name grep answers "current" for every entry at once.
    // `aria-current="page"` is the fact rather than the colour.
    const currentIn = (name: string): boolean =>
      within(fleetNav()).getByRole("link", { name }).getAttribute("aria-current") === "page";

    expect(currentIn("Workloads")).toBe(true);
    expect(currentIn("Infrastructure")).toBe(false);
    expect(currentIn("Nodes")).toBe(false);
  });

  it("makes the two disjoint, and together the whole estate", async () => {
    /**
     * One console, navigated the way an operator navigates.
     *
     * Two separately-mounted consoles in one test would be testing the mounting,
     * and mounting a second `<html>` over the first is a thing React warns about
     * for good reason. This is the walk an operator actually takes -- the sidebar,
     * then the page's own switch -- and it leaves the page in a state the next
     * assertion can read.
     */
    await renderConsole("/fleet/nodes?size=60");
    await screen.findByRole("table", { name: "Nodes" });

    fireEvent.click(within(fleetNav()).getByRole("link", { name: "Infrastructure" }));
    expect(namesIn(await screen.findByRole("table", { name: "Infrastructure" })).sort()).toEqual(
      sorted(INFRASTRUCTURE),
    );

    fireEvent.click(within(viewSwitch()).getByRole("link", { name: "Workloads" }));
    expect(namesIn(await screen.findByRole("table", { name: "Workloads" })).sort()).toEqual(
      sorted(WORKLOADS),
    );

    // Disjoint, and each half of the partition: every row on one carries a
    // `purpose` the other cannot have. Together with the bare list below -- which
    // is every VM in the estate -- that makes the two a partition of the
    // contract's `purpose` rather than two overlapping favourites.
    expect(
      INFRASTRUCTURE.filter((name) => (WORKLOADS as readonly string[]).includes(name)),
    ).toEqual([]);
    for (const value of purposesIn(screen.getByRole("table", { name: "Workloads" }))) {
      expect(value).toBe("workload");
    }
  });

  it('carries the repeat in the URL, so "sovren\'s own machines" is one question with two answers', async () => {
    // A cold deep link, the way a colleague would paste it. `purpose` appears
    // twice and both answers are the question; a parser that kept the last would
    // show Dokploy hosts and call them the estate's own machines.
    const { router } = await renderConsole(
      "/fleet/vms?purpose=infrastructure&purpose=service&size=60",
    );
    expect(namesIn(await screen.findByRole("table", { name: "Infrastructure" })).sort()).toEqual(
      sorted(INFRASTRUCTURE),
    );
    expect(
      new URL(router.state.location.href, "http://console.test").searchParams.getAll("purpose"),
    ).toEqual(["infrastructure", "service"]);
  });

  it("shows every VM at a bare /fleet/vms, and says that is what it is showing", async () => {
    await renderConsole("/fleet/vms?size=60");

    // The heading is the plain noun, because no purpose filter is on and the
    // console is not going to invent one.
    expect(await screen.findByRole("heading", { name: "VMs" })).toBeDefined();
    const grid = await screen.findByRole("table", { name: "VMs" });
    expect(namesIn(grid).sort()).toEqual(sorted(ESTATE));

    // And the page says so, rather than looking like a filter rail that happens
    // to be unpressed: `All VMs` is the current view.
    const view = viewSwitch();
    expect(within(view).getByRole("link", { name: "All VMs" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(view).getByRole("link", { name: "Infrastructure" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(
      within(view).getByRole("link", { name: "Workloads" }).getAttribute("aria-current"),
    ).toBeNull();

    // No purpose is pressed in the rail either, because there is no purpose on.
    const rail = screen.getByRole("group", { name: "Filter VMs by purpose" });
    for (const button of within(rail).getAllByRole("button")) {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("moves between the two from the page, keeping the operator's own filters", async () => {
    await renderConsole("/fleet/vms?purpose=infrastructure&purpose=service&size=60");
    await screen.findByRole("table", { name: "Infrastructure" });

    // A refinement within the view, so the switch has something to carry. Both
    // views have a stopped VM, so the question survives the move rather than
    // running into an empty answer.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter VMs by run state" })).getByRole("button", {
        name: "stopped",
      }),
    );
    await waitFor(() => {
      expect(namesIn(screen.getByRole("table", { name: "Infrastructure" })).sort()).toEqual([
        "golden",
        "golden-tpl",
      ]);
    });

    // "Show me the other kind" is a different question from "narrow this one",
    // so it is a `nav` of three links rather than a fourth button in the purpose
    // rail -- and it is here, on the page, rather than only in the sidebar.
    fireEvent.click(within(viewSwitch()).getByRole("link", { name: "Workloads" }));

    expect(await screen.findByRole("heading", { name: "Workloads" })).toBeDefined();
    await waitFor(() => {
      expect(namesIn(screen.getByRole("table", { name: "Workloads" })).sort()).toEqual([
        "lab-build-02",
        "spare-bench-01",
      ]);
    });

    // The purpose the operator did not ask for is gone, and the rest of their
    // place is not: the run state they had is still narrowing the new view.
    const rail = screen.getByRole("group", { name: "Filter VMs by run state" });
    expect(within(rail).getByRole("button", { name: "stopped" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const purposes = screen.getByRole("group", { name: "Filter VMs by purpose" });
    expect(
      within(purposes).getByRole("button", { name: "workload" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(purposes).getByRole("button", { name: "service" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("goes back to the view it came from, because a view is a link", async () => {
    await renderConsole("/fleet/vms?purpose=workload&size=60");
    await screen.findByRole("table", { name: "Workloads" });

    fireEvent.click(within(viewSwitch()).getByRole("link", { name: "Infrastructure" }));
    expect(await screen.findByRole("heading", { name: "Infrastructure" })).toBeDefined();

    // No sidebar click, no filter rail, no retyping: the browser's own back
    // button returns to the other question, which is what makes it a view.
    window.history.back();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Workloads" })).toBeDefined();
    });
  });
});
