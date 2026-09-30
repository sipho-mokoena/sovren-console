/**
 * The consistency check: is the estate a description of a coherent estate?
 *
 * This is seam three of four, and the reason it exists is specific. The world
 * builder was written so two parts of the system cannot disagree about what
 * exists -- the console and a test, or a list page and a detail page. When they
 * *do* disagree, the symptom is not a clean failure: it is a screen rendering a
 * null it was not expecting, or a test that passes for the wrong reason. Both
 * are expensive to trace back to a fixture, and both are cheap to prevent here.
 *
 * **What the type system already caught, and is therefore not checked again.**
 * `EstateVm.nodeName` is a `NodeName`, a union of the literal Node names in the
 * estate, so a VM pointing at a Node that does not exist does not compile. The
 * reference *shape* is safe. What is left is everything types cannot see:
 *
 *  - **Identifier shape.** `nd_01hq2n0000001` is a well-formed Node id;
 *    `nd_1hq2n0000001` is not, and neither the compiler nor a screen would ever
 *    say so. Ticket 15's safety suite leans on this, which is why the pattern
 *    lives in one place and is exported.
 *  - **Prefix/kind agreement.** A VM whose id opens `nd_` says its author
 *    believed a VM was a Node. Both are strings, so only this catches it.
 *  - **Uniqueness, across collections.** A duplicate id makes `NameOrId`
 *    resolution ambiguous, and the loser is whichever row the lookup found
 *    second. A Task id that collides with a VM id is invisible locally: each
 *    collection is internally unique and the lookup is global.
 *  - **The reference and the back-reference agree.** A VM resolves to a Node
 *    whose `vms` list does not contain it. Both sides compile; the screens
 *    disagree.
 *  - **Derived counts against the rows behind them.** A Node claiming three VMs
 *    when the estate has two is a screen showing a number the list does not
 *    support. The count is written by hand precisely so it can be wrong.
 *  - **State that implies something.** A VM in `transitional` with no Task, a
 *    Task that failed with no reason, a `failed` VM whose reason is null.
 *
 * It returns every problem it finds rather than the first, because a fixture
 * that is wrong in three ways should be fixed in one pass.
 */

import {
  DISABLED_ACTION_REASONS,
  ID_PATTERN,
  NAME_PATTERN,
  isValidId,
  type ResourceKind,
} from "./identifiers";
import type { TaskTargetResource } from "@sovren/client";

import type { Estate, EstateNode, EstatePeer, EstateTask, EstateVm } from "./types";

/** One thing wrong with the estate, named precisely enough to fix. */
export interface ConsistencyProblem {
  /** Which check found it. Stable, so a test can assert on the kind. */
  rule: string;
  /** Which resource, in the form an operator would recognise. */
  subject: string;
  detail: string;
}

const problem = (rule: string, subject: string, detail: string): ConsistencyProblem => ({
  rule,
  subject,
  detail,
});

/**
 * Every problem in the estate, or an empty array when it is coherent.
 *
 * Pure and total: it never throws and never stops at the first problem, so it
 * can be called in a test, in the dev server's startup, and in a test helper
 * without behaving differently in each.
 */
export const checkEstate = (estate: Estate): ConsistencyProblem[] => [
  ...checkIdentifiers(estate),
  ...checkUniqueness(estate),
  ...checkReferences(estate),
  ...checkDerivedCounts(estate),
  ...checkStateImplications(estate),
  ...checkOverlay(estate),
  ...checkDisabledActions(estate),
];

/** Whether the estate is coherent. What a test asserts, and what the dev server logs. */
export const isConsistent = (estate: Estate): boolean => checkEstate(estate).length === 0;

/** One row, reduced to what the identifier and uniqueness checks need. */
interface Row {
  kind: ResourceKind;
  id: string;
  name: string;
}

const allRows = (estate: Estate): readonly Row[] => [
  ...Object.values(estate.sites).map((site): Row => ({
    kind: "site",
    id: site.id,
    name: site.name,
  })),
  ...estate.groups.map((group): Row => ({ kind: "group", id: group.id, name: group.name })),
  ...estate.nodes.map((row): Row => ({ kind: "node", id: row.id, name: row.name })),
  ...estate.drives.map((row): Row => ({ kind: "drive", id: row.id, name: row.name })),
  ...estate.peers.map((row): Row => ({ kind: "peer", id: row.id, name: row.name })),
  ...estate.vms.map((row): Row => ({ kind: "vm", id: row.id, name: row.name })),
  ...estate.disks.map((row): Row => ({ kind: "disk", id: row.id, name: row.name })),
  ...estate.snapshots.map((row): Row => ({ kind: "snapshot", id: row.id, name: row.name })),
  ...estate.tasks.map((row): Row => ({ kind: "task", id: row.id, name: row.name })),
  ...estate.connections.map((row): Row => ({ kind: "connection", id: row.id, name: row.name })),
];

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every id is well-formed and carries the prefix its resource requires.
 *
 * The pattern is exported from `identifiers.ts` and applied here, so ticket 15's
 * safety suite can enforce the same rule on a fixture it finds anywhere else in
 * the repository rather than re-deriving the pattern and eventually disagreeing
 * with it.
 */
export const checkIdentifiers = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];

  for (const row of allRows(estate)) {
    if (!ID_PATTERN.test(row.id)) {
      problems.push(
        problem(
          "id-shape",
          row.name,
          `id ${row.id} is not a sovren identifier: expected ${PREFIXES[row.kind]}_ followed by ten Crockford base32 characters`,
        ),
      );
      continue;
    }
    if (!isValidId(row.id, row.kind)) {
      problems.push(
        problem(
          "id-prefix",
          row.name,
          `id ${row.id} is not a ${row.kind} id: a ${row.kind} id opens ${PREFIXES[row.kind]}_`,
        ),
      );
    }
    // A name is a hostname only where the overlay resolves it. A NetBird Group
    // ("Service Hosts") and a Connection ("dokploy-accra") are human labels and
    // are never resolved, so requiring a DNS label of them would be a rule about
    // a problem nobody has.
    if (RESOLVABLE[row.kind] && !NAME_PATTERN.test(row.name)) {
      problems.push(
        problem(
          "name-shape",
          row.name,
          `name ${row.name} is not a DNS label, and this resource is resolved by name on the overlay`,
        ),
      );
    }
  }

  return problems;
};

/** Resources whose name NetBird resolves, and which must therefore be DNS labels. */
const RESOLVABLE: Readonly<Record<ResourceKind, boolean>> = {
  site: false,
  node: true,
  drive: true,
  peer: true,
  group: false,
  vm: true,
  disk: true,
  snapshot: true,
  task: true,
  connection: false,
};

const PREFIXES: Readonly<Record<ResourceKind, string>> = {
  site: "st",
  node: "nd",
  drive: "dr",
  peer: "pr",
  group: "gp",
  vm: "vm",
  disk: "ds",
  snapshot: "sn",
  task: "tk",
  connection: "cn",
};

/* -------------------------------------------------------------------------- */
/* Uniqueness                                                                 */
/* -------------------------------------------------------------------------- */

/**
/**
 * No id is used twice, anywhere; no name is used twice within a kind.
 *
 * The asymmetry is the model's, not a convenience. Ids are globally unique
 * because they are opaque system keys that travel across resource types -- a
 * Task id that collided with a VM id would break a lookup that nothing local
 * would notice, since each collection is internally unique and the resolution
 * is not.
 *
 * Names are unique *within* a kind because a path parameter is resolved against
 * one resource: `/nodes/accra-desk-01` and `/peers/accra-desk-01` are different
 * resources and both must resolve. And a name must in fact repeat across kinds:
 * a Node and the Peer its machine enrolled as are the same box, deliberately
 * sharing a name, because the overlay hostname and the Proxmox node name being
 * the same string is what lets an operator type one and mean both. A rule that
 * forbade it would be forbidding the estate from being true.
 */
export const checkUniqueness = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];
  const seenIds = new Map<string, string>();
  const seenNames = new Map<string, string>();

  for (const row of allRows(estate)) {
    const idOwner = seenIds.get(row.id);
    if (idOwner === undefined) seenIds.set(row.id, `${row.kind} ${row.name}`);
    else
      problems.push(
        problem(
          "duplicate-id",
          row.name,
          `id ${row.id} is already used by ${idOwner}, so a lookup by id would be ambiguous`,
        ),
      );

    const nameKey = `${row.kind}\u0000${row.name}`;
    const nameOwner = seenNames.get(nameKey);
    if (nameOwner === undefined) seenNames.set(nameKey, row.id);
    else
      problems.push(
        problem(
          "duplicate-name",
          row.name,
          `the name ${row.name} is already used by another ${row.kind} (${nameOwner})`,
        ),
      );
  }

  return problems;
};

/* -------------------------------------------------------------------------- */
/* References                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every cross-reference resolves, and the two directions of each agree.
 *
 * The estate is written in names and the API speaks ids, so a name that is not
 * in the estate would already have thrown in the builder. What is left is the
 * part neither the compiler nor the builder can see: a VM that resolves to a
 * Node whose `vms` list does not mention it. Both sides are individually valid
 * and the screens disagree.
 */
export const checkReferences = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];
  const require_ = (ok: boolean, rule: string, subject: string, detail: string): void => {
    if (!ok) problems.push(problem(rule, subject, detail));
  };

  const siteNames = new Set(Object.keys(estate.sites));
  const nodeByName = new Map<string, EstateNode>(
    estate.nodes.map((row) => [row.name, row] as const),
  );
  const nodeById = new Map(estate.nodes.map((row) => [row.id, row]));
  const driveByName = new Map(estate.drives.map((row) => [row.name, row]));
  const vmByName = new Map(estate.vms.map((row) => [row.name, row]));
  const vmNames = new Set(vmByName.keys());
  const diskNames = new Set(estate.disks.map((row) => row.name));
  const snapshotByName = new Map(estate.snapshots.map((row) => [row.name, row]));
  const taskById = new Map(estate.tasks.map((row) => [row.id, row]));
  const groupNames = new Set(estate.groups.map((row) => row.name));

  for (const row of estate.nodes) {
    require_(
      siteNames.has(row.siteName),
      "dangling-site",
      row.name,
      `names the Site ${row.siteName}, which is not in the estate`,
    );
    require_(
      row.site.name === row.siteName,
      "site-mismatch",
      row.name,
      `resolves to the Site ${row.site.name} but names ${row.siteName}`,
    );

    for (const driveName of row.drives) {
      const drive = driveByName.get(driveName);
      require_(
        drive !== undefined,
        "dangling-drive",
        row.name,
        `names the Drive ${driveName}, which is not in the estate`,
      );
      require_(
        drive?.nodeName === row.name,
        "back-reference",
        driveName,
        `is listed on the Node ${row.name} but belongs to the Node ${drive?.nodeName}`,
      );
    }
    for (const vmName of row.vms) {
      const vm = vmByName.get(vmName);
      require_(
        vm !== undefined,
        "dangling-vm",
        row.name,
        `names the VM ${vmName}, which is not in the estate`,
      );
      require_(
        vm?.nodeName === row.name,
        "back-reference",
        vmName,
        `is listed on the Node ${row.name} but runs on the Node ${vm?.nodeName}`,
      );
      require_(
        vm?.node.id === row.id,
        "back-reference",
        vmName,
        `is listed on the Node ${row.id} but its link points at ${vm?.node.id}`,
      );
    }
    for (const peerName of row.peers) {
      const peer = estate.peers.find((entry) => entry.name === peerName);
      require_(
        peer !== undefined,
        "dangling-peer",
        row.name,
        `names the Peer ${peerName}, which is not in the estate`,
      );
      require_(
        peer?.node?.name === row.name,
        "back-reference",
        peerName,
        `is listed on the Node ${row.name} but is enrolled on ${peer?.node?.name ?? "no Node"}`,
      );
    }
  }

  for (const row of estate.drives) {
    require_(
      nodeByName.has(row.nodeName),
      "dangling-node",
      row.name,
      `belongs to the Node ${row.nodeName}, which is not in the estate`,
    );
    require_(
      nodeById.get(row.nodeId)?.name === row.nodeName,
      "node-link",
      row.name,
      `carries nodeId ${row.nodeId}, which belongs to ${nodeById.get(row.nodeId)?.name ?? "nothing"}`,
    );
  }

  for (const row of estate.peers) {
    checkPeer(problems, row, nodeByName, siteNames, groupNames);
  }

  for (const row of estate.vms) {
    checkVm(problems, row, nodeByName, taskById, siteNames, diskNames, snapshotByName);
    // The other direction of the same back-reference. Walking only Node -> VM
    // would miss a VM the Node forgot, which is the direction a fixture edit
    // actually makes: someone deletes a name from a Node's list.
    const host = nodeByName.get(row.node.name);
    if (host !== undefined && !host.vms.includes(row.name)) {
      problems.push(
        problem(
          "back-reference",
          row.name,
          `runs on the Node ${host.name}, which does not list it among its VMs`,
        ),
      );
    }
  }

  for (const row of estate.disks) {
    require_(
      vmNames.has(row.vmName),
      "dangling-vm",
      row.name,
      `belongs to the VM ${row.vmName}, which is not in the estate`,
    );
    require_(
      vmByName.get(row.vmName)?.id === row.vmId,
      "vm-link",
      row.name,
      `carries vmId ${row.vmId}, which belongs to ${vmByName.get(row.vmName)?.name ?? "nothing"}`,
    );
  }

  for (const row of estate.snapshots) {
    require_(
      vmNames.has(row.vmName),
      "dangling-vm",
      row.name,
      `belongs to the VM ${row.vmName}, which is not in the estate`,
    );
    require_(
      vmByName.get(row.vmName)?.id === row.vmId,
      "vm-link",
      row.name,
      `carries vmId ${row.vmId}, which belongs to ${vmByName.get(row.vmName)?.name ?? "nothing"}`,
    );
    if (row.parentName === null) continue;
    const parent = snapshotByName.get(row.parentName);
    require_(
      parent !== undefined,
      "dangling-snapshot",
      row.name,
      `names the parent Snapshot ${row.parentName}, which is not in the estate`,
    );
    require_(
      parent?.id === row.parentSnapshotId,
      "snapshot-parent",
      row.name,
      `names the parent ${row.parentName} but its parentSnapshotId is ${row.parentSnapshotId}`,
    );
    require_(
      parent?.vmName === row.vmName,
      "snapshot-parent",
      row.name,
      `names a parent belonging to the VM ${parent?.vmName}`,
    );
  }

  for (const row of estate.tasks) {
    checkTask(problems, row, {
      node: nodeByName,
      vm: vmByName,
      connection: new Map(estate.connections.map((entry) => [entry.name, entry])),
      site: new Map(Object.values(estate.sites).map((entry) => [entry.name, entry])),
      // The document declares `peer` as a Task target resource. Nothing in the
      // estate targets one, and an empty map is the honest way to say so: a Task
      // that starts targeting one fails here rather than passing unnoticed.
      peer: new Map(estate.peers.map((entry) => [entry.name, entry])),
    });
  }

  return problems;
};

const checkPeer = (
  problems: ConsistencyProblem[],
  row: EstatePeer,
  nodeByName: ReadonlyMap<string, EstateNode>,
  siteNames: ReadonlySet<string>,
  groupNames: ReadonlySet<string>,
): void => {
  if (row.node !== null) {
    const host = nodeByName.get(row.node.name);
    if (host === undefined) {
      problems.push(
        problem(
          "dangling-node",
          row.name,
          `is enrolled on the Node ${row.node.name}, which is not in the estate`,
        ),
      );
    } else if (host.name !== row.node.name) {
      problems.push(
        problem(
          "node-link",
          row.name,
          `names the Node ${row.node.name}, which the estate does not have`,
        ),
      );
    }
  }
  if (row.site !== null && !siteNames.has(row.site.name)) {
    problems.push(
      problem(
        "dangling-site",
        row.name,
        `names the Site ${row.site.name}, which is not in the estate`,
      ),
    );
  }
  for (const group of row.groups) {
    if (!groupNames.has(group.name)) {
      problems.push(
        problem(
          "dangling-group",
          row.name,
          `carries the Group ${group.name}, which the estate does not declare`,
        ),
      );
    }
  }
};

const checkVm = (
  problems: ConsistencyProblem[],
  row: EstateVm,
  nodeByName: ReadonlyMap<string, EstateNode>,
  taskById: ReadonlyMap<string, unknown>,
  siteNames: ReadonlySet<string>,
  diskNames: ReadonlySet<string>,
  snapshotByName: ReadonlyMap<string, { id: string }>,
): void => {
  const host = nodeByName.get(row.node.name);
  if (host === undefined) {
    problems.push(
      problem(
        "dangling-node",
        row.name,
        `runs on the Node ${row.node.name}, which is not in the estate`,
      ),
    );
  } else {
    if (host.id !== row.node.id) {
      problems.push(
        problem(
          "node-link",
          row.name,
          `names the Node ${row.node.name} but its link carries the id ${row.node.id}`,
        ),
      );
    }
    if (host.siteName !== row.site.name) {
      problems.push(
        problem(
          "site-mismatch",
          row.name,
          `is in the Site ${row.site.name} but runs on the Node ${host.name}, which is in ${host.siteName}`,
        ),
      );
    }
  }
  if (!siteNames.has(row.site.name)) {
    problems.push(
      problem(
        "dangling-site",
        row.name,
        `names the Site ${row.site.name}, which is not in the estate`,
      ),
    );
  }
  if (row.transitionalTaskName === null) {
    if (row.transitionalTask !== null) {
      problems.push(
        problem("transitional-mismatch", row.name, "carries a Task link but names no Task"),
      );
    }
  } else if (!taskById.has(row.transitionalTask?.id ?? "")) {
    problems.push(
      problem(
        "dangling-task",
        row.name,
        `names the Task ${row.transitionalTaskName}, whose id ${row.transitionalTask?.id} is not in the estate`,
      ),
    );
  }
  for (const diskName of row.disks) {
    if (!diskNames.has(diskName)) {
      problems.push(
        problem(
          "dangling-disk",
          row.name,
          `names the Disk ${diskName}, which is not in the estate`,
        ),
      );
    }
  }
  for (const snapshotName of row.snapshots) {
    if (!snapshotByName.has(snapshotName)) {
      problems.push(
        problem(
          "dangling-snapshot",
          row.name,
          `names the Snapshot ${snapshotName}, which is not in the estate`,
        ),
      );
    }
  }
};

/**
 * A Task's target resolves, and resolves to the id the estate gave it.
 *
 * The id is the half that can go wrong quietly: a Task whose `target.name` is
 * right and whose `target.id` is another resource's renders a Tasks table that
 * links to the wrong machine, and nothing throws.
 */
const checkTask = (
  problems: ConsistencyProblem[],
  row: EstateTask,
  universe: Readonly<Record<TaskTargetResource, ReadonlyMap<string, { id: string; name: string }>>>,
): void => {
  const byName = universe[row.targetResource];
  const found = byName === undefined ? undefined : byName.get(row.targetName);
  if (found === undefined) {
    problems.push(
      problem(
        "dangling-target",
        row.name,
        `targets the ${row.targetResource} ${row.targetName}, which is not in the estate`,
      ),
    );
    return;
  }
  if (found.name !== row.target.name) {
    problems.push(
      problem(
        "target-mismatch",
        row.name,
        `names the target ${row.targetName} but its link points at ${row.target.name}`,
      ),
    );
  }
  if (found.id !== row.target.id) {
    problems.push(
      problem(
        "target-mismatch",
        row.name,
        `names the target ${row.targetName}, whose id is ${found.id}, but carries ${row.target.id}`,
      ),
    );
  }
};

/* -------------------------------------------------------------------------- */
/* Derived counts                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A count the estate states must match the rows behind it.
 *
 * `driveCount` and `vmCount` are written by hand rather than derived, on
 * purpose: a derived count cannot be wrong, and a count that cannot be wrong is
 * a count no test is asserting.
 */
export const checkDerivedCounts = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];

  for (const row of estate.nodes) {
    if (row.driveCount !== row.drives.length) {
      problems.push(
        problem(
          "drive-count",
          row.name,
          `reports driveCount ${row.driveCount} but the estate gives it ${row.drives.length} Drives`,
        ),
      );
    }
    if (row.vmCount !== row.vms.length) {
      problems.push(
        problem(
          "vm-count",
          row.name,
          `reports vmCount ${row.vmCount} but the estate gives it ${row.vms.length} VMs`,
        ),
      );
    }
  }

  for (const row of estate.tasks) {
    if (row.logCount !== row.logs.length) {
      problems.push(
        problem(
          "log-count",
          row.name,
          `reports logCount ${row.logCount} but carries ${row.logs.length} log events`,
        ),
      );
    }
  }

  return problems;
};

/* -------------------------------------------------------------------------- */
/* State that implies something                                               */
/* -------------------------------------------------------------------------- */

/**
 * A state that implies something must have that something.
 *
 * These are the assertions that keep the console from asserting a state the
 * estate does not support. A VM in `transitional` with no Task behind it is the
 * console claiming progress it has not observed; a `failed` VM with no reason is
 * an operator being told something is wrong without being told what.
 */
export const checkStateImplications = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];
  const taskById = new Map(estate.tasks.map((row) => [row.id, row]));
  const taskByName = new Map(estate.tasks.map((row) => [row.name, row]));

  for (const row of estate.vms) {
    if (row.runState === "transitional" && row.transitionalTaskName === null) {
      problems.push(
        problem(
          "transitional-without-task",
          row.name,
          "is transitional with no Task behind it, so there is nothing to watch",
        ),
      );
    }
    if (row.transitionalTaskName !== null) {
      const task = taskByName.get(row.transitionalTaskName);
      if (row.runState !== "transitional") {
        problems.push(
          problem(
            "transitional-mismatch",
            row.name,
            `is ${row.runState} while naming the Task ${row.transitionalTaskName}, so the state and the Task disagree`,
          ),
        );
      }
      if (task !== undefined && task.state !== "running" && task.state !== "queued") {
        problems.push(
          problem(
            "transitional-mismatch",
            row.name,
            `is transitional while its Task ${row.transitionalTaskName} is ${task.state}, so the work behind it has already finished`,
          ),
        );
      }
      if (
        row.transitionalTask !== null &&
        task !== undefined &&
        row.transitionalTask.state !== task.state
      ) {
        problems.push(
          problem(
            "transitional-mismatch",
            row.name,
            `reports its Task as ${row.transitionalTask.state} while the Task is ${task.state}`,
          ),
        );
      }
    }

    if (row.runState === "failed" && row.failureReason === null) {
      problems.push(
        problem(
          "failed-without-reason",
          row.name,
          "is failed with no failureReason, so the operator is told nothing about what broke",
        ),
      );
    }
    if (row.runState !== "failed" && row.failureReason !== null) {
      problems.push(
        problem(
          "reason-without-failure",
          row.name,
          `carries a failureReason while ${row.runState}, so the reason contradicts the state`,
        ),
      );
    }
    if (row.runState === "running" && row.overlay === null) {
      problems.push(
        problem(
          "running-without-overlay",
          row.name,
          "is running with no overlay address, so it cannot be reached by name",
        ),
      );
    }
    if (row.runState === "transitional" && row.overlay !== null) {
      problems.push(
        problem(
          "transitional-with-overlay",
          row.name,
          "is transitional but already has an overlay address, so it is further along than the state says",
        ),
      );
    }
    if (row.uptimeSeconds !== null && row.runState !== "running") {
      problems.push(
        problem(
          "uptime-while-stopped",
          row.name,
          `is ${row.runState} but reports ${row.uptimeSeconds}s of uptime`,
        ),
      );
    }
  }

  for (const row of estate.tasks) {
    if (row.state === "failed" && row.failureReason === null) {
      problems.push(
        problem("task-failed-without-reason", row.name, "reached failed with no failureReason"),
      );
    }
    if (row.state === "succeeded" && row.failureReason !== null) {
      problems.push(
        problem(
          "task-succeeded-with-reason",
          row.name,
          "reached succeeded but carries a failureReason",
        ),
      );
    }
    if (row.state === "cancelled") {
      if (row.cancelledReason === null) {
        problems.push(
          problem(
            "task-cancelled-without-reason",
            row.name,
            "reached cancelled with no cancelledReason",
          ),
        );
      }
      if (row.failureReason !== null) {
        problems.push(
          problem(
            "task-cancelled-with-reason",
            row.name,
            "was cancelled but also carries a failureReason, so it reads as both",
          ),
        );
      }
    }
    const live = row.state === "queued" || row.state === "running";
    if (live && row.terminalState !== null) {
      problems.push(
        problem(
          "terminal-state",
          row.name,
          `is ${row.state} but reports the terminal state ${row.terminalState}`,
        ),
      );
    }
    if (!live && row.terminalState === null) {
      problems.push(
        problem(
          "terminal-state",
          row.name,
          `is ${row.state} with no terminalState, so it is neither live nor finished`,
        ),
      );
    }
    if (!live && row.terminalState !== null && row.terminalState !== row.state) {
      problems.push(
        problem(
          "terminal-state",
          row.name,
          `is ${row.state} but reports the terminal state ${row.terminalState}`,
        ),
      );
    }
    if (row.state === "queued" && row.startedAt !== null) {
      problems.push(problem("queued-started", row.name, "is queued but reports a startedAt"));
    }
    if (row.state === "running" && row.startedAt === null) {
      problems.push(problem("running-unstarted", row.name, "is running with no startedAt"));
    }
    if (row.finishedAt !== null && row.terminalState === null) {
      problems.push(
        problem("finished-while-live", row.name, "reports a finishedAt with no terminal state"),
      );
    }
    if (row.lastSeq !== null && !taskById.has(row.id)) {
      problems.push(
        problem("task-seq", row.name, "reports a lastSeq but is not a Task in the estate"),
      );
    }
    const seqs = row.logs.map((line) => line.seq);
    if (new Set(seqs).size !== seqs.length) {
      problems.push(
        problem(
          "log-seq",
          row.name,
          "has two log events with the same seq, so a resume would replay one twice",
        ),
      );
    }
    if (row.state === "queued" && row.logs.length > 0) {
      problems.push(
        problem(
          "queued-with-logs",
          row.name,
          "is queued but has already emitted log lines, so it has been claimed",
        ),
      );
    }
  }

  return problems;
};

/* -------------------------------------------------------------------------- */
/* Overlay                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An overlay address is either absent or well-formed, and never shared.
 *
 * Absent means `null`. The specific thing being prevented is `""` and
 * `"0.0.0.0"`, both of which a screen would render as an address the operator
 * could try, and neither of which resolves.
 */
export const checkOverlay = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];
  const CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;
  // Keyed by name, not by row. A Node and the Peer its machine enrolled as are
  // the same box seen from two sides, so they hold the same address on purpose;
  // that is the enrolment, not a collision. What must not happen is two
  // *different* machines sharing an address, or one machine holding two.
  const byName = new Map<string, { address: string; kind: string }>();
  const byAddress = new Map<string, string>();

  const check = (
    kind: string,
    name: string,
    address: { address: string; hostname: string } | null,
  ): void => {
    if (address === null) return;
    if (address.address === "" || address.address === "0.0.0.0") {
      problems.push(
        problem(
          "overlay-placeholder",
          name,
          `has the placeholder address ${address.address === "" ? '""' : address.address}, which does not resolve; use null`,
        ),
      );
      return;
    }
    if (!CGNAT.test(address.address)) {
      problems.push(
        problem(
          "overlay-range",
          name,
          `has the address ${address.address}, which is outside NetBird's 100.64.0.0/10`,
        ),
      );
    }
    if (!NAME_PATTERN.test(address.hostname)) {
      problems.push(
        problem(
          "overlay-hostname",
          name,
          `has the hostname ${address.hostname}, which is not a DNS label`,
        ),
      );
    }
    if (address.hostname !== name) {
      problems.push(
        problem(
          "overlay-hostname",
          name,
          `resolves by the hostname ${address.hostname}, which is not its own name`,
        ),
      );
    }

    const mine = byName.get(name);
    if (mine !== undefined && mine.address !== address.address) {
      problems.push(
        problem(
          "overlay-drift",
          name,
          `is a ${kind} holding ${address.address} while the same name holds ${mine.address} as a ${mine.kind}`,
        ),
      );
    } else {
      byName.set(name, { address: address.address, kind });
    }

    const holder = byAddress.get(address.address);
    if (holder !== undefined && holder !== name) {
      problems.push(
        problem(
          "duplicate-address",
          name,
          `has the address ${address.address}, which ${holder} also holds`,
        ),
      );
    } else {
      byAddress.set(address.address, name);
    }
  };

  for (const row of estate.nodes) check("Node", row.name, row.overlay);
  for (const row of estate.vms) check("VM", row.name, row.overlay);
  for (const row of estate.peers) check("Peer", row.name, row.overlay);

  return problems;
};

/* -------------------------------------------------------------------------- */
/* Disabled actions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A disabled action's reason is one of the fixed codes.
 *
 * R43: a disabled action explains itself, and the explanation is a code rather
 * than free text. A reason outside the vocabulary would be a reason the console
 * cannot render, cannot localise, and cannot assert -- it could only print.
 */
export const checkDisabledActions = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];
  const reasons = new Set<string>(DISABLED_ACTION_REASONS);

  for (const [subject, actions] of Object.entries(estate.disabledActions)) {
    const [kind, name] = subject.split(":");
    const exists =
      (kind === "node" && estate.nodes.some((row) => row.name === name)) ||
      (kind === "vm" && estate.vms.some((row) => row.name === name)) ||
      (kind === "task" && estate.tasks.some((row) => row.name === name)) ||
      (kind === "peer" && estate.peers.some((row) => row.name === name));
    if (!exists) {
      problems.push(
        problem(
          "dangling-target",
          subject,
          `declares a disabled action for a ${kind} that is not in the estate`,
        ),
      );
    }
    for (const action of actions) {
      if (!reasons.has(action.reason)) {
        problems.push(
          problem(
            "disabled-reason",
            subject,
            `disables ${action.action} with the reason ${action.reason}, which is not a sovren error code`,
          ),
        );
      }
      if (action.explanation.trim() === "") {
        problems.push(
          problem("disabled-explanation", subject, `disables ${action.action} with no explanation`),
        );
      }
    }
  }

  return problems;
};

/* -------------------------------------------------------------------------- */
/* The awkward cases                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The awkward cases the screens exist to render must actually be present.
 *
 * Not a consistency rule in the usual sense -- a coherent estate may
 * legitimately have everything healthy. It is here because the estate is a
 * *fixture*, and its job is to exercise the screens. An estate where every row
 * is healthy exercises nothing, and each of these has a screen that cannot be
 * built or verified without it.
 */
export const checkAwkwardCases = (estate: Estate): ConsistencyProblem[] => {
  const problems: ConsistencyProblem[] = [];
  const need = (rule: string, present: boolean, detail: string): void => {
    if (!present) problems.push(problem(rule, "estate", detail));
  };

  need(
    "missing-node-without-overlay",
    estate.nodes.some((row) => row.overlay === null),
    "has no Node with a null overlay address, so no screen can render a machine that never enrolled",
  );
  need(
    "missing-transitional-vm",
    estate.vms.some((row) => row.runState === "transitional"),
    "has no transitional VM, so no screen can render work in flight",
  );
  need(
    "missing-failed-vm",
    estate.vms.some((row) => row.runState === "failed"),
    "has no failed VM, so no screen can render a failure distinct from a stop",
  );
  need(
    "missing-stale-peer",
    estate.peers.some((row) => row.lastSeenMinutesAgo > 60 * 24),
    "has no peer last seen more than a day ago, so no screen can render a peer that dropped off",
  );
  need(
    "missing-peer-without-node",
    estate.peers.some((row) => row.node === null),
    "has no peer with no Node, so no screen can render a laptop or a CI runner",
  );
  need(
    "missing-non-migratable-node",
    estate.nodes.some((row) => !row.canMigrate),
    "has no Node that cannot migrate, so a disabled action has nothing to explain",
  );
  need(
    "missing-disabled-action",
    Object.keys(estate.disabledActions).length > 0,
    "declares no disabled actions, so nothing exercises a control that explains itself",
  );
  need(
    "missing-heterogeneous-cpus",
    new Set(estate.nodes.map((row) => row.cpuModel)).size > 1,
    "reports one CPU model for every Node, which normalises the heterogeneity that is the normal case",
  );
  need(
    "missing-site",
    Object.keys(estate.sites).length > 1,
    "has one Site, so the Site scope and the site filter cannot be exercised",
  );
  need(
    "missing-failed-task",
    estate.tasks.some((row) => row.state === "failed"),
    "has no failed Task, so no screen can render a failure with a reason to read",
  );
  need(
    "missing-failed-connection",
    estate.connections.some((row) => row.state === "failed"),
    "has no failed Connection, so Settings cannot render a misconfiguration that explains itself",
  );

  return problems;
};

/**
 * The default estate has to be large enough for pagination to be real.
 *
 * Separate from the awkward cases because it is a property of *this* estate and
 * not of estates in general. The compact estate exists precisely to be small --
 * that is what makes it the narrow-screen fixture -- so holding it to a page
 * count would be holding it to the opposite of its purpose.
 */
export const checkScale = (estate: Estate): ConsistencyProblem[] => {
  const rows = estate.nodes.length + estate.vms.length + estate.peers.length + estate.tasks.length;
  if (rows > 25) return [];
  return [
    problem(
      "not-paginated",
      "estate",
      `has ${rows} rows in total, so it fits on one page at the default size and pagination is never exercised honestly`,
    ),
  ];
};

/** Everything: coherence, the awkward cases, and scale. What a test asserts. */
export const checkEstateFully = (estate: Estate): ConsistencyProblem[] => [
  ...checkEstate(estate),
  ...checkAwkwardCases(estate),
  ...checkScale(estate),
];
