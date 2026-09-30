/**
 * The world builder seam: is the estate a description of a coherent estate?
 *
 * This is one of the four agreed seams, and it is the reason the world builder
 * exists. The symptom it prevents is specific and expensive: two parts of the
 * system disagreeing about what exists. That does not fail cleanly. It is a
 * screen rendering a `null` it was not expecting, or a test that passes for the
 * wrong reason, and both are hard to trace back to a fixture.
 *
 * Expected values here are literals and the estate's own declared constants --
 * never a value recomputed the way the code computes it. A test that recomputed
 * `driveCount` from the drives would agree with the builder by construction and
 * would catch nothing, which is why the estate writes the count by hand
 * precisely so this file can disagree with it.
 */

import { describe, expect, it } from "vitest";

import {
  checkAwkwardCases,
  checkEstate,
  checkScale,
  isConsistent,
} from "../src/estate/consistency";
import { ESTATES, estateFor } from "../src/estate/registry";
import {
  DISABLED_ACTION_REASONS,
  ID_PATTERN,
  NAME_PATTERN,
  idPattern,
} from "../src/estate/identifiers";
import type { Estate } from "../src/estate/types";

const everyEstate = Object.entries(ESTATES);

describe("the estate is internally consistent", () => {
  it.each(everyEstate)(
    "%s has no dangling reference, duplicate id, or malformed identifier",
    (_name, estate) => {
      // Every problem at once, so one run fixes a fixture that is wrong three ways.
      expect(checkEstate(estate)).toEqual([]);
    },
  );

  it.each(everyEstate)("%s is coherent by the summary predicate too", (_name, estate) => {
    expect(isConsistent(estate)).toBe(true);
  });

  it("carries every awkward case the screens exist to render", () => {
    // The full estate is the one every screen is built against, so it is the one
    // that has to hold each of these. A fixture with only the happy path leaves
    // every one of them discovered in production.
    const fleet = estateFor("fleet");

    expect(checkAwkwardCases(fleet)).toEqual([]);

    const nodeWithoutOverlay = fleet.nodes.find((row) => row.overlay === null);
    expect(nodeWithoutOverlay?.name).toBe("takoradi-nas-01");

    const transitional = fleet.vms.filter((row) => row.runState === "transitional");
    expect(transitional.map((row) => row.name)).toEqual(["grafana-canary"]);

    const failed = fleet.vms.filter((row) => row.runState === "failed");
    expect(failed.map((row) => row.name)).toEqual(["legacy-erp"]);
    expect(failed[0]?.failureReason).toContain("guest agent");

    const stale = fleet.peers.filter((row) => row.status === "stale");
    expect(stale.map((row) => row.name)).toEqual(["ops-laptop-sipho", "phone-sipho"]);

    const blocked = fleet.peers.filter((row) => row.isBlocked === true);
    expect(blocked.map((row) => row.name)).toEqual(["phone-sipho"]);
  });

  it("reports heterogeneity rather than normalising it", () => {
    const fleet = estateFor("fleet");
    const models = new Set(fleet.nodes.map((row) => row.cpuModel));
    const coreCounts = new Set(fleet.nodes.map((row) => row.cores));

    // Retired university desktops, not a datacentre. A fleet that reported one
    // CPU model would be a fiction, and every screen built on it would be too.
    expect(models.size).toBeGreaterThan(10);
    expect(coreCounts.size).toBeGreaterThan(3);
    expect(fleet.cpuFloor).toBe("kvm64");
  });

  it("has a Node that cannot migrate because its CPU is below the floor", () => {
    const fleet = estateFor("fleet");
    const cannotMigrate = fleet.nodes.filter((row) => !row.canMigrate);

    expect(cannotMigrate.map((row) => row.name)).toContain("accra-desk-01");
    expect(cannotMigrate.map((row) => row.name)).toContain("takoradi-nas-01");
    // And a disabled action that says so, in a fixed code rather than a sentence.
    const refused = fleet.disabledActions["node:accra-desk-01"] ?? [];
    expect(refused[0]?.action).toBe("migrate");
    expect(refused[0]?.reason).toBe("action_not_permitted");
  });
});

describe("identifier shape is enforced, not assumed", () => {
  it("every id in both estates is a sovren identifier with the right prefix", () => {
    const node = idPattern("node");
    const vm = idPattern("vm");
    const peer = idPattern("peer");
    const task = idPattern("task");
    const drive = idPattern("drive");
    const disk = idPattern("disk");
    const snapshot = idPattern("snapshot");
    const connection = idPattern("connection");

    for (const [, estate] of everyEstate) {
      for (const row of estate.nodes) expect(row.id).toMatch(node);
      for (const row of estate.vms) expect(row.id).toMatch(vm);
      for (const row of estate.peers) expect(row.id).toMatch(peer);
      for (const row of estate.tasks) expect(row.id).toMatch(task);
      for (const row of estate.drives) expect(row.id).toMatch(drive);
      for (const row of estate.disks) expect(row.id).toMatch(disk);
      for (const row of estate.snapshots) expect(row.id).toMatch(snapshot);
      for (const row of estate.connections) expect(row.id).toMatch(connection);
    }
  });

  it("rejects an id that is one character short", () => {
    // The check is worth something only if it fails on the near-misses. This is
    // what ticket 15's safety suite leans on, so a near-miss is the case to pin.
    expect("nd_01hq2n0001").toMatch(ID_PATTERN);
    expect("nd_01hq2n001").not.toMatch(ID_PATTERN);
    expect("nd_01hq2n00012").not.toMatch(ID_PATTERN);
  });

  it("rejects an id carrying the wrong resource prefix", () => {
    // A VM whose id opens `nd_` says its author believed a VM was a Node. Both
    // are strings, so nothing but this check will ever say otherwise.
    expect("nd_01hq2v0013").toMatch(idPattern("node"));
    expect("nd_01hq2v0013").not.toMatch(idPattern("vm"));
  });

  it("rejects a name that could not be a hostname", () => {
    expect("accra-desk-01").toMatch(NAME_PATTERN);
    expect("-leading").not.toMatch(NAME_PATTERN);
    expect("Service Hosts").not.toMatch(NAME_PATTERN);
  });

  it("keeps every id unique across every resource, not only within one", () => {
    const fleet = estateFor("fleet");
    const ids = [
      ...fleet.nodes.map((row) => row.id),
      ...fleet.vms.map((row) => row.id),
      ...fleet.peers.map((row) => row.id),
      ...fleet.tasks.map((row) => row.id),
      ...fleet.drives.map((row) => row.id),
      ...fleet.disks.map((row) => row.id),
      ...fleet.snapshots.map((row) => row.id),
      ...fleet.connections.map((row) => row.id),
      ...fleet.groups.map((row) => row.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the checker actually fails on a broken estate", () => {
  // A checker that only ever passes is not a checker. Each of these breaks one
  // thing the way a real fixture edit would, and each must be reported.
  const fleet = estateFor("fleet");
  const withNodes = (mutate: (nodes: Estate["nodes"]) => Estate["nodes"]): Estate => ({
    ...fleet,
    nodes: mutate(fleet.nodes),
  });

  it("reports a duplicate id", () => {
    const broken = withNodes((nodes) => [nodes[0]!, { ...nodes[1]!, id: nodes[0]!.id }]);
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("duplicate-id");
  });

  it("reports a malformed identifier", () => {
    const broken = withNodes((nodes) => [{ ...nodes[0]!, id: "nd_short" }, ...nodes.slice(1)]);
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("id-shape");
  });

  it("reports a VM whose Node does not list it back", () => {
    // The failure the type system cannot see: both sides are individually valid
    // and the screens disagree. A VM detail page and a Node detail page would
    // each be right about their own half. The count is corrected here so that the
    // back-reference is the only thing wrong, which is what makes the assertion
    // about the back-reference rather than about whichever check fired first.
    const dropped = fleet.vms.find((row) => row.nodeName === "accra-server-02")?.name;
    const broken: Estate = {
      ...fleet,
      nodes: fleet.nodes.map((row) =>
        row.name === "accra-server-02"
          ? { ...row, vms: row.vms.filter((name) => name !== dropped), vmCount: row.vmCount - 1 }
          : row,
      ),
    };
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toEqual(["back-reference"]);
  });

  it("reports a driveCount that disagrees with the Drives behind it", () => {
    const broken = withNodes((nodes) => [{ ...nodes[0]!, driveCount: 9 }, ...nodes.slice(1)]);
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("drive-count");
  });

  it("reports a transitional VM with no Task behind it", () => {
    // The console claiming progress it has not observed.
    const broken: Estate = {
      ...fleet,
      vms: fleet.vms.map((row) =>
        row.name === "grafana-canary"
          ? { ...row, transitionalTask: null, transitionalTaskName: null }
          : row,
      ),
    };
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("transitional-without-task");
  });

  it("reports a failed VM with no reason", () => {
    const broken: Estate = {
      ...fleet,
      vms: fleet.vms.map((row) =>
        row.name === "legacy-erp" ? { ...row, failureReason: null } : row,
      ),
    };
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("failed-without-reason");
  });

  it("reports an empty string where a null overlay address belongs", () => {
    // The specific thing being prevented: a screen that renders "" as an address
    // the operator could try, and which does not resolve.
    const broken = withNodes((nodes) => [
      { ...nodes[0]!, overlay: { address: "", hostname: nodes[0]!.name } },
      ...nodes.slice(1),
    ]);
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("overlay-placeholder");
  });

  it("reports two machines sharing one overlay address", () => {
    const broken = withNodes((nodes) => [
      { ...nodes[0]!, overlay: nodes[1]?.overlay ?? nodes[0]!.overlay },
      ...nodes.slice(1),
    ]);
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("duplicate-address");
  });

  it("reports a disabled action whose reason is not a sovren code", () => {
    // R43: the reason is a code, so the console can render it. A sentence is a
    // reason the console could only print.
    const broken: Estate = {
      ...fleet,
      disabledActions: {
        "node:accra-desk-01": [
          { action: "migrate", reason: "because the CPU is old" as never, explanation: "old CPU" },
        ],
      },
    };
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("disabled-reason");
  });

  it("reports a Task that reached a terminal state with nothing logged", () => {
    const broken: Estate = {
      ...fleet,
      tasks: fleet.tasks.map((row) =>
        row.name === "terraform-accra" ? { ...row, logs: [] } : row,
      ),
    };
    const problems = checkEstate(broken);
    expect(problems.map((entry) => entry.rule)).toContain("log-count");
  });
});

describe("scale and selection", () => {
  it("the default estate has more rows than fit on one page", () => {
    // Ticket 03: the estate must exercise pagination honestly, so that the
    // pagination path is exercised by looking at the console rather than only by
    // a test that asks for three rows.
    const fleet = estateFor("fleet");
    expect(checkScale(fleet)).toEqual([]);
    expect(fleet.nodes.length + fleet.vms.length + fleet.peers.length).toBeGreaterThan(25);
  });

  it("the compact estate is small, and that is its purpose", () => {
    // The narrow-screen fixture. Holding it to a page count would be holding it
    // to the opposite of what it is for.
    const compact = estateFor("compact");
    expect(compact.nodes.length).toBe(2);
    expect(compact.vms.length).toBe(3);
    expect(checkAwkwardCases(compact)).toEqual([]);
  });

  it("selects an estate by name and falls back for anything else", () => {
    expect(estateFor("compact").name).toBe("compact");
    expect(estateFor("fleet").name).toBe("fleet");
    // A typo in a URL bar is forgiven with the default rather than a stack trace;
    // a typo in the code is caught by the checks above.
    expect(estateFor("nonsense").name).toBe("fleet");
    expect(estateFor(null).name).toBe("fleet");
  });

  it("gives every disabled action a reason from the fixed vocabulary", () => {
    for (const [, estate] of everyEstate) {
      for (const actions of Object.values(estate.disabledActions)) {
        for (const action of actions) {
          expect(DISABLED_ACTION_REASONS).toContain(action.reason);
        }
      }
    }
  });
});
