/**
 * Estate row in, contract row out.
 *
 * The estate carries a few fields the API does not have -- `EstateNode.vms`
 * says which VMs a Node hosts, `EstateTask.logs` carries the lines -- because
 * the consistency check needs the back-references. Those fields must not reach
 * the wire: the console's validators are generated from the document, and a
 * response carrying fields the document does not declare is a response whose
 * shape nobody has agreed on. It would also mean the console could read a field
 * that the real control plane will never send, and would then break in
 * production on a screen that works perfectly against the mock.
 *
 * So every row crosses this boundary explicitly. The projection is the join the
 * real control plane would do, written out once per resource, and it is the only
 * place an estate row becomes a response body.
 */

import { estateFor, ESTATE_PARAM } from "../estate/registry";
import type {
  Connection,
  DisabledAction,
  Disk,
  Drive,
  Node,
  Peer,
  Snapshot,
  Task,
  Vm,
} from "@sovren/client";

import type {
  Estate,
  EstateConnection,
  EstateDisk,
  EstateDrive,
  EstateNode,
  EstatePeer,
  EstateSnapshot,
  EstateTask,
  EstateVm,
} from "../estate/types";

/**
 * Strip the estate's back-references. The Node the document declares.
 *
 * `refusals` is the estate's declaration for *this* subject, keyed
 * `<kind>:<name>`. It is passed in rather than looked up, because a projection
 * that reached for a module-level estate would be a hidden global -- and because
 * a projection that silently dropped the refusals would make the document's
 * `disabledActions` field unreachable from every screen, which is exactly the
 * dead code two of them reported independently.
 */
export const toNode = (row: EstateNode, refusals: readonly DisabledAction[] = []): Node => ({
  id: row.id,
  name: row.name,
  site: row.site,
  status: row.status,
  cpuModel: row.cpuModel,
  cores: row.cores,
  sockets: row.sockets,
  memoryBytes: row.memoryBytes,
  maxMemoryBytes: row.maxMemoryBytes,
  driveCount: row.driveCount,
  driveBytes: row.driveBytes,
  overlay: row.overlay,
  vmCount: row.vmCount,
  uptimeSeconds: row.uptimeSeconds,
  proxmoxVersion: row.proxmoxVersion,
  canMigrate: row.canMigrate,
  disabledActions: [...refusals],
  created: row.created,
  updated: row.updated,
});

/** Strip the estate's Node back-reference. The Drive the document declares. */
export const toDrive = (row: EstateDrive): Drive => ({
  id: row.id,
  name: row.name,
  nodeId: row.nodeId,
  type: row.type,
  sizeBytes: row.sizeBytes,
  usedBytes: row.usedBytes,
  health: row.health,
  pveDevice: row.pveDevice,
  created: row.created,
  updated: row.updated,
});

/** The Peer is already the document's shape. */
export const toPeer = (row: EstatePeer): Peer => ({
  id: row.id,
  name: row.name,
  overlay: row.overlay,
  os: row.os,
  groups: row.groups,
  status: row.status,
  lastSeen: row.lastSeen,
  node: row.node,
  site: row.site,
  user: row.user,
  ...(row.isBlocked === undefined ? {} : { isBlocked: row.isBlocked }),
  created: row.created,
  updated: row.updated,
});

/**
 * Strip the estate's name-keyed children and Task.
 *
 * The `transitionalTask` link stays, because the document declares it and it is
 * how a screen knows which Task to watch. Only the estate's `transitionalTaskName`
 * -- the same fact, held by name for the consistency check -- is dropped.
 */
export const toVm = (row: EstateVm, refusals: readonly DisabledAction[] = []): Vm => ({
  id: row.id,
  name: row.name,
  node: row.node,
  site: row.site,
  purpose: row.purpose,
  cpuModel: row.cpuModel,
  cores: row.cores,
  memoryBytes: row.memoryBytes,
  diskBytes: row.diskBytes,
  runState: row.runState,
  overlay: row.overlay,
  transitionalTask: row.transitionalTask,
  failureReason: row.failureReason,
  canMigrate: row.canMigrate,
  disabledActions: [...refusals],
  uptimeSeconds: row.uptimeSeconds,
  ...(row.isTemplate === undefined ? {} : { isTemplate: row.isTemplate }),
  ...(row.tags === undefined ? {} : { tags: row.tags }),
  created: row.created,
  updated: row.updated,
});

/** Strip the estate's VM back-reference. */
export const toDisk = (row: EstateDisk): Disk => ({
  id: row.id,
  name: row.name,
  vmId: row.vmId,
  sizeBytes: row.sizeBytes,
  usedBytes: row.usedBytes,
  storage: row.storage,
  format: row.format,
  ...(row.isCloudInit === undefined ? {} : { isCloudInit: row.isCloudInit }),
  created: row.created,
  updated: row.updated,
});

export const toSnapshot = (row: EstateSnapshot): Snapshot => ({
  id: row.id,
  name: row.name,
  vmId: row.vmId,
  description: row.description,
  parentSnapshotId: row.parentSnapshotId,
  sizeBytes: row.sizeBytes,
  includesMemory: row.includesMemory,
  created: row.created,
  updated: row.updated,
});

/**
 * Strip the estate's log lines.
 *
 * The document puts logs behind their own operation, `TaskLogStream`, and the
 * Task carries only `logCount` and `lastSeq`. A Task row carrying its whole log
 * would make the stream pointless and would put an unbounded array in a list
 * response -- twenty Tasks with fifty lines each is a payload nobody asked for.
 */
export const toTask = (row: EstateTask): Task => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  target: row.target,
  state: row.state,
  terminalState: row.terminalState,
  failureReason: row.failureReason,
  cancelledReason: row.cancelledReason,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  lastSeq: row.lastSeq,
  logCount: row.logCount,
  created: row.created,
  updated: row.updated,
});

/** The Connection is already the document's shape. */
export const toConnection = (row: EstateConnection): Connection => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  endpoint: row.endpoint,
  state: row.state,
  requirements: row.requirements,
  credentials: row.credentials,
  lastTest: row.lastTest,
  created: row.created,
  updated: row.updated,
});

/**
 * The log events for a Task, resumed from a `Last-Event-ID`.
 *
 * R49: logs are held by the control plane and streamed, and the event's `seq` is
 * the SSE event id, so a reconnect resumes from `Last-Event-ID` without losing a
 * line or replaying one. A Task that has already finished replays its whole log
 * from the beginning -- which is the behaviour that makes a task detail page
 * useful after the fact rather than only while someone is watching.
 */
export const logsFrom = (row: EstateTask, lastEventId: string | null): EstateTask["logs"] => {
  if (lastEventId === null) return row.logs;
  const from = Number.parseInt(lastEventId, 10);
  if (Number.isNaN(from)) return row.logs;
  return row.logs.filter((line) => line.seq > from);
};

/* -------------------------------------------------------------------------- */
/* NameOrId                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a path parameter, which accepts a name or an id.
 *
 * R32: both work in every path, always. It is a small thing and it is the reason
 * a link to a renamed resource does not break, so it is applied to every View
 * operation rather than to the ones where it was remembered.
 */
export const resolve = <T extends { readonly id: string; readonly name: string }>(
  rows: readonly T[],
  ref: string,
): T | undefined => rows.find((row) => row.name === ref || row.id === ref);

/** The rows of one estate that answer to a ref, as a discriminated result. */
export type Lookup<T> =
  | { readonly ok: true; readonly row: T }
  | { readonly ok: false; readonly ref: string };

export const lookup = <T extends { readonly id: string; readonly name: string }>(
  rows: readonly T[],
  ref: string,
): Lookup<T> => {
  const row = resolve(rows, ref);
  return row === undefined ? { ok: false, ref } : { ok: true, row };
};

/** The estate a URL asks for. `?estate=compact` picks the small one. */
export const estateOf = (url: URL): Estate => estateFor(url.searchParams.get(ESTATE_PARAM));
