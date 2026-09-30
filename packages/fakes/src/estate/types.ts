/**
 * The shape of the estate description.
 *
 * This is the type of the one value that seeds every mock. R54: a world builder
 * seeds all the fakes from one description, so fixtures cannot disagree with one
 * another.
 *
 * **The rows are the generated model types, unchanged, plus a few name-keyed
 * fields the API does not carry.** Two consequences, both deliberate:
 *
 *  - The estate cannot drift from the document. Re-declaring `Node` here would
 *    be a second copy of the contract, and this is exactly where a second copy
 *    does the most damage: it would type-check against a document that no longer
 *    exists.
 *  - Every resource body is *resolved* -- a VM carries a `NodeLink`, a Peer
 *    carries a `Site` -- so the mock backend hands a row to a generated handler
 *    without a join step that could disagree with the one the console would do.
 *
 * The cross-references that make disagreement possible are carried alongside, by
 * name, in fields the API does not have: `EstateNode.vms` says which VMs a Node
 * hosts, `EstateDrive.node` says which Node a Drive is in. The names are literal
 * unions (`NodeName`, `VmName`), so a typo is a compile error, and a name that
 * compiles but resolves to nothing throws in the builder. The consistency check
 * then verifies the two directions agree -- that a VM's `node.id` names a Node
 * whose `vms` list contains the VM -- which is the part neither the compiler nor
 * a builder can see.
 */

import type {
  Connection,
  ConnectionState,
  Disk,
  Drive,
  DriveHealth,
  DriveType,
  ErrorCode,
  Group,
  Node,
  NodeStatus,
  OverlayAddress,
  Peer,
  PeerStatus,
  Site,
  Snapshot,
  Task,
  TaskKind,
  TaskLogEvent,
  TaskState,
  TaskTargetResource,
  Vm,
  VMPurpose,
  VMRunState,
} from "@sovren/client";

import type { DisabledActionReason } from "./identifiers";

/** A Site's name, as a literal union of the sites in one estate. */
export type SiteName = "accra-lab" | "kumasi-store" | "takoradi-annex";

/** A Node's name. A union, so naming a Node that is not in the estate is a type error. */
export type NodeName =
  | "accra-desk-01"
  | "accra-desk-02"
  | "accra-desk-03"
  | "accra-rig-01"
  | "accra-rig-02"
  | "accra-server-01"
  | "accra-server-02"
  | "accra-laptop-01"
  | "kumasi-desk-01"
  | "kumasi-desk-02"
  | "kumasi-desk-03"
  | "kumasi-desk-04"
  | "kumasi-rig-01"
  | "kumasi-server-01"
  | "takoradi-desk-01"
  | "takoradi-desk-02"
  | "takoradi-rig-01"
  | "takoradi-server-01"
  | "takoradi-nas-01";

/** A VM's name. */
export type VmName =
  | "netbird"
  | "sovren-cp"
  | "dokploy-01"
  | "golden"
  | "golden-tpl"
  | "postgres-main"
  | "redis-cache"
  | "grafana"
  | "paperless"
  | "immich"
  | "nextcloud"
  | "wireguard-lab"
  | "grafana-canary"
  | "lab-build-01"
  | "lab-build-02"
  | "k8s-control-01"
  | "k8s-worker-01"
  | "k8s-worker-02"
  | "backup-target"
  | "takoradi-edge-01"
  | "takoradi-media"
  | "kumasi-web-01"
  | "kumasi-web-02"
  | "kumasi-db-01"
  | "kumasi-cache-01"
  | "legacy-erp"
  | "spare-bench-01";

/** A Task's name. */
export type TaskName =
  | "create-netbird"
  | "create-sovren-cp"
  | "create-dokploy-01"
  | "create-golden"
  | "create-golden-tpl"
  | "create-grafana-canary"
  | "create-k8s-control-01"
  | "create-kumasi-db-01"
  | "create-backup-target"
  | "create-paperless"
  | "create-immich"
  | "create-redis-cache"
  | "create-postgres-main"
  | "create-grafana"
  | "create-nextcloud"
  | "create-k8s-worker-01"
  | "create-k8s-worker-02"
  | "create-lab-build-01"
  | "create-lab-build-02"
  | "create-wireguard-lab"
  | "create-spare-bench-01"
  | "create-kumasi-web-01"
  | "create-kumasi-web-02"
  | "create-kumasi-cache-01"
  | "create-takoradi-edge-01"
  | "create-takoradi-media"
  | "snapshot-postgres-main-pre-upgrade"
  | "snapshot-postgres-main-post-upgrade"
  | "snapshot-nextcloud-weekly"
  | "snapshot-nextcloud-daily"
  | "snapshot-grafana-canary-base"
  | "snapshot-sovren-cp-base"
  | "snapshot-legacy-erp"
  | "snapshot-legacy-erp-pre-migration"
  | "restore-grafana-canary"
  | "terraform-accra"
  | "terraform-kumasi"
  | "terraform-takoradi"
  | "ansible-bootstrap-accra"
  | "ansible-bootstrap-kumasi"
  | "ansible-converge-all"
  | "test-connection-proxmox"
  | "test-connection-netbird"
  | "test-connection-dokploy";

/** A Drive's name. */
export type DriveName =
  | "accra-desk-01-sda"
  | "accra-desk-01-sdb"
  | "accra-desk-02-sda"
  | "accra-desk-03-sda"
  | "accra-rig-01-nvme0"
  | "accra-rig-02-nvme0"
  | "accra-server-01-sda"
  | "accra-server-01-sdb"
  | "accra-server-02-nvme0"
  | "accra-server-02-nvme1"
  | "accra-laptop-01-nvme0"
  | "kumasi-desk-01-sda"
  | "kumasi-desk-02-sda"
  | "kumasi-desk-03-sda"
  | "kumasi-desk-04-sda"
  | "kumasi-rig-01-nvme0"
  | "kumasi-server-01-sda"
  | "kumasi-server-01-sdb"
  | "takoradi-desk-01-sda"
  | "takoradi-desk-02-sda"
  | "takoradi-rig-01-nvme0"
  | "takoradi-server-01-nvme0"
  | "takoradi-server-01-sdb"
  | "takoradi-nas-01-sda"
  | "takoradi-nas-01-sdb"
  | "takoradi-nas-01-sdc"
  | "takoradi-nas-01-sdd";

/** A Connection's name. */
export type ConnectionName = "proxmox-accra" | "netbird-accra" | "dokploy-accra";

/** A Peer's name. */
export type PeerName =
  | "accra-desk-01"
  | "accra-desk-02"
  | "accra-desk-03"
  | "accra-rig-01"
  | "accra-rig-02"
  | "accra-server-01"
  | "accra-server-02"
  | "accra-laptop-01"
  | "kumasi-desk-01"
  | "kumasi-desk-02"
  | "kumasi-desk-03"
  | "kumasi-desk-04"
  | "kumasi-rig-01"
  | "kumasi-server-01"
  | "takoradi-desk-01"
  | "takoradi-desk-02"
  | "takoradi-rig-01"
  | "takoradi-server-01"
  | "takoradi-nas-01"
  | "netbird"
  | "sovren-cp"
  | "dokploy-01"
  | "golden"
  | "golden-tpl"
  | "postgres-main"
  | "redis-cache"
  | "grafana"
  | "paperless"
  | "immich"
  | "nextcloud"
  | "wireguard-lab"
  | "grafana-canary"
  | "lab-build-01"
  | "lab-build-02"
  | "k8s-control-01"
  | "k8s-worker-01"
  | "k8s-worker-02"
  | "backup-target"
  | "takoradi-edge-01"
  | "takoradi-media"
  | "kumasi-web-01"
  | "kumasi-web-02"
  | "kumasi-db-01"
  | "kumasi-cache-01"
  | "legacy-erp"
  | "spare-bench-01"
  | "ops-laptop-sipho"
  | "ops-laptop-grace"
  | "ci-runner-01"
  | "ci-runner-02"
  | "phone-sipho";

/** A NetBird Group's name. */
export type GroupName =
  | "All"
  | "Infrastructure"
  | "Service Hosts"
  | "Operators"
  | "Lab Users"
  | "Build Runners";

/** A Disk's name. */
export type DiskName =
  | "netbird-root"
  | "netbird-conf"
  | "sovren-cp-root"
  | "sovren-cp-data"
  | "sovren-cp-cloudinit"
  | "dokploy-01-root"
  | "golden-root"
  | "golden-cloudinit"
  | "golden-tpl-root"
  | "golden-tpl-cloudinit"
  | "postgres-main-data"
  | "postgres-main-wal"
  | "redis-cache-root"
  | "grafana-root"
  | "paperless-data"
  | "immich-data"
  | "nextcloud-data"
  | "wireguard-lab-root"
  | "grafana-canary-root"
  | "lab-build-01-root"
  | "lab-build-02-root"
  | "k8s-control-root"
  | "k8s-worker-01-root"
  | "k8s-worker-02-root"
  | "backup-target-data"
  | "takoradi-edge-01-root"
  | "takoradi-media-data"
  | "kumasi-web-01-root"
  | "kumasi-web-02-root"
  | "kumasi-db-01-root"
  | "kumasi-cache-01-root"
  | "legacy-erp-data"
  | "spare-bench-01-root"
  | "sovren-cp-base-snap";

/** A Snapshot's name. */
export type SnapshotName =
  | "postgres-main-pre-upgrade"
  | "postgres-main-post-upgrade"
  | "nextcloud-weekly"
  | "nextcloud-daily"
  | "grafana-canary-base"
  | "legacy-erp"
  | "legacy-erp-pre-migration"
  | "golden-tpl-base"
  | "sovren-cp-base";

/**
 * A Node: the generated `Node`, plus the three lists the API does not carry and
 * the consistency check needs.
 *
 * `drives`, `vms`, and `peers` are by name. `driveCount` and `vmCount` are
 * written by hand rather than derived, precisely so the check that they agree
 * with these lists is asserting something.
 *
 * The three lists are typed as plain strings here, not as the name unions, and
 * that is deliberate. The union is enforced where it does the work -- on
 * `NodeSpec`, which the estate file is checked against -- so a typo in a Node's
 * VM list is a compile error at the line that wrote it. The stored form does not
 * need to carry the union as well, and holding it would mean a `Vm.name` from the
 * document (`string`) and a `VmName` from the estate had to be reconciled at every
 * comparison for no extra safety.
 */
export interface EstateNode extends Node {
  siteName: SiteName;
  drives: readonly DriveName[];
  vms: readonly string[];
  peers: readonly string[];
}

/** A Peer: the generated `Peer`, fully resolved. Nothing extra to check. */
export type EstatePeer = Peer & { readonly lastSeenMinutesAgo: number };

/** A VM: the generated `Vm`, plus the name-keyed children and Task behind it. */
export interface EstateVm extends Vm {
  nodeName: NodeName;
  transitionalTaskName: TaskName | null;
  disks: readonly DiskName[];
  snapshots: readonly SnapshotName[];
}

/** A Drive: the generated `Drive`, plus the Node it belongs to, by name. */
export interface EstateDrive extends Drive {
  nodeName: NodeName;
}

/** A Disk: the generated `Disk`, plus the VM it belongs to, by name. */
export interface EstateDisk extends Disk {
  vmName: VmName;
}

/** A Snapshot: the generated `Snapshot`, plus its VM and parent, by name. */
export interface EstateSnapshot extends Snapshot {
  vmName: VmName;
  parentName: SnapshotName | null;
}

/** A Task: the generated `Task`, plus what it targets and the lines it emitted. */
export interface EstateTask extends Task {
  targetResource: TaskTargetResource;
  /** The name of the thing it targets. The id lives on the generated `target`. */
  targetName: NodeName | VmName | ConnectionName | SiteName;
  logs: readonly TaskLogEvent[];
}

/** A Connection: the generated `Connection`. Nothing extra. */
export type EstateConnection = Connection;

/**
 * Why an action is not offered for a resource, keyed by action.
 *
 * R43: a disabled action explains itself rather than disappearing. The reason is
 * a sovren code, not a sentence -- the console keys off `reason` and supplies the
 * wording, so a disabled control and a failed request speak one vocabulary.
 */
export interface DisabledAction {
  action: string;
  reason: DisabledActionReason;
  /** One clause on why, for the operator. The code is what the console keys off. */
  explanation: string;
}

/**
 * The one value.
 *
 * Everything the mocks serve derives from this and nothing else. A fixture
 * identifier written anywhere else is a bug the consistency test exists to
 * catch, which is why the two estates in this package are the only place an `nd_`
 * appears.
 */
export interface Estate {
  /** Selectable at runtime, so an operator can reproduce a screen without touching a test. */
  readonly name: string;
  readonly description: string;
  /** The CPU model every VM is floored to. R63. The constraint, not the average. */
  readonly cpuFloor: string;
  /** A fixed instant every relative date is measured from, so nothing drifts with the wall clock. */
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
  /** Keyed `"<kind>:<name>"` -- `"node:accra-desk-01"`, `"vm:legacy-erp"`. */
  readonly disabledActions: Readonly<Record<string, readonly DisabledAction[]>>;
}

/** Re-exported so a consumer of the estate need not reach into the client for these. */
export type {
  Connection,
  ConnectionState,
  Disk,
  DriveHealth,
  DriveType,
  ErrorCode,
  Group,
  Node,
  NodeStatus,
  OverlayAddress,
  Peer,
  PeerStatus,
  Site,
  Snapshot,
  Task,
  TaskKind,
  TaskLogEvent,
  TaskState,
  TaskTargetResource,
  Vm,
  VMPurpose,
  VMRunState,
};
