/**
 * The estate: a lab of retired desktops, the guests on them, the peers enrolled
 * on the overlay, and last week's tasks.
 *
 * This is the whole world the console renders. There is no control plane and no
 * Proxmox anywhere in this prototype, so every row on every screen comes from
 * the value at the bottom of this file, and every fixture in every test comes
 * from it too. Change one line here and every screen, every mock, and every test
 * change together -- which is R54, and the reason a screen can never disagree
 * with a test about what exists.
 *
 * **Heterogeneity is the normal case, not an edge case.** These are retired
 * university desktops: a 2009 Core 2 Duo beside a 2019 Xeon, one machine with
 * 4 GB and one with 192, one enrolled on the overlay and one that never was.
 * Nothing is normalised, because normalising it would make the estate a fiction
 * and the screens built on it a fiction with it.
 *
 * **The awkward cases are here on purpose.** They are the rows the screens exist
 * to render, and an estate containing only the happy path leaves every one of
 * them discovered in production:
 *
 *   - `takoradi-nas-01` has no overlay address. Null, not an empty string.
 *   - `grafana-canary` is `transitional`, its create Task still running.
 *   - `legacy-erp` is `failed`, with a reason, distinct from stopped.
 *   - `ops-laptop-sipho` has not been seen in six days.
 *   - `accra-desk-01` cannot migrate: its CPU is below the fleet floor.
 *   - Every Node reports the CPU it actually has, not `kvm64`.
 *
 * **It is large enough to paginate honestly.** Twenty Nodes and twenty-seven VMs
 * against a default page size of twenty-five, so the pagination path is
 * exercised by looking at the console rather than only by a test that asks for
 * three rows.
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
  type TaskLogLine,
} from "./build";
import type {
  DiskName,
  Estate,
  EstateConnection,
  EstateNode,
  EstatePeer,
  EstateSnapshot,
  EstateTask,
  EstateVm,
  GroupName,
  NodeName,
  PeerName,
  SiteName,
  VmName,
} from "./types";

/**
 * A fixed instant. Every relative date in the estate is measured from here, so
 * "last seen six days ago" means the same thing in a test in March as in
 * September.
 */
const NOW = "2026-09-29T06:00:00.000Z";

/** R63. Every VM is floored to this, and a Node below it cannot offer it. */
const CPU_FLOOR = "kvm64";

const GiB = 1024 ** 3;
const TiB = 1024 ** 4;
const DAY = 60 * 24;

const clock = new EstateClock(NOW);

/* -------------------------------------------------------------------------- */
/* Sites and Groups                                                           */
/* -------------------------------------------------------------------------- */

const sites: Readonly<Record<SiteName, Site>> = {
  "accra-lab": {
    id: "st_01hq2sa001",
    name: "accra-lab",
    description: "Main lab, ground floor. Three switch ports, one of them on the old switch.",
  },
  "kumasi-store": {
    id: "st_01hq2sk001",
    name: "kumasi-store",
    description: "Store room above the workshop. Not air conditioned, and it shows.",
  },
  "takoradi-annex": {
    id: "st_01hq2st001",
    name: "takoradi-annex",
    description: "Annexe building. Furthest from the others, on the worst link.",
  },
};

const groupList = [
  group("01hq2g0001", "All"),
  group("01hq2g0002", "Infrastructure"),
  group("01hq2g0003", "Service Hosts"),
  group("01hq2g0004", "Operators"),
  group("01hq2g0005", "Lab Users"),
  group("01hq2g0006", "Build Runners"),
];

const groupIndex = Object.fromEntries(groupList.map((entry) => [entry.name, entry])) as Record<
  GroupName,
  (typeof groupList)[number]
>;

/* -------------------------------------------------------------------------- */
/* Nodes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Twenty retired desktops across three Sites.
 *
 * CPU models are the ones these machines actually report, spanning 2009 to 2021.
 * `canMigrate` is written per row rather than derived: a Node whose CPU is below
 * the floor cannot offer it, and a derivation here would be one the consistency
 * test could only ever agree with.
 */
const nodeSpecs = [
  {
    // Below the floor, and the machine the awkward cases hang off. Migration is
    // refused here for the same reason it is refused across heterogeneous CPUs.
    name: "accra-desk-01",
    suffix: "01hq2n0001",
    site: "accra-lab",
    status: "online",
    cpuModel: "Intel Core 2 Duo E8400",
    cores: 2,
    sockets: 1,
    memoryBytes: 4 * GiB,
    maxMemoryBytes: 4 * GiB,
    driveCount: 2,
    driveBytes: 1000 * GiB,
    overlay: overlayAddress(11),
    uptimeSeconds: 918_233,
    proxmoxVersion: "9.2.4",
    canMigrate: false,
    drives: ["accra-desk-01-sda", "accra-desk-01-sdb"],
    vmCount: 1,
    vms: ["legacy-erp"],
    peers: ["accra-desk-01"],
    createdMinutesAgo: DAY * 380,
    updatedMinutesAgo: 12,
  },
  {
    name: "accra-desk-02",
    suffix: "01hq2n0002",
    site: "accra-lab",
    status: "online",
    cpuModel: "Intel Core i5-4590",
    cores: 4,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 16 * GiB,
    driveCount: 1,
    driveBytes: 320 * GiB,
    overlay: overlayAddress(12),
    uptimeSeconds: 431_002,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["accra-desk-02-sda"],
    vmCount: 1,
    vms: ["paperless"],
    peers: ["accra-desk-02"],
    createdMinutesAgo: DAY * 360,
    updatedMinutesAgo: 8,
  },
  {
    name: "accra-desk-03",
    suffix: "01hq2n0003",
    site: "accra-lab",
    status: "degraded",
    cpuModel: "Intel Core i7-4770",
    cores: 4,
    sockets: 1,
    memoryBytes: 16 * GiB,
    maxMemoryBytes: 16 * GiB,
    driveCount: 1,
    driveBytes: 256 * GiB,
    overlay: overlayAddress(13),
    uptimeSeconds: 1_204_556,
    proxmoxVersion: "9.1.9",
    canMigrate: true,
    drives: ["accra-desk-03-sda"],
    vmCount: 1,
    vms: ["immich"],
    peers: ["accra-desk-03"],
    createdMinutesAgo: DAY * 340,
    updatedMinutesAgo: 3,
  },
  {
    name: "accra-rig-01",
    suffix: "01hq2n0004",
    site: "accra-lab",
    status: "online",
    cpuModel: "AMD Ryzen 7 3700X",
    cores: 8,
    sockets: 1,
    memoryBytes: 64 * GiB,
    maxMemoryBytes: 64 * GiB,
    driveCount: 1,
    driveBytes: 1 * TiB,
    overlay: overlayAddress(14),
    uptimeSeconds: 3_884_001,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["accra-rig-01-nvme0"],
    vmCount: 3,
    vms: ["dokploy-01", "lab-build-01", "lab-build-02"],
    peers: ["accra-rig-01"],
    createdMinutesAgo: DAY * 320,
    updatedMinutesAgo: 2,
  },
  {
    name: "accra-rig-02",
    suffix: "01hq2n0005",
    site: "accra-lab",
    status: "online",
    cpuModel: "AMD Ryzen 9 5950X",
    cores: 16,
    sockets: 1,
    memoryBytes: 64 * GiB,
    maxMemoryBytes: 128 * GiB,
    driveCount: 1,
    driveBytes: 1 * TiB,
    overlay: overlayAddress(15),
    uptimeSeconds: 1_559_220,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["accra-rig-02-nvme0"],
    vmCount: 3,
    vms: ["k8s-control-01", "k8s-worker-01", "k8s-worker-02"],
    peers: ["accra-rig-02"],
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 5,
  },
  {
    name: "accra-server-01",
    suffix: "01hq2n0006",
    site: "accra-lab",
    status: "online",
    cpuModel: "Intel Xeon E5-2680 v4",
    cores: 12,
    sockets: 2,
    memoryBytes: 96 * GiB,
    maxMemoryBytes: 128 * GiB,
    driveCount: 2,
    driveBytes: 4608 * GiB,
    overlay: overlayAddress(16),
    uptimeSeconds: 7_210_884,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["accra-server-01-sda", "accra-server-01-sdb"],
    vmCount: 3,
    vms: ["netbird", "sovren-cp", "golden"],
    peers: ["accra-server-01"],
    createdMinutesAgo: DAY * 300,
    updatedMinutesAgo: 1,
  },
  {
    name: "accra-server-02",
    suffix: "01hq2n0007",
    site: "accra-lab",
    status: "online",
    cpuModel: "Intel Xeon Gold 6248R",
    cores: 24,
    sockets: 2,
    memoryBytes: 192 * GiB,
    maxMemoryBytes: 256 * GiB,
    driveCount: 2,
    driveBytes: 4 * TiB,
    overlay: overlayAddress(17),
    uptimeSeconds: 2_004_113,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["accra-server-02-nvme0", "accra-server-02-nvme1"],
    vmCount: 4,
    vms: ["postgres-main", "redis-cache", "grafana", "nextcloud"],
    peers: ["accra-server-02"],
    createdMinutesAgo: DAY * 240,
    updatedMinutesAgo: 4,
  },
  {
    // Offline, and never seen since. The rows behind it still exist, which is
    // the point: a machine that dropped off has not taken its guests with it.
    name: "accra-laptop-01",
    suffix: "01hq2n0008",
    site: "accra-lab",
    status: "offline",
    cpuModel: "Intel Core i5-8250U",
    cores: 4,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 16 * GiB,
    driveCount: 1,
    driveBytes: 512 * GiB,
    overlay: overlayAddress(18),
    uptimeSeconds: null,
    proxmoxVersion: "8.4.1",
    canMigrate: false,
    drives: ["accra-laptop-01-nvme0"],
    vmCount: 0,
    vms: [],
    peers: ["accra-laptop-01"],
    createdMinutesAgo: DAY * 150,
    updatedMinutesAgo: 27 * 60,
  },
  {
    name: "kumasi-desk-01",
    suffix: "01hq2n0009",
    site: "kumasi-store",
    status: "online",
    cpuModel: "Intel Core i3-4130",
    cores: 2,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 8 * GiB,
    driveCount: 1,
    driveBytes: 500 * GiB,
    overlay: overlayAddress(21),
    uptimeSeconds: 812_004,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["kumasi-desk-01-sda"],
    vmCount: 1,
    vms: ["kumasi-web-01"],
    peers: ["kumasi-desk-01"],
    createdMinutesAgo: DAY * 280,
    updatedMinutesAgo: 19,
  },
  {
    name: "kumasi-desk-02",
    suffix: "01hq2n0010",
    site: "kumasi-store",
    status: "online",
    cpuModel: "Intel Core i5-4570",
    cores: 4,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 8 * GiB,
    driveCount: 1,
    driveBytes: 320 * GiB,
    overlay: overlayAddress(22),
    uptimeSeconds: 640_118,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["kumasi-desk-02-sda"],
    vmCount: 1,
    vms: ["kumasi-web-02"],
    peers: ["kumasi-desk-02"],
    createdMinutesAgo: DAY * 280,
    updatedMinutesAgo: 22,
  },
  {
    name: "kumasi-desk-03",
    suffix: "01hq2n0011",
    site: "kumasi-store",
    status: "degraded",
    cpuModel: "AMD Athlon II X2 250",
    cores: 2,
    sockets: 1,
    memoryBytes: 4 * GiB,
    maxMemoryBytes: 4 * GiB,
    driveCount: 1,
    driveBytes: 250 * GiB,
    overlay: overlayAddress(23),
    uptimeSeconds: 1_990_442,
    proxmoxVersion: "9.0.9",
    canMigrate: false,
    drives: ["kumasi-desk-03-sda"],
    vmCount: 0,
    vms: [],
    peers: ["kumasi-desk-03"],
    createdMinutesAgo: DAY * 300,
    updatedMinutesAgo: 44,
  },
  {
    name: "kumasi-desk-04",
    suffix: "01hq2n0012",
    site: "kumasi-store",
    status: "online",
    cpuModel: "Intel Core i5-9400",
    cores: 6,
    sockets: 1,
    memoryBytes: 16 * GiB,
    maxMemoryBytes: 16 * GiB,
    driveCount: 1,
    driveBytes: 256 * GiB,
    overlay: overlayAddress(24),
    uptimeSeconds: 122_009,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["kumasi-desk-04-sda"],
    vmCount: 1,
    vms: ["kumasi-cache-01"],
    peers: ["kumasi-desk-04"],
    createdMinutesAgo: DAY * 190,
    updatedMinutesAgo: 15,
  },
  {
    name: "kumasi-rig-01",
    suffix: "01hq2n0013",
    site: "kumasi-store",
    status: "online",
    cpuModel: "AMD Ryzen 5 3600",
    cores: 6,
    sockets: 1,
    memoryBytes: 32 * GiB,
    maxMemoryBytes: 32 * GiB,
    driveCount: 1,
    driveBytes: 1 * TiB,
    overlay: overlayAddress(25),
    uptimeSeconds: 2_771_006,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["kumasi-rig-01-nvme0"],
    vmCount: 2,
    vms: ["kumasi-db-01", "wireguard-lab"],
    peers: ["kumasi-rig-01"],
    createdMinutesAgo: DAY * 230,
    updatedMinutesAgo: 9,
  },
  {
    name: "kumasi-server-01",
    suffix: "01hq2n0014",
    site: "kumasi-store",
    status: "online",
    cpuModel: "Intel Xeon E5-2650 v3",
    cores: 10,
    sockets: 2,
    memoryBytes: 64 * GiB,
    maxMemoryBytes: 128 * GiB,
    driveCount: 2,
    driveBytes: 4608 * GiB,
    overlay: overlayAddress(26),
    uptimeSeconds: 5_100_774,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["kumasi-server-01-sda", "kumasi-server-01-sdb"],
    vmCount: 2,
    vms: ["backup-target", "spare-bench-01"],
    peers: ["kumasi-server-01"],
    createdMinutesAgo: DAY * 270,
    updatedMinutesAgo: 6,
  },
  {
    name: "takoradi-desk-01",
    suffix: "01hq2n0015",
    site: "takoradi-annex",
    status: "online",
    cpuModel: "Intel Core i5-2400",
    cores: 4,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 8 * GiB,
    driveCount: 1,
    driveBytes: 500 * GiB,
    overlay: overlayAddress(31),
    uptimeSeconds: 1_411_993,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["takoradi-desk-01-sda"],
    vmCount: 1,
    vms: ["takoradi-edge-01"],
    peers: ["takoradi-desk-01"],
    createdMinutesAgo: DAY * 220,
    updatedMinutesAgo: 27,
  },
  {
    name: "takoradi-desk-02",
    suffix: "01hq2n0016",
    site: "takoradi-annex",
    status: "online",
    cpuModel: "Intel Pentium G3220",
    cores: 2,
    sockets: 1,
    memoryBytes: 8 * GiB,
    maxMemoryBytes: 8 * GiB,
    driveCount: 1,
    driveBytes: 320 * GiB,
    overlay: overlayAddress(32),
    uptimeSeconds: 1_100_338,
    proxmoxVersion: "9.2.4",
    canMigrate: false,
    drives: ["takoradi-desk-02-sda"],
    vmCount: 1,
    vms: ["takoradi-media"],
    peers: ["takoradi-desk-02"],
    createdMinutesAgo: DAY * 220,
    updatedMinutesAgo: 31,
  },
  {
    name: "takoradi-rig-01",
    suffix: "01hq2n0017",
    site: "takoradi-annex",
    status: "online",
    cpuModel: "AMD Ryzen 5 5600X",
    cores: 6,
    sockets: 1,
    memoryBytes: 32 * GiB,
    maxMemoryBytes: 32 * GiB,
    driveCount: 1,
    driveBytes: 512 * GiB,
    overlay: overlayAddress(33),
    uptimeSeconds: 402_887,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["takoradi-rig-01-nvme0"],
    vmCount: 1,
    vms: ["grafana-canary"],
    peers: ["takoradi-rig-01"],
    createdMinutesAgo: DAY * 160,
    updatedMinutesAgo: 2,
  },
  {
    name: "takoradi-server-01",
    suffix: "01hq2n0018",
    site: "takoradi-annex",
    status: "online",
    cpuModel: "Intel Xeon E5-2620 v3",
    cores: 8,
    sockets: 2,
    memoryBytes: 64 * GiB,
    maxMemoryBytes: 128 * GiB,
    driveCount: 2,
    driveBytes: 5120 * GiB,
    overlay: overlayAddress(34),
    uptimeSeconds: 3_002_119,
    proxmoxVersion: "9.2.4",
    canMigrate: true,
    drives: ["takoradi-server-01-nvme0", "takoradi-server-01-sdb"],
    vmCount: 1,
    vms: ["golden-tpl"],
    peers: ["takoradi-server-01"],
    createdMinutesAgo: DAY * 210,
    updatedMinutesAgo: 11,
  },
  {
    // The awkward one: a retired NAS that never enrolled on the overlay. `overlay`
    // is null -- not "", not "0.0.0.0". A null address is a fact about the
    // machine, and a screen that renders it as an empty cell is lying about it.
    name: "takoradi-nas-01",
    suffix: "01hq2n0019",
    site: "takoradi-annex",
    status: "degraded",
    cpuModel: "Intel Celeron G1820",
    cores: 2,
    sockets: 1,
    memoryBytes: 4 * GiB,
    maxMemoryBytes: 4 * GiB,
    driveCount: 4,
    driveBytes: 32 * TiB,
    overlay: null,
    uptimeSeconds: 8_112_004,
    proxmoxVersion: "8.4.1",
    canMigrate: false,
    drives: [
      "takoradi-nas-01-sda",
      "takoradi-nas-01-sdb",
      "takoradi-nas-01-sdc",
      "takoradi-nas-01-sdd",
    ],
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

/** A Node's Site by name, for the rows that hang off one. */
const siteOfNode = (nodeName: NodeName): SiteName => {
  const found = nodes.find((entry) => entry.name === nodeName);
  if (found === undefined) throw new Error(`no Node named ${nodeName} in this estate`);
  return found.siteName;
};

/* -------------------------------------------------------------------------- */
/* Drives                                                                     */
/* -------------------------------------------------------------------------- */

/** A Drive, not a Disk. Physical storage on a Node, never VM storage. */
const driveSpecs = [
  {
    name: "accra-desk-01-sda",
    suffix: "01hq2d0001",
    node: "accra-desk-01",
    type: "hdd",
    sizeBytes: 500 * GiB,
    usedBytes: 412 * GiB,
    health: "degraded",
    pveDevice: "/dev/sda",
  },
  {
    name: "accra-desk-01-sdb",
    suffix: "01hq2d0002",
    node: "accra-desk-01",
    type: "hdd",
    sizeBytes: 500 * GiB,
    usedBytes: 88 * GiB,
    health: "degraded",
    pveDevice: "/dev/sdb",
  },
  {
    name: "accra-desk-02-sda",
    suffix: "01hq2d0003",
    node: "accra-desk-02",
    type: "hdd",
    sizeBytes: 320 * GiB,
    usedBytes: 201 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "accra-desk-03-sda",
    suffix: "01hq2d0004",
    node: "accra-desk-03",
    type: "ssd",
    sizeBytes: 256 * GiB,
    usedBytes: 97 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "accra-rig-01-nvme0",
    suffix: "01hq2d0005",
    node: "accra-rig-01",
    type: "nvme",
    sizeBytes: 1 * TiB,
    usedBytes: 640 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "accra-rig-02-nvme0",
    suffix: "01hq2d0006",
    node: "accra-rig-02",
    type: "nvme",
    sizeBytes: 1 * TiB,
    usedBytes: 221 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "accra-server-01-sda",
    suffix: "01hq2d0007",
    node: "accra-server-01",
    type: "ssd",
    sizeBytes: 480 * GiB,
    usedBytes: null,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "accra-server-01-sdb",
    suffix: "01hq2d0008",
    node: "accra-server-01",
    type: "hdd",
    sizeBytes: 4 * TiB,
    usedBytes: 2310 * GiB,
    health: "healthy",
    pveDevice: "/dev/sdb",
  },
  {
    name: "accra-server-02-nvme0",
    suffix: "01hq2d0009",
    node: "accra-server-02",
    type: "nvme",
    sizeBytes: 2 * TiB,
    usedBytes: 1104 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "accra-server-02-nvme1",
    suffix: "01hq2d0010",
    node: "accra-server-02",
    type: "nvme",
    sizeBytes: 2 * TiB,
    usedBytes: 88 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme1n1",
  },
  {
    name: "accra-laptop-01-nvme0",
    suffix: "01hq2d0011",
    node: "accra-laptop-01",
    type: "nvme",
    sizeBytes: 512 * GiB,
    usedBytes: 233 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "kumasi-desk-01-sda",
    suffix: "01hq2d0012",
    node: "kumasi-desk-01",
    type: "hdd",
    sizeBytes: 500 * GiB,
    usedBytes: 468 * GiB,
    health: "degraded",
    pveDevice: "/dev/sda",
  },
  {
    name: "kumasi-desk-02-sda",
    suffix: "01hq2d0013",
    node: "kumasi-desk-02",
    type: "hdd",
    sizeBytes: 320 * GiB,
    usedBytes: 155 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "kumasi-desk-03-sda",
    suffix: "01hq2d0014",
    node: "kumasi-desk-03",
    type: "hdd",
    sizeBytes: 250 * GiB,
    usedBytes: 244 * GiB,
    health: "failed",
    pveDevice: "/dev/sda",
  },
  {
    name: "kumasi-desk-04-sda",
    suffix: "01hq2d0015",
    node: "kumasi-desk-04",
    type: "ssd",
    sizeBytes: 256 * GiB,
    usedBytes: 61 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "kumasi-rig-01-nvme0",
    suffix: "01hq2d0016",
    node: "kumasi-rig-01",
    type: "nvme",
    sizeBytes: 1 * TiB,
    usedBytes: 730 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "kumasi-server-01-sda",
    suffix: "01hq2d0017",
    node: "kumasi-server-01",
    type: "ssd",
    sizeBytes: 480 * GiB,
    usedBytes: null,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "kumasi-server-01-sdb",
    suffix: "01hq2d0018",
    node: "kumasi-server-01",
    type: "hdd",
    sizeBytes: 4 * TiB,
    usedBytes: 3890 * GiB,
    health: "degraded",
    pveDevice: "/dev/sdb",
  },
  {
    name: "takoradi-desk-01-sda",
    suffix: "01hq2d0019",
    node: "takoradi-desk-01",
    type: "hdd",
    sizeBytes: 500 * GiB,
    usedBytes: 302 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "takoradi-desk-02-sda",
    suffix: "01hq2d0020",
    node: "takoradi-desk-02",
    type: "hdd",
    sizeBytes: 320 * GiB,
    usedBytes: 121 * GiB,
    health: "healthy",
    pveDevice: "/dev/sda",
  },
  {
    name: "takoradi-rig-01-nvme0",
    suffix: "01hq2d0021",
    node: "takoradi-rig-01",
    type: "nvme",
    sizeBytes: 512 * GiB,
    usedBytes: 205 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "takoradi-server-01-nvme0",
    suffix: "01hq2d0022",
    node: "takoradi-server-01",
    type: "nvme",
    sizeBytes: 960 * GiB,
    usedBytes: 388 * GiB,
    health: "healthy",
    pveDevice: "/dev/nvme0n1",
  },
  {
    name: "takoradi-server-01-sdb",
    suffix: "01hq2d0023",
    node: "takoradi-server-01",
    type: "hdd",
    sizeBytes: 4 * TiB,
    usedBytes: 1640 * GiB,
    health: "healthy",
    pveDevice: "/dev/sdb",
  },
  // Two of the four are unprobed, which is `unknown` health and a null pveDevice.
  // A Drive nothing has read from is a real state on a machine nobody has logged
  // into since it was retired.
  {
    name: "takoradi-nas-01-sda",
    suffix: "01hq2d0024",
    node: "takoradi-nas-01",
    type: "hdd",
    sizeBytes: 8 * TiB,
    usedBytes: 6920 * GiB,
    health: "degraded",
    pveDevice: "/dev/sda",
  },
  {
    name: "takoradi-nas-01-sdb",
    suffix: "01hq2d0025",
    node: "takoradi-nas-01",
    type: "hdd",
    sizeBytes: 8 * TiB,
    usedBytes: 7010 * GiB,
    health: "degraded",
    pveDevice: "/dev/sdb",
  },
  {
    name: "takoradi-nas-01-sdc",
    suffix: "01hq2d0026",
    node: "takoradi-nas-01",
    type: "hdd",
    sizeBytes: 8 * TiB,
    usedBytes: null,
    health: "unknown",
    pveDevice: null,
  },
  {
    name: "takoradi-nas-01-sdd",
    suffix: "01hq2d0027",
    node: "takoradi-nas-01",
    type: "hdd",
    sizeBytes: 8 * TiB,
    usedBytes: null,
    health: "unknown",
    pveDevice: null,
  },
] satisfies readonly Omit<Parameters<typeof drive>[2], "createdMinutesAgo" | "updatedMinutesAgo">[];

const drives = driveSpecs.map((spec) =>
  drive(clock, nodeIndex, { ...spec, createdMinutesAgo: DAY * 400, updatedMinutesAgo: 37 }),
);

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The lines a provisioner emitted, in the shape the log stream carries.
 *
 * Kept as a compact literal per Task and expanded by `task()`, so the estate
 * reads as a list of runs rather than a wall of `seq` and `at` fields that no
 * human is going to check.
 */
const lines = (...specs: TaskLogLine[]): TaskLogLine[] => [...specs];

/** The recurring shape of a `vm_create` run, so the log streams are comparable. */
const createRun = (steps: readonly TaskLogLine[], result: string): TaskLogLine[] =>
  lines(
    {
      tag: "log",
      message: "plan: 3 to add, 0 to change, 0 to destroy",
      atOffsetMinutes: 0,
      step: "plan",
    },
    {
      tag: "log",
      message: "waiting for the QEMU process to appear",
      atOffsetMinutes: 2,
      step: "boot",
    },
    {
      tag: "log",
      message: "cloud-init finished (modules: 9, run: 2)",
      atOffsetMinutes: 4,
      step: "cloud-init",
    },
    ...steps,
    { tag: "result", message: result, state: "succeeded", atOffsetMinutes: 5 },
  );

const APPLIED = "Apply complete. Resources: 1 added, 0 changed, 0 destroyed.";

const taskSpecs = [
  {
    name: "create-netbird",
    suffix: "01hq2t0001",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "netbird",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 190,
    finishedAfterMinutes: 4,
    createdMinutesAgo: DAY * 190,
    updatedMinutesAgo: DAY * 190 - 4,
    logs: createRun(
      [
        {
          tag: "log",
          message: "netbird agent enrolled as netbird",
          atOffsetMinutes: 3,
          step: "enrol",
        },
      ],
      APPLIED,
    ),
  },
  {
    name: "create-sovren-cp",
    suffix: "01hq2t0002",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "sovren-cp",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 185,
    finishedAfterMinutes: 6,
    createdMinutesAgo: DAY * 185,
    updatedMinutesAgo: DAY * 185 - 6,
    logs: createRun(
      [
        {
          tag: "log",
          message: "uploaded cloud-init snippet over SFTP",
          atOffsetMinutes: 1,
          step: "snippet",
        },
        {
          tag: "log",
          message: "netbird agent enrolled as sovren-cp",
          atOffsetMinutes: 5,
          step: "enrol",
        },
      ],
      APPLIED,
    ),
  },
  {
    name: "create-golden",
    suffix: "01hq2t0004",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "golden",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 178,
    finishedAfterMinutes: 7,
    createdMinutesAgo: DAY * 178,
    updatedMinutesAgo: DAY * 178 - 7,
    logs: createRun([], APPLIED),
  },
  {
    // Awkward case: still running. The VM it created is `transitional`, and the
    // console has to show progress rather than a blank or a guess.
    name: "create-grafana-canary",
    suffix: "01hq2t0005",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "grafana-canary",
    state: "running",
    terminalState: null,
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: 11,
    finishedAfterMinutes: null,
    createdMinutesAgo: 11,
    updatedMinutesAgo: 1,
    logs: lines(
      {
        tag: "log",
        message: "plan: 3 to add, 0 to change, 0 to destroy",
        atOffsetMinutes: 0,
        step: "plan",
      },
      {
        tag: "log",
        message: "proxmox_virtual_environment_vm.grafana_canary: Creating",
        atOffsetMinutes: 0,
        step: "apply",
        state: "running",
      },
      {
        tag: "log",
        message: "waiting for the QEMU process to appear",
        atOffsetMinutes: 2,
        step: "boot",
        state: "running",
      },
      {
        tag: "log",
        message: "cloud-init running (modules: 4, run: 1)",
        atOffsetMinutes: 6,
        step: "cloud-init",
        state: "running",
      },
    ),
  },
  {
    name: "create-golden-tpl",
    suffix: "01hq2t0026",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "golden-tpl",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 175,
    finishedAfterMinutes: 8,
    createdMinutesAgo: DAY * 175,
    updatedMinutesAgo: DAY * 175 - 8,
    logs: createRun(
      [
        {
          tag: "log",
          message: "cloning golden as a fully linked clone",
          atOffsetMinutes: 1,
          step: "clone",
        },
        {
          tag: "log",
          message: "marked golden-tpl as a template",
          atOffsetMinutes: 6,
          step: "template",
        },
      ],
      APPLIED,
    ),
  },
  {
    // A cancelled create. Distinct from a failed one: the VM is stopped, not
    // failed, and the reason is a person rather than a fault.
    name: "create-lab-build-02",
    suffix: "01hq2t0007",
    kind: "vm_create",
    targetResource: "vm",
    targetName: "lab-build-02",
    state: "cancelled",
    terminalState: "cancelled",
    failureReason: null,
    cancelledReason: "Cancelled by an operator from the console.",
    startedMinutesAgo: 31 * 60,
    finishedAfterMinutes: 2,
    createdMinutesAgo: 31 * 60,
    updatedMinutesAgo: 31 * 60 - 2,
    logs: lines(
      {
        tag: "log",
        message: "plan: 3 to add, 0 to change, 0 destroy",
        atOffsetMinutes: 0,
        step: "plan",
      },
      {
        tag: "log",
        message: "proxmox_virtual_environment_vm.lab_build_02: Creating",
        atOffsetMinutes: 0,
        step: "apply",
      },
      {
        tag: "result",
        message: "Cancelled. The provisioner received SIGTERM and exited.",
        state: "cancelled",
        atOffsetMinutes: 2,
      },
    ),
  },
  {
    name: "snapshot-postgres-main-pre-upgrade",
    suffix: "01hq2t0008",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "postgres-main",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 12,
    finishedAfterMinutes: 1,
    createdMinutesAgo: DAY * 12,
    updatedMinutesAgo: DAY * 12 - 1,
    logs: lines(
      { tag: "log", message: "quiescing the guest agent", atOffsetMinutes: 0, step: "pre" },
      {
        tag: "log",
        message: "snapshot postgres-main-pre-upgrade created",
        atOffsetMinutes: 0,
        step: "snapshot",
      },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 1 },
    ),
  },
  {
    name: "snapshot-postgres-main-post-upgrade",
    suffix: "01hq2t0009",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "postgres-main",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 12,
    finishedAfterMinutes: 1,
    createdMinutesAgo: DAY * 12,
    updatedMinutesAgo: DAY * 12 - 1,
    logs: lines(
      {
        tag: "log",
        message: "snapshot postgres-main-post-upgrade created",
        atOffsetMinutes: 0,
        step: "snapshot",
      },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 1 },
    ),
  },
  {
    // Awkward case: a Task that failed. The reason is on the Task, and it is
    // what an operator opens the Task to read.
    name: "snapshot-grafana-canary-base",
    suffix: "01hq2t0013",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "grafana-canary",
    state: "failed",
    terminalState: "failed",
    failureReason:
      "the guest agent did not answer within 30s, so the snapshot could not be quiesced",
    cancelledReason: null,
    startedMinutesAgo: 8 * 60,
    finishedAfterMinutes: 1,
    createdMinutesAgo: 8 * 60,
    updatedMinutesAgo: 8 * 60 - 1,
    logs: lines(
      { tag: "log", message: "quiescing the guest agent", atOffsetMinutes: 0, step: "pre" },
      {
        tag: "log",
        message: "the guest agent did not answer within 30s",
        atOffsetMinutes: 0,
        step: "pre",
        level: "error",
      },
      {
        tag: "result",
        message:
          "Failed. the guest agent did not answer within 30s, so the snapshot could not be quiesced",
        state: "failed",
        atOffsetMinutes: 1,
      },
    ),
  },
  {
    name: "snapshot-nextcloud-weekly",
    suffix: "01hq2t0011",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "nextcloud",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 6,
    finishedAfterMinutes: 2,
    createdMinutesAgo: DAY * 6,
    updatedMinutesAgo: DAY * 6 - 2,
    logs: lines(
      {
        tag: "log",
        message: "snapshot nextcloud-weekly created",
        atOffsetMinutes: 1,
        step: "snapshot",
      },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 2 },
    ),
  },
  {
    name: "snapshot-nextcloud-daily",
    suffix: "01hq2t0012",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "nextcloud",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY,
    finishedAfterMinutes: 2,
    createdMinutesAgo: DAY,
    updatedMinutesAgo: DAY - 2,
    logs: lines(
      {
        tag: "log",
        message: "snapshot nextcloud-daily created",
        atOffsetMinutes: 1,
        step: "snapshot",
      },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 2 },
    ),
  },
  {
    name: "snapshot-legacy-erp",
    suffix: "01hq2t0023",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "legacy-erp",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 60,
    finishedAfterMinutes: 2,
    createdMinutesAgo: DAY * 60,
    updatedMinutesAgo: DAY * 60 - 2,
    logs: lines(
      { tag: "log", message: "snapshot legacy-erp created", atOffsetMinutes: 1, step: "snapshot" },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 2 },
    ),
  },
  {
    name: "snapshot-legacy-erp-pre-migration",
    suffix: "01hq2t0024",
    kind: "vm_snapshot",
    targetResource: "vm",
    targetName: "legacy-erp",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 30,
    finishedAfterMinutes: 2,
    createdMinutesAgo: DAY * 30,
    updatedMinutesAgo: DAY * 30 - 2,
    logs: lines(
      {
        tag: "log",
        message: "snapshot legacy-erp-pre-migration created",
        atOffsetMinutes: 1,
        step: "snapshot",
      },
      { tag: "result", message: "Snapshot created.", state: "succeeded", atOffsetMinutes: 2 },
    ),
  },
  {
    // A Site-targeted Task, which is the common case: an Ansible run against a lab.
    name: "ansible-bootstrap-accra",
    suffix: "01hq2t0017",
    kind: "ansible_run",
    targetResource: "site",
    targetName: "accra-lab",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 2,
    finishedAfterMinutes: 9,
    createdMinutesAgo: DAY * 2,
    updatedMinutesAgo: DAY * 2 - 9,
    logs: lines(
      { tag: "log", message: "PLAY [bootstrap] ***", atOffsetMinutes: 0, step: "bootstrap" },
      { tag: "log", message: "ok: [accra-desk-02]", atOffsetMinutes: 3, step: "bootstrap" },
      { tag: "log", message: "ok: [accra-desk-03]", atOffsetMinutes: 5, step: "bootstrap" },
      { tag: "log", message: "changed: [accra-laptop-01]", atOffsetMinutes: 7, step: "bootstrap" },
      {
        tag: "result",
        message: "PLAY RECAP: 8 hosts, 8 changed, 0 failed",
        state: "succeeded",
        atOffsetMinutes: 9,
      },
    ),
  },
  {
    name: "ansible-bootstrap-kumasi",
    suffix: "01hq2t0018",
    kind: "ansible_run",
    targetResource: "site",
    targetName: "kumasi-store",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 2,
    finishedAfterMinutes: 7,
    createdMinutesAgo: DAY * 2,
    updatedMinutesAgo: DAY * 2 - 7,
    logs: lines(
      { tag: "log", message: "PLAY [bootstrap] ***", atOffsetMinutes: 0, step: "bootstrap" },
      {
        tag: "result",
        message: "PLAY RECAP: 6 hosts, 5 changed, 0 failed",
        state: "succeeded",
        atOffsetMinutes: 7,
      },
    ),
  },
  {
    name: "ansible-converge-all",
    suffix: "01hq2t0019",
    kind: "ansible_run",
    targetResource: "site",
    targetName: "accra-lab",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: 20 * 60,
    finishedAfterMinutes: 22,
    createdMinutesAgo: 20 * 60,
    updatedMinutesAgo: 20 * 60 - 22,
    logs: lines(
      { tag: "log", message: "PLAY [converge] ****", atOffsetMinutes: 0, step: "converge" },
      { tag: "log", message: "ok: [accra-rig-01]", atOffsetMinutes: 12, step: "converge" },
      {
        tag: "result",
        message: "PLAY RECAP: 19 hosts, 19 ok, 0 failed",
        state: "succeeded",
        atOffsetMinutes: 22,
      },
    ),
  },
  {
    name: "terraform-accra",
    suffix: "01hq2t0014",
    kind: "terraform_apply",
    targetResource: "site",
    targetName: "accra-lab",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 3,
    finishedAfterMinutes: 4,
    createdMinutesAgo: DAY * 3,
    updatedMinutesAgo: DAY * 3 - 4,
    logs: lines(
      { tag: "log", message: "Initialising the backend", atOffsetMinutes: 0, step: "init" },
      {
        tag: "log",
        message: "plan: 0 to add, 1 to change, 0 to destroy",
        atOffsetMinutes: 1,
        step: "plan",
      },
      {
        tag: "log",
        message: "proxmox_virtual_environment_vm.nextcloud: Modifying",
        atOffsetMinutes: 2,
        step: "apply",
      },
      {
        tag: "result",
        message: "Apply complete. Resources: 0 added, 1 changed, 0 destroyed.",
        state: "succeeded",
        atOffsetMinutes: 4,
      },
    ),
  },
  {
    name: "terraform-kumasi",
    suffix: "01hq2t0015",
    kind: "terraform_apply",
    targetResource: "site",
    targetName: "kumasi-store",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: DAY * 3,
    finishedAfterMinutes: 3,
    createdMinutesAgo: DAY * 3,
    updatedMinutesAgo: DAY * 3 - 3,
    logs: lines(
      {
        tag: "log",
        message: "plan: 0 to add, 2 to change, 0 to destroy",
        atOffsetMinutes: 0,
        step: "plan",
      },
      {
        tag: "result",
        message: "Apply complete. Resources: 0 added, 2 changed, 0 destroyed.",
        state: "succeeded",
        atOffsetMinutes: 3,
      },
    ),
  },
  {
    // Awkward case: a Task that failed on an upstream refusal. The reason names
    // the upstream, in Proxmox's own terms -- which is data about the failure,
    // not a shape the console renders.
    name: "terraform-takoradi",
    suffix: "01hq2t0016",
    kind: "terraform_apply",
    targetResource: "site",
    targetName: "takoradi-annex",
    state: "failed",
    terminalState: "failed",
    failureReason:
      "proxmox rejected the request: storage 'local-lvm' is not available on takoradi-server-01",
    cancelledReason: null,
    startedMinutesAgo: 26 * 60,
    finishedAfterMinutes: 2,
    createdMinutesAgo: 26 * 60,
    updatedMinutesAgo: 26 * 60 - 2,
    logs: lines(
      {
        tag: "log",
        message: "plan: 1 to add, 0 to change, 0 to destroy",
        atOffsetMinutes: 0,
        step: "plan",
      },
      {
        tag: "log",
        message: "Error: storage 'local-lvm' is not available on takoradi-server-01",
        atOffsetMinutes: 1,
        step: "apply",
        level: "error",
      },
      {
        tag: "result",
        message:
          "Failed. proxmox rejected the request: storage 'local-lvm' is not available on takoradi-server-01",
        state: "failed",
        atOffsetMinutes: 2,
      },
    ),
  },
  {
    name: "test-connection-proxmox",
    suffix: "01hq2t0020",
    kind: "connection_test",
    targetResource: "connection",
    targetName: "proxmox-accra",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: 41,
    finishedAfterMinutes: 1,
    createdMinutesAgo: 41,
    updatedMinutesAgo: 40,
    logs: lines(
      { tag: "log", message: "GET /api2/json/version", atOffsetMinutes: 0, step: "probe" },
      {
        tag: "result",
        message: "Proxmox VE 9.2.4 answered in 41ms.",
        state: "succeeded",
        atOffsetMinutes: 1,
      },
    ),
  },
  {
    name: "test-connection-netbird",
    suffix: "01hq2t0021",
    kind: "connection_test",
    targetResource: "connection",
    targetName: "netbird-accra",
    state: "succeeded",
    terminalState: "succeeded",
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: 38,
    finishedAfterMinutes: 1,
    createdMinutesAgo: 38,
    updatedMinutesAgo: 37,
    logs: lines(
      { tag: "log", message: "GET /api/peers", atOffsetMinutes: 0, step: "probe" },
      {
        tag: "result",
        message: "NetBird answered in 22ms.",
        state: "succeeded",
        atOffsetMinutes: 1,
      },
    ),
  },
  {
    name: "test-connection-dokploy",
    suffix: "01hq2t0022",
    kind: "connection_test",
    targetResource: "connection",
    targetName: "dokploy-accra",
    state: "failed",
    terminalState: "failed",
    failureReason: "the API key was rejected: 401 from the Dokploy instance",
    cancelledReason: null,
    startedMinutesAgo: 33,
    finishedAfterMinutes: 1,
    createdMinutesAgo: 33,
    updatedMinutesAgo: 32,
    logs: lines(
      { tag: "log", message: "GET /api/settings", atOffsetMinutes: 0, step: "probe" },
      {
        tag: "log",
        message: "401 Unauthorized",
        atOffsetMinutes: 0,
        step: "probe",
        level: "error",
      },
      {
        tag: "result",
        message: "Failed. the API key was rejected: 401 from the Dokploy instance",
        state: "failed",
        atOffsetMinutes: 1,
      },
    ),
  },
  {
    // Queued, never claimed. The log stream for it is empty and it has no
    // startedAt, which is what "queued" means rather than a Task that looks idle.
    name: "restore-grafana-canary",
    suffix: "01hq2t0010",
    kind: "vm_restore",
    targetResource: "vm",
    targetName: "grafana-canary",
    state: "queued",
    terminalState: null,
    failureReason: null,
    cancelledReason: null,
    startedMinutesAgo: null,
    finishedAfterMinutes: null,
    createdMinutesAgo: 3,
    updatedMinutesAgo: 3,
    logs: [],
  },
] satisfies readonly Parameters<typeof task>[2][];

/* -------------------------------------------------------------------------- */
/* VMs, Disks, Snapshots                                                      */
/* -------------------------------------------------------------------------- */

const vmSpecs = [
  {
    name: "netbird",
    suffix: "01hq2v0001",
    node: "accra-server-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 2 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(41),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 16_329_004,
    createdMinutesAgo: DAY * 190,
    updatedMinutesAgo: 7,
  },
  {
    name: "sovren-cp",
    suffix: "01hq2v0002",
    node: "accra-server-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 128 * GiB,
    runState: "running",
    overlay: overlayAddress(42),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 15_998_442,
    createdMinutesAgo: DAY * 185,
    updatedMinutesAgo: 2,
  },
  {
    name: "dokploy-01",
    suffix: "01hq2v0003",
    node: "accra-rig-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "running",
    overlay: overlayAddress(43),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 57_600,
    createdMinutesAgo: DAY * 40,
    updatedMinutesAgo: 4,
  },
  {
    name: "golden",
    suffix: "01hq2v0004",
    node: "accra-server-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 32 * GiB,
    runState: "stopped",
    overlay: overlayAddress(44),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: null,
    createdMinutesAgo: DAY * 178,
    updatedMinutesAgo: DAY * 178 - 7,
  },
  {
    name: "golden-tpl",
    suffix: "01hq2v0005",
    node: "takoradi-server-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 32 * GiB,
    runState: "stopped",
    overlay: null,
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: null,
    isTemplate: true,
    tags: ["golden", "template"],
    createdMinutesAgo: DAY * 175,
    updatedMinutesAgo: DAY * 175 - 8,
  },
  {
    name: "postgres-main",
    suffix: "01hq2v0006",
    node: "accra-server-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 8,
    memoryBytes: 32 * GiB,
    diskBytes: 512 * GiB,
    runState: "running",
    overlay: overlayAddress(46),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 3_456_000,
    createdMinutesAgo: DAY * 130,
    updatedMinutesAgo: 3,
  },
  {
    name: "redis-cache",
    suffix: "01hq2v0007",
    node: "accra-server-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 8 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(47),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 3_456_100,
    createdMinutesAgo: DAY * 120,
    updatedMinutesAgo: 3,
  },
  {
    name: "grafana",
    suffix: "01hq2v0008",
    node: "accra-server-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(48),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 158_400,
    createdMinutesAgo: DAY * 110,
    updatedMinutesAgo: 11,
  },
  {
    name: "paperless",
    suffix: "01hq2v0009",
    node: "accra-desk-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 64 * GiB,
    runState: "running",
    overlay: overlayAddress(49),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 1_209_600,
    createdMinutesAgo: DAY * 55,
    updatedMinutesAgo: 60,
  },
  {
    name: "immich",
    suffix: "01hq2v0010",
    node: "accra-desk-03",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 256 * GiB,
    runState: "running",
    overlay: overlayAddress(50),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 1_209_700,
    createdMinutesAgo: DAY * 50,
    updatedMinutesAgo: 22,
  },
  {
    name: "nextcloud",
    suffix: "01hq2v0011",
    node: "accra-server-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 512 * GiB,
    runState: "running",
    overlay: overlayAddress(51),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 864_000,
    createdMinutesAgo: DAY * 100,
    updatedMinutesAgo: 4,
  },
  {
    name: "wireguard-lab",
    suffix: "01hq2v0012",
    node: "kumasi-rig-01",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 1,
    memoryBytes: 1 * GiB,
    diskBytes: 8 * GiB,
    runState: "running",
    overlay: overlayAddress(52),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 777_600,
    createdMinutesAgo: DAY * 9,
    updatedMinutesAgo: 5 * 60,
  },
  {
    name: "k8s-control-01",
    suffix: "01hq2v0016",
    node: "accra-rig-02",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "running",
    overlay: overlayAddress(56),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 129_600,
    createdMinutesAgo: DAY * 90,
    updatedMinutesAgo: DAY * 90 - 6,
  },
  {
    name: "k8s-worker-01",
    suffix: "01hq2v0017",
    node: "accra-rig-02",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "running",
    overlay: overlayAddress(57),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 129_601,
    createdMinutesAgo: DAY * 88,
    updatedMinutesAgo: DAY * 88 - 6,
  },
  {
    name: "k8s-worker-02",
    suffix: "01hq2v0018",
    node: "accra-rig-02",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "running",
    overlay: overlayAddress(58),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 129_602,
    createdMinutesAgo: DAY * 88,
    updatedMinutesAgo: DAY * 88 - 6,
  },
  {
    name: "backup-target",
    suffix: "01hq2v0019",
    node: "kumasi-server-01",
    purpose: "infrastructure",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 8 * GiB,
    diskBytes: 2 * TiB,
    runState: "running",
    overlay: overlayAddress(59),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 1_080_000,
    createdMinutesAgo: DAY * 25,
    updatedMinutesAgo: DAY * 25 - 6,
  },
  {
    name: "takoradi-edge-01",
    suffix: "01hq2v0020",
    node: "takoradi-desk-01",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 2 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(60),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 604_800,
    createdMinutesAgo: DAY * 15,
    updatedMinutesAgo: DAY * 15 - 5,
  },
  {
    name: "takoradi-media",
    suffix: "01hq2v0021",
    node: "takoradi-desk-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 2 * GiB,
    diskBytes: 1 * TiB,
    runState: "running",
    overlay: overlayAddress(61),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 518_400,
    createdMinutesAgo: DAY * 18,
    updatedMinutesAgo: DAY * 18 - 5,
  },
  {
    name: "kumasi-web-01",
    suffix: "01hq2v0022",
    node: "kumasi-desk-01",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 2 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(62),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 950_000,
    createdMinutesAgo: DAY * 22,
    updatedMinutesAgo: DAY * 22 - 5,
  },
  {
    name: "kumasi-web-02",
    suffix: "01hq2v0023",
    node: "kumasi-desk-02",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 2 * GiB,
    diskBytes: 32 * GiB,
    runState: "running",
    overlay: overlayAddress(63),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 950_100,
    createdMinutesAgo: DAY * 19,
    updatedMinutesAgo: DAY * 19 - 5,
  },
  {
    name: "kumasi-db-01",
    suffix: "01hq2v0024",
    node: "kumasi-rig-01",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 16 * GiB,
    diskBytes: 256 * GiB,
    runState: "running",
    overlay: overlayAddress(64),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 907_200,
    createdMinutesAgo: DAY * 21,
    updatedMinutesAgo: DAY * 21 - 6,
  },
  {
    name: "kumasi-cache-01",
    suffix: "01hq2v0025",
    node: "kumasi-desk-04",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 1,
    memoryBytes: 2 * GiB,
    diskBytes: 16 * GiB,
    runState: "running",
    overlay: overlayAddress(65),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 288_000,
    createdMinutesAgo: DAY * 19,
    updatedMinutesAgo: DAY * 19 - 5,
  },
  {
    name: "lab-build-01",
    suffix: "01hq2v0014",
    node: "accra-rig-01",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "running",
    overlay: overlayAddress(54),
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: 950_400,
    createdMinutesAgo: DAY * 33,
    updatedMinutesAgo: DAY * 33 - 5,
  },
  {
    name: "spare-bench-01",
    suffix: "01hq2v0027",
    node: "kumasi-server-01",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 32 * GiB,
    runState: "stopped",
    overlay: null,
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: null,
    tags: ["spare"],
    createdMinutesAgo: DAY * 4,
    updatedMinutesAgo: DAY * 4 - 5,
  },
  // Awkward case: a cancelled create. Stopped, not failed, and no address -- and
  // the consistency check insists the reason does not contradict the state.
  {
    name: "lab-build-02",
    suffix: "01hq2v0015",
    node: "accra-rig-01",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 4,
    memoryBytes: 8 * GiB,
    diskBytes: 64 * GiB,
    runState: "stopped",
    overlay: null,
    transitionalTask: null,
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: null,
    createdMinutesAgo: 31 * 60,
    updatedMinutesAgo: 31 * 60 - 2,
  },
  // Awkward case: still being built. `transitional` with a live Task behind it
  // and no overlay address, because the guest agent has not run yet.
  {
    name: "grafana-canary",
    suffix: "01hq2v0013",
    node: "takoradi-rig-01",
    purpose: "service",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 4 * GiB,
    diskBytes: 32 * GiB,
    runState: "transitional",
    overlay: null,
    transitionalTask: "create-grafana-canary",
    failureReason: null,
    canMigrate: true,
    uptimeSeconds: null,
    tags: ["canary"],
    createdMinutesAgo: 11,
    updatedMinutesAgo: 1,
  },
  // Awkward case: an explicit failure, distinct from stopped, carrying the reason.
  // A screen that renders this as "stopped" is telling the operator the wrong
  // thing about a machine that needs attention.
  {
    name: "legacy-erp",
    suffix: "01hq2v0026",
    node: "accra-desk-01",
    purpose: "workload",
    cpuModel: CPU_FLOOR,
    cores: 2,
    memoryBytes: 2 * GiB,
    diskBytes: 128 * GiB,
    runState: "failed",
    overlay: overlayAddress(66),
    transitionalTask: null,
    failureReason:
      "the guest agent stopped responding after the storage controller reset, and the VM was not restarted",
    canMigrate: false,
    uptimeSeconds: null,
    createdMinutesAgo: DAY * 60,
    updatedMinutesAgo: DAY * 2,
  },
] satisfies readonly Parameters<typeof vm>[4][];

/* -------------------------------------------------------------------------- */
/* Connections, which Tasks point at                                          */
/* -------------------------------------------------------------------------- */

const connections: EstateConnection[] = [
  connection(clock, {
    name: "proxmox-accra",
    suffix: "01hq2w0001",
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
      // R60: two credentials, not one, and the reason is a property of Proxmox
      // rather than a design preference. Surfacing it is the point.
      {
        kind: "pam_ssh_key",
        label: "PAM SSH key",
        required: true,
        why: "Cloud-init snippets need SFTP and a PAM account. The API token cannot upload them.",
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
      requestId: "req_01hq2prxmox00",
      latencyMs: 41,
    },
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 41,
  }),
  connection(clock, {
    name: "netbird-accra",
    suffix: "01hq2w0002",
    kind: "netbird",
    endpoint: "https://netbird.lan",
    state: "tested",
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
        lastRotatedAt: "2026-08-14T11:22:00.000Z",
      },
    ],
    lastTestMinutesAgo: 38,
    lastTest: {
      ok: true,
      code: null,
      message: "NetBird answered in 22ms.",
      requestId: "req_01hq2netbird0",
      latencyMs: 22,
    },
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 38,
  }),
  // Awkward case: a misconfiguration the console must surface rather than hide.
  // The requirement is met and the credential is held, but the key was rotated
  // out from under it, so the last test failed with a code the console keys off.
  connection(clock, {
    name: "dokploy-accra",
    suffix: "01hq2w0003",
    kind: "dokploy",
    endpoint: "https://dokploy.lan:3000",
    state: "failed",
    requirements: [
      {
        kind: "api_key",
        label: "API key",
        required: true,
        why: "Reading services, deployments, and domains.",
      },
    ],
    credentials: [
      {
        kind: "api_key",
        label: "API key",
        held: true,
        heldSince: "2026-04-11T14:00:00.000Z",
        lastRotatedAt: null,
      },
    ],
    lastTestMinutesAgo: 33,
    lastTest: {
      ok: false,
      code: "upstream_unauthenticated",
      message: "the API key was rejected: 401 from the Dokploy instance",
      requestId: "req_01hq2dokploy0",
      latencyMs: 88,
    },
    createdMinutesAgo: DAY * 160,
    updatedMinutesAgo: 33,
  }),
];

/**
 * What a Task can target, as `{ id, name }`.
 *
 * Derived from the spec lists rather than from built resources, so a Task and
 * the VM it created can each be built from the other without an ordering
 * constraint. The alternative -- build the Task, then the VM, then rebuild the
 * Task -- is two passes and one chance to forget the second.
 */
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

/** The Disks a VM has. Disk is VM storage; Drive is physical. Never swap them. */
const diskPlan: ReadonlyArray<{
  vm: VmName;
  disks: readonly { name: DiskName; suffix: string; sizeBytes: number; cloudInit?: boolean }[];
}> = [
  {
    vm: "netbird",
    disks: [
      { name: "netbird-root", suffix: "01hq2k0001", sizeBytes: 32 * GiB },
      { name: "netbird-conf", suffix: "01hq2k0002", sizeBytes: 8 * GiB },
    ],
  },
  {
    vm: "sovren-cp",
    disks: [
      { name: "sovren-cp-root", suffix: "01hq2k0003", sizeBytes: 64 * GiB },
      { name: "sovren-cp-data", suffix: "01hq2k0004", sizeBytes: 64 * GiB },
      {
        name: "sovren-cp-cloudinit",
        suffix: "01hq2k0005",
        sizeBytes: 4 * 1024 * 1024,
        cloudInit: true,
      },
    ],
  },
  {
    vm: "dokploy-01",
    disks: [{ name: "dokploy-01-root", suffix: "01hq2k0006", sizeBytes: 64 * GiB }],
  },
  {
    vm: "golden",
    disks: [
      { name: "golden-root", suffix: "01hq2k0007", sizeBytes: 32 * GiB },
      {
        name: "golden-cloudinit",
        suffix: "01hq2k0008",
        sizeBytes: 4 * 1024 * 1024,
        cloudInit: true,
      },
    ],
  },
  {
    vm: "golden-tpl",
    disks: [
      { name: "golden-tpl-root", suffix: "01hq2k0009", sizeBytes: 32 * GiB },
      {
        name: "golden-tpl-cloudinit",
        suffix: "01hq2k0010",
        sizeBytes: 4 * 1024 * 1024,
        cloudInit: true,
      },
    ],
  },
  {
    vm: "postgres-main",
    disks: [
      { name: "postgres-main-data", suffix: "01hq2k0011", sizeBytes: 400 * GiB },
      { name: "postgres-main-wal", suffix: "01hq2k0012", sizeBytes: 112 * GiB },
    ],
  },
  {
    vm: "redis-cache",
    disks: [{ name: "redis-cache-root", suffix: "01hq2k0013", sizeBytes: 32 * GiB }],
  },
  {
    vm: "grafana",
    disks: [{ name: "grafana-root", suffix: "01hq2k0014", sizeBytes: 32 * GiB }],
  },
  {
    vm: "paperless",
    disks: [{ name: "paperless-data", suffix: "01hq2k0015", sizeBytes: 64 * GiB }],
  },
  { vm: "immich", disks: [{ name: "immich-data", suffix: "01hq2k0016", sizeBytes: 256 * GiB }] },
  {
    vm: "nextcloud",
    disks: [{ name: "nextcloud-data", suffix: "01hq2k0017", sizeBytes: 512 * GiB }],
  },
  {
    vm: "wireguard-lab",
    disks: [{ name: "wireguard-lab-root", suffix: "01hq2k0018", sizeBytes: 8 * GiB }],
  },
  {
    vm: "grafana-canary",
    disks: [{ name: "grafana-canary-root", suffix: "01hq2k0019", sizeBytes: 32 * GiB }],
  },
  {
    vm: "lab-build-01",
    disks: [{ name: "lab-build-01-root", suffix: "01hq2k0020", sizeBytes: 64 * GiB }],
  },
  {
    vm: "lab-build-02",
    disks: [{ name: "lab-build-02-root", suffix: "01hq2k0021", sizeBytes: 64 * GiB }],
  },
  {
    vm: "k8s-control-01",
    disks: [{ name: "k8s-control-root", suffix: "01hq2k0022", sizeBytes: 64 * GiB }],
  },
  {
    vm: "k8s-worker-01",
    disks: [{ name: "k8s-worker-01-root", suffix: "01hq2k0023", sizeBytes: 64 * GiB }],
  },
  {
    vm: "k8s-worker-02",
    disks: [{ name: "k8s-worker-02-root", suffix: "01hq2k0024", sizeBytes: 64 * GiB }],
  },
  {
    vm: "backup-target",
    disks: [{ name: "backup-target-data", suffix: "01hq2k0025", sizeBytes: 2 * TiB }],
  },
  {
    vm: "takoradi-edge-01",
    disks: [{ name: "takoradi-edge-01-root", suffix: "01hq2k0026", sizeBytes: 32 * GiB }],
  },
  {
    vm: "takoradi-media",
    disks: [{ name: "takoradi-media-data", suffix: "01hq2k0027", sizeBytes: 1 * TiB }],
  },
  {
    vm: "kumasi-web-01",
    disks: [{ name: "kumasi-web-01-root", suffix: "01hq2k0028", sizeBytes: 32 * GiB }],
  },
  {
    vm: "kumasi-web-02",
    disks: [{ name: "kumasi-web-02-root", suffix: "01hq2k0029", sizeBytes: 32 * GiB }],
  },
  {
    vm: "kumasi-db-01",
    disks: [{ name: "kumasi-db-01-root", suffix: "01hq2k0030", sizeBytes: 256 * GiB }],
  },
  {
    vm: "kumasi-cache-01",
    disks: [{ name: "kumasi-cache-01-root", suffix: "01hq2k0031", sizeBytes: 16 * GiB }],
  },
  {
    vm: "legacy-erp",
    disks: [{ name: "legacy-erp-data", suffix: "01hq2k0032", sizeBytes: 128 * GiB }],
  },
  {
    vm: "spare-bench-01",
    disks: [{ name: "spare-bench-01-root", suffix: "01hq2k0033", sizeBytes: 32 * GiB }],
  },
];

const disks = diskPlan.flatMap(({ vm: vmName, disks: plan }) =>
  plan.map((entry) =>
    disk(clock, vmIndex, {
      name: entry.name,
      suffix: entry.suffix,
      vm: vmName,
      sizeBytes: entry.sizeBytes,
      usedBytes: entry.cloudInit === true ? 1_048_576 : Math.round(entry.sizeBytes * 0.42),
      // R62: the cloud-init drive stays attached, or boot hangs with no useful
      // error. It lives on `local`, not `local-lvm`, because it is a snippet.
      storage: entry.cloudInit === true ? "local" : "local-lvm",
      format: entry.cloudInit === true ? "raw" : "qcow2",
      ...(entry.cloudInit === true ? { isCloudInit: true } : {}),
      createdMinutesAgo: DAY * 100,
      updatedMinutesAgo: 40,
    }),
  ),
);

const snapshots: EstateSnapshot[] = linkSnapshots([
  snapshot(clock, vmIndex, {
    name: "postgres-main-pre-upgrade",
    suffix: "01hq2s0001",
    vm: "postgres-main",
    description: "taken before the PostgreSQL upgrade",
    parent: null,
    sizeBytes: 41 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 12,
    updatedMinutesAgo: DAY * 12,
  }),
  snapshot(clock, vmIndex, {
    name: "postgres-main-post-upgrade",
    suffix: "01hq2s0002",
    vm: "postgres-main",
    description: "taken after the PostgreSQL upgrade, verified",
    parent: "postgres-main-pre-upgrade",
    sizeBytes: 42 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 12,
    updatedMinutesAgo: DAY * 12,
  }),
  snapshot(clock, vmIndex, {
    name: "nextcloud-weekly",
    suffix: "01hq2s0003",
    vm: "nextcloud",
    description: "weekly, before the backup window",
    parent: null,
    sizeBytes: 63 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 6,
    updatedMinutesAgo: DAY * 6,
  }),
  snapshot(clock, vmIndex, {
    name: "nextcloud-daily",
    suffix: "01hq2s0004",
    vm: "nextcloud",
    description: "daily, taken by the backup script",
    parent: "nextcloud-weekly",
    sizeBytes: 63 * GiB,
    includesMemory: true,
    createdMinutesAgo: DAY,
    updatedMinutesAgo: DAY,
  }),
  snapshot(clock, vmIndex, {
    name: "grafana-canary-base",
    suffix: "01hq2s0005",
    vm: "grafana-canary",
    description: "the state the canary is restored to",
    parent: null,
    sizeBytes: 3 * GiB,
    includesMemory: false,
    createdMinutesAgo: 8 * 60,
    updatedMinutesAgo: 8 * 60,
  }),
  snapshot(clock, vmIndex, {
    name: "legacy-erp",
    suffix: "01hq2s0006",
    vm: "legacy-erp",
    description: "taken when the estate was first taken over",
    parent: null,
    sizeBytes: 44 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 60,
    updatedMinutesAgo: DAY * 60,
  }),
  snapshot(clock, vmIndex, {
    name: "legacy-erp-pre-migration",
    suffix: "01hq2s0007",
    vm: "legacy-erp",
    description: "taken before the move off accra-desk-01",
    parent: "legacy-erp",
    sizeBytes: 44 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 30,
    updatedMinutesAgo: DAY * 30,
  }),
  snapshot(clock, vmIndex, {
    name: "golden-tpl-base",
    suffix: "01hq2s0008",
    vm: "golden-tpl",
    description: "the template's base state, before any clone",
    parent: null,
    sizeBytes: 3 * GiB,
    includesMemory: false,
    createdMinutesAgo: DAY * 175,
    updatedMinutesAgo: DAY * 175,
  }),
]);

/* -------------------------------------------------------------------------- */
/* Peers                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A peer's id suffix, handed out in order.
 *
 * Written sequentially rather than derived from the peer's name so that two
 * peers cannot be handed the same id by a name collision -- and so that a peer
 * added to the estate gets an id by taking the next number, not by editing a
 * formula that would renumber everything after it.
 */
/**
 * A peer's id suffix, handed out in order.
 *
 * Written sequentially rather than derived from the peer's name so that two
 * peers cannot be handed the same id by a name collision -- and so that a peer
 * added to the estate gets an id by taking the next number, not by editing a
 * formula that would renumber everything after it.
 */
const peerSuffix = (ordinal: number): string => `01hq2p${String(ordinal).padStart(4, "0")}`;

let nodePeerCount = 0;
let vmPeerCount = 0;
let peerOrdinal = 0;

/**
 * The address for a peer with no machine behind it.
 *
 * Handed out one after another rather than derived from a name, so two roster
 * peers cannot collide and a new one takes the next address instead of editing
 * a formula that would renumber everything after it.
 */
const nextRosterAddress = (): ReturnType<typeof overlayAddress> =>
  overlayAddress(240 + peerOrdinal++);

const peers: EstatePeer[] = [
  // A machine's Peer holds *its machine's* address. That is the enrolment: the
  // NetBird agent inside `accra-desk-01` is the same box as the Proxmox Node of
  // that name, deliberately sharing a name and an address, which is what lets an
  // operator type one string and mean both.
  //
  // A peer's group membership follows from what it is: infrastructure is
  // Infrastructure, a guest running a service is a Service Host, a guest handed
  // to an operator is a Lab User. Groups come from the estate's Group list,
  // never from a string typed into the row.
  ...nodes.flatMap((entry) => {
    // A Node that never enrolled has no address, and a peer row is an enrolment
    // record -- so there is no peer for it, and no address to invent one.
    if (entry.overlay === null) return [];
    return entry.peers.map((peerName) => ({
      name: peerName,
      suffix: peerSuffix(1 + nodePeerCount++),
      node: entry.name as NodeName,
      site: entry.siteName,
      overlay: entry.overlay,
      os: "linux" as const,
      groups: (entry.name.includes("server")
        ? ["All", "Infrastructure", "Service Hosts"]
        : ["All", "Infrastructure"]) as readonly GroupName[],
      status: (entry.status === "offline" ? "disconnected" : "connected") as
        | "connected"
        | "disconnected",
      // An offline machine's agent is still enrolled and still holds its address;
      // what it has not done is check in.
      lastSeenMinutesAgo: entry.status === "offline" ? 27 * 60 : 2,
      user: null as string | null,
      createdMinutesAgo: DAY * 200,
      updatedMinutesAgo: 5,
    }));
  }),
  // The same for guests. A VM that has not enrolled has no peer, which is a real
  // case the VM detail page has to survive: a VM with an empty peers tab.
  ...vms.flatMap((entry) => {
    if (entry.overlay === null) return [];
    return [
      {
        name: entry.name as PeerName,
        suffix: peerSuffix(100 + vmPeerCount++),
        node: entry.nodeName,
        site: siteOfNode(entry.nodeName),
        overlay: entry.overlay,
        os: "linux" as const,
        groups: (entry.purpose === "infrastructure"
          ? ["All", "Infrastructure"]
          : entry.purpose === "workload"
            ? ["All", "Lab Users"]
            : ["All", "Service Hosts"]) as readonly GroupName[],
        // A stopped guest is still enrolled and still holds its address. What it
        // has not done is check in, and that is a state distinct from never having
        // enrolled -- which is the difference between a disconnected peer and an
        // absent one.
        status: (entry.runState === "stopped" || entry.runState === "failed"
          ? "disconnected"
          : "connected") as "connected" | "disconnected",
        lastSeenMinutesAgo:
          entry.runState === "stopped" || entry.runState === "failed" ? 3 * DAY : 1,
        user: null as string | null,
        createdMinutesAgo: DAY * 100,
        updatedMinutesAgo: 3,
      },
    ];
  }),
  // Machines that are not the estate's Nodes. A laptop, a phone, a CI runner --
  // real peers with no Node and no Site, and screens that assume otherwise break.
  // Awkward cases: not seen in six days, and blocked, and neither is inferable
  // from the other.
  {
    name: "ops-laptop-sipho",
    suffix: "01hq2p0031",
    node: null,
    site: null,
    overlay: nextRosterAddress(),
    os: "linux",
    groups: ["All", "Operators"],
    status: "stale",
    lastSeenMinutesAgo: DAY * 6,
    user: "sipho",
    isBlocked: false,
    createdMinutesAgo: DAY * 300,
    updatedMinutesAgo: DAY * 6,
  },
  {
    name: "ops-laptop-grace",
    suffix: "01hq2p0032",
    node: null,
    site: null,
    overlay: nextRosterAddress(),
    os: "macos",
    groups: ["All", "Operators"],
    status: "connected",
    lastSeenMinutesAgo: 1,
    user: "grace",
    isBlocked: false,
    createdMinutesAgo: DAY * 280,
    updatedMinutesAgo: 1,
  },
  {
    name: "ci-runner-01",
    suffix: "01hq2p0033",
    node: null,
    site: null,
    overlay: nextRosterAddress(),
    os: "linux",
    groups: ["All", "Build Runners"],
    status: "connected",
    lastSeenMinutesAgo: 2,
    user: "ci",
    isBlocked: false,
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 2,
  },
  {
    name: "ci-runner-02",
    suffix: "01hq2p0034",
    node: null,
    site: null,
    overlay: nextRosterAddress(),
    os: "linux",
    groups: ["All", "Build Runners"],
    status: "disconnected",
    lastSeenMinutesAgo: 9 * 60,
    user: "ci",
    isBlocked: false,
    createdMinutesAgo: DAY * 200,
    updatedMinutesAgo: 9 * 60,
  },
  {
    name: "phone-sipho",
    suffix: "01hq2p0035",
    node: null,
    site: null,
    overlay: nextRosterAddress(),
    os: "android",
    groups: ["All", "Operators"],
    status: "stale",
    lastSeenMinutesAgo: DAY * 3,
    user: "sipho",
    isBlocked: true,
    createdMinutesAgo: DAY * 120,
    updatedMinutesAgo: DAY * 3,
  },
].map((spec) => peer(clock, sites, groupIndex, nodeIndex, spec as Parameters<typeof peer>[4]));

/* -------------------------------------------------------------------------- */
/* The estate                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A disabled action, and the sovren code holding it back.
 *
 * R43: a disabled action explains itself. `reason` is a code from the vocabulary,
 * so the console renders the same sentence a failure would produce and a test can
 * assert the reason without matching a sentence.
 */
export const fleet: Estate = buildEstate({
  name: "fleet",
  description:
    "The whole estate: three Sites of retired university desktops, twenty Nodes, twenty-seven VMs, and the peers enrolled on the overlay.",
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
          "Live migration is not offered across heterogeneous CPUs, and this Node's CPU is below the fleet floor.",
      },
    ],
    "node:takoradi-nas-01": [
      {
        action: "migrate",
        reason: "action_not_permitted",
        explanation:
          "The CPU is below the fleet floor, and the machine is not on the overlay, so it cannot be a migration target.",
      },
    ],
    "vm:legacy-erp": [
      {
        action: "start",
        reason: "action_not_permitted",
        explanation:
          "The guest agent is not answering. Start it through the Proxmox console until the agent reports in.",
      },
      {
        action: "migrate",
        reason: "action_not_permitted",
        explanation:
          "The host Node's CPU is below the fleet floor, so this VM cannot be migrated anywhere in the estate.",
      },
    ],
    "vm:grafana-canary": [
      {
        action: "stop",
        reason: "action_not_permitted",
        explanation:
          "Its create Task is still running. Wait for it to finish, or cancel the Task first.",
      },
    ],
    "task:restore-grafana-canary": [
      {
        action: "cancel",
        reason: "action_not_permitted",
        explanation:
          "The Task is queued and has not been claimed by a provisioner, so there is no process to signal.",
      },
    ],
    "task:create-netbird": [
      {
        action: "cancel",
        reason: "action_not_permitted",
        explanation: "The Task reached a terminal state, so there is no process to signal.",
      },
    ],
  },
});
