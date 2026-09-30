/**
 * The compact estate: one Site, two Nodes, two VMs.
 *
 * Ticket 03 asks for a second, smaller description "for narrow-screen testing",
 * and the reason it is a separate description rather than a page size is that a
 * narrow screen and a small estate are different problems. A page size of three
 * on the full estate still renders a table whose *columns* do not fit; a table
 * of three rows on a small estate still has every column, the sticky identity
 * column, the sticky action column, and the empty state to get right. This is
 * the second case.
 *
 * It is a real estate, not a truncation. It carries the awkward cases the full
 * one does -- a Node with no overlay address, a VM whose create Task is still
 * running, a peer that has not been seen in days -- because a narrow screen that
 * has never been tested against a null address breaks on the one row that
 * matters.
 *
 * Select it at runtime with `?estate=compact`, or in a test with
 * `estateFor("compact")`. R54's point is that both take the identical path from
 * the same description, so what an operator sees on a narrow screen is what a
 * test asserted.
 */

import type { Site } from "@sovren/client";

import {
  buildEstate,
  connection,
  disk,
  drive,
  EstateClock,
  group,
  id,
  linkSnapshots,
  node,
  overlayAddress,
  peer,
  snapshot,
  task,
  taskLinks,
  vm,
} from "./build";
import type {
  Estate,
  EstateConnection,
  EstateNode,
  EstatePeer,
  EstateSnapshot,
  EstateTask,
  EstateVm,
  GroupName,
  NodeName,
  SiteName,
  VmName,
} from "./types";

const NOW = "2026-09-29T06:00:00.000Z";
const CPU_FLOOR = "kvm64";
const GiB = 1024 ** 3;
const TiB = 1024 ** 4;
const DAY = 60 * 24;

const clock = new EstateClock(NOW);

/* -------------------------------------------------------------------------- */
/* Sites and Groups                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One Site carries rows, two carry none.
 *
 * A Site with a null description is a real case -- the annexe building has never
 * been written up -- and a screen that renders `description` unconditionally
 * will show the word "null" on it.
 */
const sites: Readonly<Record<SiteName, Site>> = {
  "accra-lab": {
    id: "st_01hq2sc001",
    name: "accra-lab",
    description: "One desk, one shelf, one switch port. Enough to see every column.",
  },
  "kumasi-store": { id: "st_01hq2sc002", name: "kumasi-store", description: null },
  "takoradi-annex": { id: "st_01hq2sc003", name: "takoradi-annex", description: null },
};

const groupList = [
  group("01hq2h0001", "All"),
  group("01hq2h0002", "Infrastructure"),
  group("01hq2h0003", "Service Hosts"),
  group("01hq2h0004", "Operators"),
  group("01hq2h0005", "Lab Users"),
  group("01hq2h0006", "Build Runners"),
];

const groupIndex = Object.fromEntries(groupList.map((entry) => [entry.name, entry])) as Record<
  GroupName,
  (typeof groupList)[number]
>;

/* -------------------------------------------------------------------------- */
/* Nodes and Drives                                                           */
/* -------------------------------------------------------------------------- */

const nodeSpecs = [
  {
    name: "accra-desk-01",
    suffix: "01hq2c0001",
    site: "accra-lab",
    status: "online",
    cpuModel: "Intel Core i5-4590",
    cores: 4,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 8 * GiB,
    driveCount: 1,
    driveBytes: 256 * GiB,
    overlay: overlayAddress(11),
    uptimeSeconds: 431_002,
    proxmoxVersion: "9.2.4",
    canMigrate: false,
    drives: ["accra-desk-01-sda"],
    vmCount: 3,
    vms: ["sovren-cp", "grafana", "legacy-erp"],
    peers: ["accra-desk-01"],
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 12,
  },
  {
    // The awkward case again, at one row: a Node with no overlay address. Null,
    // not an empty string -- a narrow screen still has to render it.
    name: "takoradi-nas-01",
    suffix: "01hq2c0002",
    site: "takoradi-annex",
    status: "degraded",
    cpuModel: "Intel Celeron G1820",
    cores: 2,
    sockets: 1,
    memoryBytes: 4 * GiB,
    maxMemoryBytes: 4 * GiB,
    driveCount: 1,
    driveBytes: 8 * TiB,
    overlay: null,
    uptimeSeconds: 8_112_004,
    proxmoxVersion: "8.4.1",
    canMigrate: false,
    drives: ["takoradi-nas-01-sda"],
    vmCount: 0,
    vms: [],
    peers: [],
    createdMinutesAgo: DAY * 260,
    updatedMinutesAgo: 20 * 60,
  },
] satisfies readonly Parameters<typeof node>[2][];

const nodes: EstateNode[] = nodeSpecs.map((spec) => node(clock, sites, spec));

const nodeIndex = Object.fromEntries(nodes.map((entry) => [entry.name, entry])) as Record<
  NodeName,
  EstateNode
>;

const driveSpecs = [
  {
    name: "accra-desk-01-sda",
    suffix: "01hq2c0001",
    node: "accra-desk-01",
    type: "ssd",
    sizeBytes: 256 * GiB,
    usedBytes: 97 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "takoradi-nas-01-sda",
    suffix: "01hq2c0002",
    node: "takoradi-nas-01",
    type: "hdd",
    sizeBytes: 8 * TiB,
    usedBytes: 6920 * GiB,
    health: "degraded",
    pveDevice: "/dev/sda",
  },
] satisfies readonly Omit<Parameters<typeof drive>[2], "createdMinutesAgo" | "updatedMinutesAgo">[];

const drives = driveSpecs.map((spec) =>
  drive(clock, nodeIndex, { ...spec, createdMinutesAgo: DAY * 200, updatedMinutesAgo: 37 }),
);

/* -------------------------------------------------------------------------- */
/* Tasks, VMs, Disks, Snapshots                                               */
/* -------------------------------------------------------------------------- */

const taskSpecs = [
  {
    name: "create-sovren-cp",
    suffix: "01hq2c0001",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "sovren-cp",
    state: "running",
    terminalState: null,
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: 9,
    finishedAfterMinutes: null,
    createdMinutesAgo: 9,
    updatedMinutesAgo: 1,
    logs: [
      {
        tag: "log",
        message: "plan: 3 to add, 0 to change, 0 to destroy",
        atOffsetMinutes: 0,
        step: "plan",
      },
      {
        tag: "log",
        message: "proxmox_virtual_environment_vm.sovren_cp: Creating",
        atOffsetMinutes: 0,
        step: "apply",
        state: "running",
      },
      {
        tag: "log",
        message: "cloud-init running (modules: 3, run: 1)",
        atOffsetMinutes: 4,
        step: "cloud-init",
        state: "running",
      },
    ],
  },
  {
    name: "restore-grafana-canary",
    suffix: "01hq2t0003",
    kind: "vm_restore",
    targetResource: "vm",
    targetName: "grafana",
    state: "failed",
    terminalState: "failed",
    failureReason:
      "the target snapshot could not be read: the storage is not available on accra-desk-01",
    cancelledReason: null,
    startedMinutesAgo: 5 * 60,
    finishedAfterMinutes: 1,
    createdMinutesAgo: 5 * 60,
    updatedMinutesAgo: 5 * 60 - 1,
    logs: [
      { tag: "log", message: "reading the snapshot chain", atOffsetMinutes: 0, step: "pre" },
      {
        tag: "log",
        message: "Error: storage 'local-lvm' is not available on accra-desk-01",
        atOffsetMinutes: 0,
        step: "pre",
        level: "error",
      },
      {
        tag: "result",
        message:
          "Failed. the target snapshot could not be read: the storage is not available on accra-desk-01",
        state: "failed",
        atOffsetMinutes: 1,
      },
    ],
  },
  {
    name: "snapshot-sovren-cp-base",
    suffix: "01hq2c0002",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "sovren-cp",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 4,
    finishedAfterMinutes: 1,
    createdMinutesAgo: DAY * 4,
    updatedMinutesAgo: DAY * 4 - 1,
    logs: [
      {
        tag: "log",
        message: "snapshot sovren-cp-base created",
        atOffsetMinutes: 0,
        step: "snapshot",
      },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 1 },
    ],
  },
] satisfies readonly Parameters<typeof task>[2][];

const vmSpecs = [
  {
    // Transitional, with its create Task still running and no overlay address yet.
    name: "sovren-cp",
    suffix: "01hq2c0001",
    node: "accra-desk-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "transitional",
    overlay: null,
    transitionalTask: "create-sovren-cp",
    failureReason: null,
    canMigrate: false,
    uptimeSeconds: null,
    createdMinutesAgo: 9,
    updatedMinutesAgo: 1,
  },
  {
    // The awkward case, at one row: an explicit failure, distinct from stopped,
    // carrying the reason. A narrow screen has to render this in a table cell.
    name: "legacy-erp",
    suffix: "01hq2c0003",
    node: "accra-desk-01",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 1,
    memoryBytes: 1 * GiB,
    diskBytes: 16 * GiB,
    runState: "failed",
    overlay: overlayAddress(22),
    transitionalTask: null,
    failureReason: "the guest agent stopped responding and the VM was not restarted",
    canMigrate: false,
    uptimeSeconds: null,
    createdMinutesAgo: DAY * 60,
    updatedMinutesAgo: DAY * 2,
  },
  {
    name: "grafana",
    suffix: "01hq2c0002",
    node: "accra-desk-01",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(21),
    transitionalTask: null,
    failureReason: null,
    canMigrate: false,
    uptimeSeconds: 158_400,
    createdMinutesAgo: DAY * 30,
    updatedMinutesAgo: 11,
  },
] satisfies readonly Parameters<typeof vm>[4][];

const connections: EstateConnection[] = [
  // A misconfiguration Settings has to render rather than hide: the requirement
  // is met and the credential is held, but the token was rotated out from under
  // it, so the last test failed with a code the console keys off.
  connection(clock, {
    name: "netbird-accra",
    suffix: "01hq2cw002",
    kind: "netbird",
    endpoint: "https://netbird.lan",
    state: "failed",
    requirements: [
      {
        kind: "api_token",
        label: "API token",
        required: true,
        why: "Listing peers, groups, and policies over the NetBird API.",
      },
    ],
    credentials: [
      {
        kind: "api_token",
        label: "API token",
        held: true,
        heldSince: "2026-03-05T10:00:00.000Z",
        lastRotatedAt: null,
      },
    ],
    lastTestMinutesAgo: 33,
    lastTest: {
      ok: false,
      code: "upstream_unauthenticated",
      message: "NetBird rejected the token: 401 from the management service",
      requestId: "req_01hq2cnetbird01",
      latencyMs: 64,
    },
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 33,
  }),
  connection(clock, {
    name: "proxmox-accra",
    suffix: "01hq2c0001",
    kind: "proxmox",
    endpoint: "https://proxmox.lan:8006/api2/json",
    state: "tested",
    requirements: [
      {
        kind: "api_token",
        label: "API token",
        required: true,
        why: "Proxmox resource CRUD over the API.",
      },
      {
        kind: "pam_ssh_key",
        label: "PAM SSH key",
        required: true,
        why: "Cloud-init snippets need SFTP and a PAM account.",
      },
    ],
    credentials: [
      {
        kind: "api_token",
        label: "API token",
        held: true,
        heldSince: "2026-03-04T09:00:00.000Z",
        lastRotatedAt: "2026-08-14T11:20:00.000Z",
      },
      {
        kind: "pam_ssh_key",
        label: "PAM SSH key",
        held: true,
        heldSince: "2026-03-04T09:05:00.000Z",
        lastRotatedAt: "2026-06-30T08:00:00.000Z",
      },
    ],
    lastTestMinutesAgo: 41,
    lastTest: {
      ok: true,
      code: null,
      message: "Proxmox VE 9.2.4 answered in 41ms.",
      requestId: "req_01hq2cproxmox",
      latencyMs: 41,
    },
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 41,
  }),
];

/** What a Task can target, as `{ id, name }`. See the note in `fleet.ts`. */
const targetLinks = {
  nodes: Object.fromEntries(
    nodeSpecs.map((spec) => [spec.name, { id: id("node", spec.suffix), name: spec.name }]),
  ),
  vms: Object.fromEntries(
    vmSpecs.map((spec) => [spec.name, { id: id("vm", spec.suffix), name: spec.name }]),
  ),
  connections: Object.fromEntries(
    connections.map((entry) => [entry.name, { id: entry.id, name: entry.name }]),
  ),
  sites: Object.fromEntries(
    Object.values(sites).map((entry) => [entry.name, { id: entry.id, name: entry.name }]),
  ),
};

const vms: EstateVm[] = vmSpecs.map((spec) =>
  vm(clock, sites, nodeIndex, taskLinks(taskSpecs), spec),
);
const vmIndex = Object.fromEntries(vms.map((entry) => [entry.name, entry])) as Record<
  VmName,
  EstateVm
>;
const tasks: EstateTask[] = taskSpecs.map((spec) => task(clock, targetLinks, spec));

const diskSpecs = [
  {
    name: "sovren-cp-root",
    suffix: "01hq2c0001",
    vm: "sovren-cp",
    sizeBytes: 64 * GiB,
    usedBytes: 18 * GiB,
    storage: "local-lvm",
    format: "qcow2",
  },
  // R62: the cloud-init drive stays attached, or boot hangs with no useful error.
  {
    name: "sovren-cp-cloudinit",
    suffix: "01hq2c0002",
    vm: "sovren-cp",
    sizeBytes: 4 * 1024 * 1024,
    usedBytes: 1_048_576,
    storage: "local",
    format: "raw",
    isCloudInit: true,
  },
  {
    name: "grafana-root",
    suffix: "01hq2c0003",
    vm: "grafana",
    sizeBytes: 32 * GiB,
    usedBytes: 7 * GiB,
    storage: "local-lvm",
    format: "qcow2",
  },
] satisfies readonly Omit<Parameters<typeof disk>[2], "createdMinutesAgo" | "updatedMinutesAgo">[];

const disks = diskSpecs.map((spec) =>
  disk(clock, vmIndex, { ...spec, createdMinutesAgo: DAY * 30, updatedMinutesAgo: 40 }),
);

const snapshots: EstateSnapshot[] = linkSnapshots([
  snapshot(clock, vmIndex, {
    name: "sovren-cp-base",
    suffix: "01hq2c0001",
    vm: "sovren-cp",
    description: "taken when the machine was first built",
    parent: null,
    sizeBytes: 2 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 4,
    updatedMinutesAgo: DAY * 4,
  }),
]);

/* -------------------------------------------------------------------------- */
/* Peers                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A machine's Peer holds *its machine's* address. That is the enrolment: the
 * agent inside `accra-desk-01` is the same box as the Proxmox Node of that name,
 * deliberately sharing a name and an address.
 *
 * `sovren-cp` has no peer at all. It is still transitional, its guest agent has
 * not run, and a peer row is a record of an enrolment -- so a VM detail page
 * here opens onto an empty peers tab, which is a real screen and a real thing to
 * have got wrong.
 */
const peers: EstatePeer[] = [
  peer(clock, sites, groupIndex, nodeIndex, {
    name: "accra-desk-01",
    suffix: "01hq2p0101",
    node: "accra-desk-01",
    site: "accra-lab",
    overlay: overlayAddress(11),
    os: "linux",
    groups: ["All", "Infrastructure"],
    status: "connected",
    lastSeenMinutesAgo: 2,
    user: null,
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 5,
  }),
  peer(clock, sites, groupIndex, nodeIndex, {
    name: "grafana",
    suffix: "01hq2p0103",
    node: "accra-desk-01",
    site: "accra-lab",
    overlay: overlayAddress(21),
    os: "linux",
    groups: ["All", "Service Hosts"],
    status: "connected",
    lastSeenMinutesAgo: 1,
    user: null,
    createdMinutesAgo: DAY * 30,
    updatedMinutesAgo: 3,
  }),
  // The awkward case, at one row: a peer not seen in days, with no Node and no
  // Site behind it, so nothing about it is inferable from the estate's machines.
  peer(clock, sites, groupIndex, nodeIndex, {
    name: "ops-laptop-sipho",
    suffix: "01hq2p0104",
    node: null,
    site: null,
    overlay: overlayAddress(240),
    os: "linux",
    groups: ["All", "Operators"],
    status: "stale",
    lastSeenMinutesAgo: DAY * 6,
    user: "sipho",
    isBlocked: false,
    createdMinutesAgo: DAY * 300,
    updatedMinutesAgo: DAY * 6,
  }),
];

/* -------------------------------------------------------------------------- */
/* The estate                                                                 */
/* -------------------------------------------------------------------------- */

export const compact: Estate = buildEstate({
  name: "compact",
  description:
    "One desk and one shelf, for a narrow screen. Two Nodes, two VMs, four peers, and the same awkward cases the full estate carries.",
  cpuFloor: CPU_FLOOR,
  now: NOW,
  sites,
  groups: groupList,
  nodes,
  peers,
  vms,
  drives,
  disks,
  snapshots,
  tasks,
  connections,
  disabledActions: {
    "node:accra-desk-01": [
      {
        action: "migrate",
        reason: "action_not_permitted",
        explanation:
          "Live migration is not offered across heterogeneous CPUs, and there is no second Node that could take it.",
      },
    ],
    "node:takoradi-nas-01": [
      {
        action: "migrate",
        reason: "action_not_permitted",
        explanation: "The CPU is below the fleet floor, and the machine is not on the overlay.",
      },
    ],
    "vm:sovren-cp": [
      {
        action: "stop",
        reason: "action_not_permitted",
        explanation:
          "Its create Task is still running. Wait for it to finish, or cancel the Task first.",
      },
    ],
  },
});
