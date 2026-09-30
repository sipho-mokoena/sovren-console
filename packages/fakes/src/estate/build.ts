/**
 * Turning estate names into resource bodies.
 *
 * The estate is written the way an operator describes a lab -- "a VM called
 * `grafana` on `accra-rig-01`" -- and these helpers fill in the parts that are
 * the same for every row: the id, the timestamps, the overlay address, and the
 * resolved references. What they deliberately do *not* do is decide anything
 * interesting. `canMigrate` is written per row in the estate, not computed here,
 * because a builder that computes it is a builder the consistency test cannot
 * disagree with.
 *
 * Ids are a literal ten-character suffix with the prefix supplied by the
 * resource kind. Both halves are written in the estate file, and both are
 * checked: the consistency suite validates the shape, the prefix/kind pairing,
 * and uniqueness. Writing all the characters by hand would only add the chance
 * of a typo in the part nobody looks at.
 */

import type {
  Connection,
  ConnectionState,
  DriveHealth,
  DriveType,
  Group,
  Node,
  NodeStatus,
  OverlayAddress,
  Peer,
  PeerStatus,
  Site,
  Task,
  TaskKind,
  TaskLink,
  TaskLogEvent,
  TaskState,
  TaskTargetResource,
  VMPurpose,
  VMRunState,
} from "@sovren/client";

import { ID_PREFIXES, type ResourceKind } from "./identifiers";
import type {
  ConnectionName,
  DiskName,
  DriveName,
  Estate,
  EstateConnection,
  EstateDisk,
  EstateDrive,
  EstateNode,
  EstatePeer,
  EstateSnapshot,
  EstateTask,
  EstateVm,
  GroupName,
  NodeName,
  PeerName,
  SiteName,
  SnapshotName,
  TaskName,
  VmName,
} from "./types";

/**
 * Assemble an id from its kind and a literal ten-character suffix.
 *
 * The suffix is a fixture identifier, written in the estate by hand. The prefix
 * is mechanical -- a Node's id opens `nd_`, always -- and the consistency suite
 * fails if one does not. That is the whole of the prefix/kind rule, and it is
 * checked rather than trusted.
 */
export const id = (kind: ResourceKind, suffix: string): string => `${ID_PREFIXES[kind]}_${suffix}`;

/**
 * NetBird's address space is the CGNAT range `100.64.0.0/10`, which is what
 * makes an overlay address recognisable at a glance and distinguishable from a
 * LAN address in a support conversation.
 */
export const overlayAddress = (ordinal: number): OverlayAddress => ({
  address: `100.64.${Math.floor(ordinal / 254)}.${(ordinal % 254) + 1}`,
  hostname: "",
});

/**
 * The estate's clock, as offsets in minutes from `now`.
 *
 * Every timestamp in the estate derives from one fixed instant. A wall clock
 * would make a fixture saying "a peer last seen six days ago" mean something
 * different tomorrow, and the screens under test would drift with no change in
 * the code.
 */
export class EstateClock {
  readonly #now: number;

  constructor(now: string) {
    this.#now = new Date(now).getTime();
  }

  /** An ISO instant `minutes` before the estate's `now`. */
  ago = (minutes: number): string => new Date(this.#now - minutes * 60_000).toISOString();

  /** An ISO instant `minutes` after the estate's `now`. */
  ahead = (minutes: number): string => new Date(this.#now + minutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Node                                                                       */
/* -------------------------------------------------------------------------- */

export interface NodeSpec {
  name: NodeName;
  suffix: string;
  site: SiteName;
  status: NodeStatus;
  cpuModel: string;
  cores: number;
  sockets: number;
  memoryBytes: number;
  maxMemoryBytes: number;
  /** Written, not derived, so the check against `drives` asserts something. */
  driveCount: number;
  driveBytes: number;
  /** Null when the machine has not enrolled. Null is a real state, not an empty cell. */
  overlay: OverlayAddress | null;
  uptimeSeconds: number | null;
  proxmoxVersion: string | null;
  canMigrate: boolean;
  drives: readonly DriveName[];
  /** Written, not derived, so the check against this asserts something. */
  vms: readonly VmName[];
  vmCount: number;
  peers: readonly PeerName[];
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const node = (
  clock: EstateClock,
  sites: Readonly<Record<SiteName, Site>>,
  spec: NodeSpec,
): EstateNode => {
  const site = sites[spec.site];
  if (site === undefined) {
    throw new Error(`node ${spec.name} names the Site ${spec.site}, which is not in this estate`);
  }
  const body: Omit<Node, "site"> = {
    id: id("node", spec.suffix),
    name: spec.name,
    status: spec.status,
    cpuModel: spec.cpuModel,
    cores: spec.cores,
    sockets: spec.sockets,
    memoryBytes: spec.memoryBytes,
    maxMemoryBytes: spec.maxMemoryBytes,
    driveCount: spec.driveCount,
    driveBytes: spec.driveBytes,
    overlay: spec.overlay === null ? null : { ...spec.overlay, hostname: spec.name },
    vmCount: spec.vmCount,
    uptimeSeconds: spec.uptimeSeconds,
    proxmoxVersion: spec.proxmoxVersion,
    canMigrate: spec.canMigrate,
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
  };
  return {
    ...body,
    site,
    siteName: spec.site,
    drives: spec.drives,
    vms: spec.vms,
    peers: spec.peers,
  };
};

/* -------------------------------------------------------------------------- */
/* Peer                                                                       */
/* -------------------------------------------------------------------------- */

export interface PeerSpec {
  name: PeerName;
  suffix: string;
  /** Null for a machine that is not one of the estate's Nodes: a laptop, a phone, a CI runner. */
  node: NodeName | null;
  site: SiteName | null;
  /**
   * The address the enrolled agent holds.
   *
   * Explicit rather than computed from an ordinal because it is never the
   * machine's to choose: a Node's Peer holds *its Node's* address and a VM's Peer
   * holds *its VM's* address, because they are the same machine seen from two
   * sides. Deriving both independently is how an estate ends up with one machine
   * holding two addresses, which is exactly what the consistency check refuses.
   * Only a peer with no machine behind it -- a laptop, a CI runner -- picks its
   * own, and those are handed out one after another by the estate.
   */
  overlay: OverlayAddress;
  os: Peer["os"];
  groups: readonly GroupName[];
  status: PeerStatus;
  lastSeenMinutesAgo: number;
  user: string | null;
  isBlocked?: boolean;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const peer = (
  clock: EstateClock,
  sites: Readonly<Record<SiteName, Site>>,
  groups: Readonly<Record<GroupName, Group>>,
  nodes: Readonly<Record<NodeName, EstateNode>>,
  spec: PeerSpec,
): EstatePeer => {
  const host = spec.node === null ? undefined : nodes[spec.node];
  if (spec.node !== null && host === undefined) {
    throw new Error(
      `peer ${spec.name} is enrolled on the Node ${spec.node}, which is not in this estate`,
    );
  }
  const resolvedGroups = spec.groups.map((groupName) => {
    const found = groups[groupName];
    if (found === undefined) {
      throw new Error(
        `peer ${spec.name} carries the Group ${groupName}, which this estate does not declare`,
      );
    }
    return found;
  });
  const site = spec.site === null ? null : sites[spec.site];
  if (spec.site !== null && site === undefined) {
    throw new Error(`peer ${spec.name} names the Site ${spec.site}, which is not in this estate`);
  }

  return {
    id: id("peer", spec.suffix),
    name: spec.name,
    overlay: { ...spec.overlay, hostname: spec.name },
    os: spec.os,
    groups: resolvedGroups,
    status: spec.status,
    lastSeen: clock.ago(spec.lastSeenMinutesAgo),
    node:
      spec.node === null ? null : { id: (host as EstateNode).id, name: (host as EstateNode).name },
    site,
    user: spec.user,
    ...(spec.isBlocked === undefined ? {} : { isBlocked: spec.isBlocked }),
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
    lastSeenMinutesAgo: spec.lastSeenMinutesAgo,
  };
};

/* -------------------------------------------------------------------------- */
/* VM                                                                         */
/* -------------------------------------------------------------------------- */

export interface VmSpec {
  name: VmName;
  suffix: string;
  node: NodeName;
  purpose: VMPurpose;
  cpuModel: string;
  cores: number;
  memoryBytes: number;
  diskBytes: number;
  runState: VMRunState;
  /** Null until the guest has enrolled, which is a real state and not an empty cell. */
  overlay: OverlayAddress | null;
  /** The Task that put this VM where it is, when one did. */
  transitionalTask: TaskName | null;
  failureReason: string | null;
  canMigrate: boolean;
  uptimeSeconds: number | null;
  isTemplate?: boolean;
  tags?: readonly string[];
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const vm = (
  clock: EstateClock,
  sites: Readonly<Record<SiteName, Site>>,
  nodes: Readonly<Record<NodeName, EstateNode>>,
  tasks: Readonly<Record<TaskName, TaskLink>>,
  spec: VmSpec,
): EstateVm => {
  const host = nodes[spec.node];
  if (host === undefined) {
    throw new Error(`vm ${spec.name} names the Node ${spec.node}, which is not in this estate`);
  }
  const site = sites[host.siteName];
  if (site === undefined) {
    throw new Error(
      `vm ${spec.name} resolves to the Site ${host.siteName}, which is not in this estate`,
    );
  }
  const transitional = spec.transitionalTask === null ? undefined : tasks[spec.transitionalTask];
  if (spec.transitionalTask !== null && transitional === undefined) {
    throw new Error(
      `vm ${spec.name} names the Task ${spec.transitionalTask}, which is not in this estate`,
    );
  }

  return {
    id: id("vm", spec.suffix),
    name: spec.name,
    node: { id: host.id, name: host.name },
    site,
    purpose: spec.purpose,
    cpuModel: spec.cpuModel,
    cores: spec.cores,
    memoryBytes: spec.memoryBytes,
    diskBytes: spec.diskBytes,
    runState: spec.runState,
    overlay: spec.overlay === null ? null : { ...spec.overlay, hostname: spec.name },
    transitionalTask: transitional === undefined ? null : { ...transitional },
    failureReason: spec.failureReason,
    canMigrate: spec.canMigrate,
    uptimeSeconds: spec.uptimeSeconds,
    ...(spec.isTemplate === undefined ? {} : { isTemplate: spec.isTemplate }),
    ...(spec.tags === undefined ? {} : { tags: [...spec.tags] }),
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
    nodeName: spec.node,
    transitionalTaskName: spec.transitionalTask,
    disks: [],
    snapshots: [],
  };
};

/* -------------------------------------------------------------------------- */
/* Drive and Disk                                                             */
/* -------------------------------------------------------------------------- */

export interface DriveSpec {
  name: DriveName;
  suffix: string;
  node: NodeName;
  type: DriveType;
  sizeBytes: number;
  usedBytes: number | null;
  health: DriveHealth;
  pveDevice: string | null;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const drive = (
  clock: EstateClock,
  nodes: Readonly<Record<NodeName, EstateNode>>,
  spec: DriveSpec,
): EstateDrive => {
  const host = nodes[spec.node];
  if (host === undefined) {
    throw new Error(`drive ${spec.name} names the Node ${spec.node}, which is not in this estate`);
  }
  return {
    id: id("drive", spec.suffix),
    name: spec.name,
    nodeId: host.id,
    type: spec.type,
    sizeBytes: spec.sizeBytes,
    usedBytes: spec.usedBytes,
    health: spec.health,
    pveDevice: spec.pveDevice,
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
    nodeName: spec.node,
  };
};

export interface DiskSpec {
  name: DiskName;
  suffix: string;
  vm: VmName;
  sizeBytes: number;
  usedBytes: number | null;
  storage: string | null;
  format: string | null;
  isCloudInit?: boolean;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const disk = (
  clock: EstateClock,
  vms: Readonly<Record<VmName, EstateVm>>,
  spec: DiskSpec,
): EstateDisk => {
  const host = vms[spec.vm];
  if (host === undefined) {
    throw new Error(`disk ${spec.name} names the VM ${spec.vm}, which is not in this estate`);
  }
  return {
    id: id("disk", spec.suffix),
    name: spec.name,
    vmId: host.id,
    sizeBytes: spec.sizeBytes,
    usedBytes: spec.usedBytes,
    storage: spec.storage,
    format: spec.format,
    ...(spec.isCloudInit === undefined ? {} : { isCloudInit: spec.isCloudInit }),
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
    vmName: spec.vm,
  };
};

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

export interface SnapshotSpec {
  name: SnapshotName;
  suffix: string;
  vm: VmName;
  description: string | null;
  /** By name, so a chain cannot dangle and two rows cannot claim one parent id. */
  parent: SnapshotName | null;
  sizeBytes: number | null;
  includesMemory: boolean;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const snapshot = (
  clock: EstateClock,
  vms: Readonly<Record<VmName, EstateVm>>,
  spec: SnapshotSpec,
): EstateSnapshot => {
  const host = vms[spec.vm];
  if (host === undefined) {
    throw new Error(`snapshot ${spec.name} names the VM ${spec.vm}, which is not in this estate`);
  }
  return {
    id: id("snapshot", spec.suffix),
    name: spec.name,
    vmId: host.id,
    description: spec.description,
    // Resolved in one pass below, once every snapshot exists.
    parentSnapshotId: null,
    sizeBytes: spec.sizeBytes,
    includesMemory: spec.includesMemory,
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
    vmName: spec.vm,
    parentName: spec.parent,
  };
};

/**
 * Resolve each snapshot's parent id now that every snapshot exists.
 *
 * A chain is written by name -- `postgres-main-post-upgrade` names
 * `postgres-main-pre-upgrade` -- and the parent id is derived from that. Writing
 * the parent's id by hand in both rows is how a chain ends up with two ids for
 * one snapshot, or a parent id that belongs to a different VM's snapshot.
 */
export const linkSnapshots = (built: readonly EstateSnapshot[]): EstateSnapshot[] => {
  const byName = new Map(built.map((entry) => [entry.name, entry]));
  return built.map((entry) => {
    if (entry.parentName === null) return entry;
    const parent = byName.get(entry.parentName);
    if (parent === undefined) {
      throw new Error(
        `snapshot ${entry.name} names the parent ${entry.parentName}, which is not in this estate`,
      );
    }
    if (parent.vmName !== entry.vmName) {
      throw new Error(
        `snapshot ${entry.name} names the parent ${parent.name}, which belongs to the VM ${parent.vmName}`,
      );
    }
    return { ...entry, parentSnapshotId: parent.id };
  });
};

/* -------------------------------------------------------------------------- */
/* Task                                                                       */
/* -------------------------------------------------------------------------- */

export interface TaskLogLine {
  tag: TaskLogEvent["tag"];
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  step?: string | null;
  state?: TaskState | null;
  error?: TaskLogEvent["error"] | null;
  /** Minutes after the Task started. Orders the lines without a counter to keep in step. */
  atOffsetMinutes: number;
}

export interface TaskSpec {
  name: TaskName;
  suffix: string;
  kind: TaskKind;
  targetResource: TaskTargetResource;
  targetName: NodeName | VmName | ConnectionName | SiteName;
  state: TaskState;
  terminalState: TaskState | null;
  failureReason: string | null;
  cancelledReason: string | null;
  startedMinutesAgo: number | null;
  /** Minutes after the start at which it finished. Null while it has not. */
  finishedAfterMinutes: number | null;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
  /** Lines the provisioner emitted. Empty for a Task that never started. */
  logs: readonly TaskLogLine[];
}

export const task = (clock: EstateClock, links: TargetLinks, spec: TaskSpec): EstateTask => {
  const start = spec.startedMinutesAgo;
  const logs: TaskLogEvent[] = spec.logs.map((line, position) => ({
    seq: position + 1,
    tag: line.tag,
    at: start === null ? clock.ago(0) : clock.ago(start - line.atOffsetMinutes),
    message: line.message,
    ...(line.level === undefined ? {} : { level: line.level }),
    step: line.step ?? null,
    state: line.state ?? null,
    error: line.error ?? null,
  }));

  const target = resolveTarget(spec, links);

  return {
    id: id("task", spec.suffix),
    name: spec.name,
    kind: spec.kind,
    target,
    state: spec.state,
    terminalState: spec.terminalState,
    failureReason: spec.failureReason,
    cancelledReason: spec.cancelledReason,
    startedAt: start === null ? null : clock.ago(start),
    finishedAt:
      start === null || spec.finishedAfterMinutes === null
        ? null
        : clock.ago(Math.max(start - spec.finishedAfterMinutes, 0)),
    lastSeq: logs.length === 0 ? null : (logs.at(-1) as TaskLogEvent).seq,
    logCount: logs.length,
    created: clock.ago(spec.createdMinutesAgo),
    updated: clock.ago(spec.updatedMinutesAgo),
    targetResource: spec.targetResource,
    targetName: spec.targetName,
    logs,
  };
};

/**
 * The `{ id, name }` of everything a Task can target.
 *
 * Passing links rather than whole resources is what breaks the cycle: a Task
 * needs its target's id, and a VM needs its Task's id and state, so neither can
 * be built from the other. Both read from this, which is derived from the spec
 * lists directly and therefore has no order.
 */
export interface TargetLinks {
  readonly nodes: Readonly<Record<string, { id: string; name: string }>>;
  readonly vms: Readonly<Record<string, { id: string; name: string }>>;
  readonly connections: Readonly<Record<string, { id: string; name: string }>>;
  readonly sites: Readonly<Record<string, { id: string; name: string }>>;
}

const resolveTarget = (spec: TaskSpec, links: TargetLinks): Task["target"] => {
  const universe: Readonly<
    Record<TaskTargetResource, Readonly<Record<string, { id: string; name: string }>>>
  > = {
    vm: links.vms,
    node: links.nodes,
    connection: links.connections,
    site: links.sites,
    peer: {},
  };
  const found = universe[spec.targetResource][spec.targetName];
  if (found === undefined) {
    throw new Error(
      `task ${spec.name} targets the ${spec.targetResource} ${spec.targetName}, which is not in this estate`,
    );
  }
  return { resource: spec.targetResource, id: found.id, name: found.name };
};

/**
 * The `{ id, kind, state }` of every Task, for a VM that names one.
 *
 * Built from the Task specs rather than from built Tasks, so a VM can be built
 * before the Task that created it -- which is the natural order, since a
 * create's Task and the VM it produces come from the same line of the estate.
 */
export const taskLinks = (
  specs: ReadonlyArray<Pick<TaskSpec, "name" | "suffix" | "kind" | "state">>,
): Readonly<Record<string, TaskLink>> =>
  Object.fromEntries(
    specs.map((spec) => [
      spec.name,
      { id: id("task", spec.suffix), kind: spec.kind, state: spec.state },
    ]),
  );

/* -------------------------------------------------------------------------- */
/* Connection and Group                                                       */
/* -------------------------------------------------------------------------- */

export interface ConnectionSpec {
  name: ConnectionName;
  suffix: string;
  kind: Connection["kind"];
  endpoint: string | null;
  state: ConnectionState;
  requirements: Connection["requirements"];
  credentials: Connection["credentials"];
  /** Minutes before the estate's `now` that the last test ran. Null when none has. */
  lastTestMinutesAgo: number | null;
  lastTest: Omit<NonNullable<Connection["lastTest"]>, "testedAt"> | null;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
}

export const connection = (clock: EstateClock, spec: ConnectionSpec): EstateConnection => ({
  id: id("connection", spec.suffix),
  name: spec.name,
  kind: spec.kind,
  endpoint: spec.endpoint,
  state: spec.state,
  requirements: spec.requirements.map((requirement) => ({ ...requirement })),
  credentials: spec.credentials.map((credential) => ({ ...credential })),
  lastTest:
    spec.lastTest === null || spec.lastTestMinutesAgo === null
      ? null
      : { ...spec.lastTest, testedAt: clock.ago(spec.lastTestMinutesAgo) },
  created: clock.ago(spec.createdMinutesAgo),
  updated: clock.ago(spec.updatedMinutesAgo),
});

/** A NetBird Group. A peer's groups come from here, never from free text. */
export const group = (suffix: string, name: GroupName): Group => ({
  id: id("group", suffix),
  name,
});

/* -------------------------------------------------------------------------- */
/* The estate                                                                 */
/* -------------------------------------------------------------------------- */

export interface EstateParts {
  readonly name: string;
  readonly description: string;
  readonly cpuFloor: string;
  readonly now: string;
  readonly sites: Readonly<Record<SiteName, Site>>;
  readonly groups: readonly Group[];
  readonly nodes: readonly EstateNode[];
  readonly peers: readonly EstatePeer[];
  readonly vms: readonly EstateVm[];
  readonly drives: readonly EstateDrive[];
  readonly disks: readonly EstateDisk[];
  readonly snapshots: readonly EstateSnapshot[];
  readonly tasks: readonly EstateTask[];
  readonly connections: readonly EstateConnection[];
  readonly disabledActions: Estate["disabledActions"];
}

/**
 * Assemble the estate, then index every collection by name for the builders and
 * the mock backend to use.
 *
 * The one thing it computes is a VM's `disks` and `snapshots`, and it does that
 * from the children rather than from a second list written on the VM. Written
 * twice, the two lists would eventually disagree and the detail page would show
 * a disk the list page does not -- which is the exact class of bug the whole
 * world builder exists to make impossible.
 */
export const buildEstate = (parts: EstateParts): Estate => {
  const vms = parts.vms.map((entry) => ({
    ...entry,
    disks: parts.disks.filter((child) => child.vmName === entry.name).map((child) => child.name),
    snapshots: parts.snapshots
      .filter((child) => child.vmName === entry.name)
      .map((child) => child.name),
  })) as EstateVm[];

  return {
    name: parts.name,
    description: parts.description,
    cpuFloor: parts.cpuFloor,
    now: parts.now,
    sites: parts.sites,
    groups: parts.groups,
    nodes: parts.nodes,
    peers: parts.peers,
    vms,
    drives: parts.drives,
    disks: parts.disks,
    snapshots: parts.snapshots,
    tasks: parts.tasks,
    connections: parts.connections,
    disabledActions: parts.disabledActions,
  };
};

/** Index a collection by name, for `NameOrId` resolution in the mock backend. */
export const indexByName = <T extends { readonly name: string }>(
  rows: readonly T[],
): Readonly<Record<string, T>> => Object.fromEntries(rows.map((row) => [row.name, row]));

/** Index a collection by id, for `NameOrId` resolution in the mock backend. */
export const indexById = <T extends { readonly id: string }>(
  rows: readonly T[],
): Readonly<Record<string, T>> => Object.fromEntries(rows.map((row) => [row.id, row]));
