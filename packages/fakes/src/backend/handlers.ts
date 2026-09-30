/**
 * The mock backend: the generated handlers, fed by one estate.
 *
 * **Every operation the document declares is served by the handler orval
 * generated for it.** The generated handler owns the method, the path, the
 * status, and the JSON serialisation. The estate supplies the body, and nothing
 * else. There is no hand-written endpoint in this file -- where a path appears it
 * is inside a `*MockHandler` call, and the refusal handlers take their method and
 * path off those same generated handlers (see `guard.ts`).
 *
 * That is the property the whole chain exists for: the mocks cannot drift from
 * the client, because both come from the same document and the only thing anyone
 * here writes is data. A document change that adds an operation fails the build
 * until somebody decides what it returns, rather than silently 404ing in the dev
 * server.
 *
 * **Two controls, both read from the URL, both identical in the dev server and in
 * a test** (R54, R56):
 *
 *     /nodes                        the default estate
 *     /nodes?estate=compact         the small one, for a narrow screen
 *     /nodes?sentinel=conflict      a failure the operator asked for
 *     /nodes/~upstream-unavailable  the same thing, as a path value
 *
 * Neither is a header and neither is an environment variable, because a header is
 * invisible in a screenshot of the bug being reproduced and an environment
 * variable does not exist in a test.
 *
 * **Order is load-bearing.** Every operation contributes a *pair*: the refusal
 * guard first, then the generated handler. MSW takes the first handler that
 * produces a response, and a guard with nothing to say returns `undefined`, so a
 * normal request is served by the generated handler and only by it.
 */

import { HttpResponse, type HttpHandler } from "msw";
import type {
  ConnectionState,
  ConnectionTestResult,
  ErrorCode,
  PeerStatus,
  TaskKind,
  TaskState,
  VMPurpose,
  VMRunState,
  VMCreateRequest,
  VMUpdateRequest,
} from "@sovren/client";

// The generated handlers. One per operation the document declares.
//
// Imported by relative path rather than through `@sovren/client`, because that
// package's `exports` map exposes `.` and `./generated` and neither re-exports
// the `*.msw` modules. These are still the generated artefacts -- the same files
// orval writes, read at the path orval wrote them -- and if they move, the build
// fails here rather than quietly losing the generated handlers. Widening
// `packages/client`'s exports to include them is the tidier fix, and is recorded
// as a note for whoever owns that package.
import {
  getConnectionListMockHandler,
  getConnectionTestMockHandler,
  getConnectionViewMockHandler,
} from "../../../client/src/generated/connection/connection.msw";
import { getDiskListMockHandler } from "../../../client/src/generated/disk/disk.msw";
import {
  getDriveListMockHandler,
  getDriveViewMockHandler,
} from "../../../client/src/generated/drive/drive.msw";
import {
  getNodeListMockHandler,
  getNodeViewMockHandler,
} from "../../../client/src/generated/node/node.msw";
import {
  getPeerListMockHandler,
  getPeerViewMockHandler,
} from "../../../client/src/generated/peer/peer.msw";
import { getSnapshotListMockHandler } from "../../../client/src/generated/snapshot/snapshot.msw";
import {
  getTaskCancelMockHandler,
  getTaskListMockHandler,
  getTaskLogStreamMockHandler,
  getTaskViewMockHandler,
} from "../../../client/src/generated/task/task.msw";
import {
  getVMCreateMockHandler,
  getVMListMockHandler,
  getVMUpdateMockHandler,
  getVMViewMockHandler,
} from "../../../client/src/generated/vm/vm.msw";

import { auditLog } from "../errors/audit-log";
import { SENTINEL_PARAM } from "../errors/sentinels";
import { mintRequestId } from "../errors/vocabulary";
import { ESTATE_PARAM } from "../estate/registry";
import type { Estate, EstateTask, EstateVm } from "../estate/types";
import {
  enumListParam,
  enumParam,
  failure,
  guard,
  param,
  recordSuccess,
  refOf,
  sentinelResponse,
  type ResolverInfo,
} from "./guard";
import { fingerprint, paginate, readSize } from "./pagination";
import {
  estateOf,
  lookup,
  logsFrom,
  toConnection,
  toDisk,
  toDrive,
  toNode,
  toPeer,
  toSnapshot,
  toTask,
  toVm,
  type Lookup,
} from "./projections";

/* -------------------------------------------------------------------------- */
/* Reading a request                                                          */
/* -------------------------------------------------------------------------- */

const PURPOSES = ["infrastructure", "service", "workload"] as const;
const RUN_STATES = ["transitional", "running", "stopped", "paused", "suspended", "failed"] as const;
const PEER_STATUSES = ["connected", "stale", "disconnected", "unknown"] as const;
const TASK_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
const TASK_KINDS = [
  "vm_create",
  "vm_snapshot",
  "vm_restore",
  "terraform_apply",
  "ansible_run",
  "connection_test",
] as const;

/**
 * Everything a request can be asked about, read once.
 *
 * Read in one place so the filters and the page token agree. Two handlers reading
 * `?site=` differently is how a list page and its pagination bar end up describing
 * different lists.
 */
const read = (request: Request) => {
  const url = new URL(request.url);
  return {
    url,
    estate: estateOf(url),
    site: param(request, "site"),
    q: param(request, "q"),
    node: param(request, "node"),
    group: param(request, "group"),
    purpose: enumListParam<VMPurpose>(request, "purpose", PURPOSES),
    runState: enumParam<VMRunState>(request, "runState", RUN_STATES),
    peerStatus: enumParam<PeerStatus>(request, "status", PEER_STATUSES),
    taskState: enumParam<TaskState>(request, "state", TASK_STATES),
    taskKind: enumParam<TaskKind>(request, "kind", TASK_KINDS),
    target: param(request, "target"),
    page: param(request, "page"),
    size: readSize(param(request, "size")),
  };
};

/**
 * A fingerprint of the query minus the parameters that do not change the rows.
 *
 * `page` and `size` are excluded so a token survives a change of page size, and
 * `estate` and `sentinel` are excluded because neither changes which rows the
 * list contains. What remains is exactly "which list is this", which is the only
 * thing a page token has to mean.
 */
const markOf = (url: URL): string =>
  fingerprint(
    Object.fromEntries(
      [...url.searchParams.entries()].filter(
        ([key]) => !["page", "size", ESTATE_PARAM, SENTINEL_PARAM].includes(key),
      ),
    ),
  );

const contains = (haystack: string, needle: string | null): boolean =>
  needle === null || haystack.toLowerCase().includes(needle.toLowerCase());

/** Turn a failed lookup into the shape `viewGuard` wants, with a subject noun. */
const withSubject = <T>(found: Lookup<T>, subject: string) =>
  found.ok ? found : { ok: false as const, ref: found.ref, subject };

/**
 * The pair for a list: the guard, then the generated handler.
 *
 * A list cannot fail on a ref, since there is no ref in one, so a sentinel is the
 * whole of what can go wrong before the estate is consulted.
 */
const listGuard = (operation: string, generated: HttpHandler): HttpHandler[] => [
  guard(generated, (info) => sentinelResponse(info.request, operation)),
  generated,
];

/**
 * The pair for a view: the guard, then the generated handler.
 *
 * R32 says every path parameter accepts a name or an id, so the refusal has to
 * come from a lookup that tried both. A guard that only knew names would 404
 * every link by id; one that only knew ids would 404 every link an operator typed.
 */
const viewGuard = <T>(
  operation: string,
  generated: HttpHandler,
  subject: string,
  find: (info: ResolverInfo) => Lookup<T>,
): HttpHandler[] => [
  guard(generated, (info) => {
    const staged = sentinelResponse(info.request, operation);
    if (staged !== undefined) return staged;
    const found = find(info);
    if (found.ok) return undefined;
    return notFound(info.request, operation, subject, found.ref);
  }),
  generated,
];

const notFound = (request: Request, operation: string, subject: string, ref: string): Response =>
  failure(request, operation, "not_found", `No ${subject} answers to ${ref}.`, [
    {
      path: "ref",
      constraint: "notFound",
      message: `No ${subject} is named or identified by ${ref}.`,
    },
  ]);

/**
 * Thrown by a generated handler's body when a guard should have caught it.
 *
 * The guards run first and answer every failure, so a body never sees a ref that
 * does not resolve. This exists so a gap in a guard is a loud crash in a test
 * rather than a 200 carrying `undefined` -- a screen rendering "undefined" is the
 * symptom this whole layer exists to prevent.
 */
class UnreachableGuard extends Error {
  constructor() {
    super("A guard should have answered this request before the generated handler ran.");
  }
}

/* -------------------------------------------------------------------------- */
/* The operations                                                             */
/* -------------------------------------------------------------------------- */

/** Every handler the mock backend serves, guards first within each pair. */
export const sovrenHandlers = (): HttpHandler[] => [
  /* ---- Node: a physical machine. Heterogeneity is the normal case. ---- */
  ...listGuard(
    "NodeList",
    getNodeListMockHandler((info) => {
      const { estate, site, q, page, size, url } = read(info.request);
      recordSuccess(info.request, "NodeList", 200);
      const rows = estate.nodes.filter(
        (row) => (site === null || row.site.name === site) && contains(row.name, q),
      );
      const cut = paginate(rows, { page, size }, markOf(url));
      return {
        items: cut.items.map((row) => toNode(row, disabledActionsFor(estate, "node", row.name))),
        nextPage: cut.nextPage,
      } as never;
    }),
  ),

  ...viewGuard(
    "NodeView",
    getNodeViewMockHandler((info) => {
      const { estate } = read(info.request);
      const found = lookup(estate.nodes, refOf(info, "node"));
      if (!found.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "NodeView", 200);
      return toNode(found.row, disabledActionsFor(estate, "node", found.row.name)) as never;
    }),
    "Node",
    (info) => lookup(read(info.request).estate.nodes, refOf(info, "node")),
  ),

  /* ---- Drive: physical storage on a Node. Disk is VM storage; never swap them. ---- */
  ...listGuard(
    "DriveList",
    getDriveListMockHandler((info) => {
      const { estate, page, size, url } = read(info.request);
      const host = lookup(estate.nodes, refOf(info, "node"));
      if (!host.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "DriveList", 200);
      const rows = estate.drives.filter((row) => row.nodeId === host.row.id);
      const cut = paginate(rows, { page, size }, markOf(url));
      return { items: cut.items.map(toDrive), nextPage: cut.nextPage } as never;
    }),
  ),

  ...viewGuard(
    "DriveView",
    getDriveViewMockHandler((info) => {
      const { estate } = read(info.request);
      const host = lookup(estate.nodes, refOf(info, "node"));
      if (!host.ok) throw new UnreachableGuard();
      const found = lookup(
        estate.drives.filter((row) => row.nodeId === host.row.id),
        refOf(info, "drive"),
      );
      if (!found.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "DriveView", 200);
      return toDrive(found.row) as never;
    }),
    "Drive",
    (info) => {
      const { estate } = read(info.request);
      const host = lookup(estate.nodes, refOf(info, "node"));
      if (!host.ok) return withSubject(host, "Node");
      return withSubject(
        lookup(
          estate.drives.filter((row) => row.nodeId === host.row.id),
          refOf(info, "drive"),
        ),
        "Drive",
      );
    },
  ),

  /* ---- Peer: an enrolled machine. A laptop is a peer; a Node is not required. ---- */
  ...listGuard(
    "PeerList",
    getPeerListMockHandler((info) => {
      const { estate, site, node, group, peerStatus, q, page, size, url } = read(info.request);
      recordSuccess(info.request, "PeerList", 200);
      const rows = estate.peers.filter(
        (row) =>
          (site === null || (row.site !== null && row.site.name === site)) &&
          (node === null || row.node?.name === node || row.node?.id === node) &&
          (group === null || row.groups.some((entry) => entry.name === group)) &&
          (peerStatus === null || row.status === peerStatus) &&
          contains(row.name, q),
      );
      const cut = paginate(rows, { page, size }, markOf(url));
      return { items: cut.items.map(toPeer), nextPage: cut.nextPage } as never;
    }),
  ),

  ...viewGuard(
    "PeerView",
    getPeerViewMockHandler((info) => {
      const found = lookup(read(info.request).estate.peers, refOf(info, "peer"));
      if (!found.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "PeerView", 200);
      return toPeer(found.row) as never;
    }),
    "Peer",
    (info) => lookup(read(info.request).estate.peers, refOf(info, "peer")),
  ),

  /* ---- VM: a guest, and a first-class offering in its own right. ---- */
  ...listGuard(
    "VMList",
    getVMListMockHandler((info) => {
      const { estate, site, node, purpose, runState, q, page, size, url } = read(info.request);
      recordSuccess(info.request, "VMList", 200);
      const rows = estate.vms.filter(
        (row) =>
          (site === null || row.site.name === site) &&
          (node === null || row.node.name === node || row.node.id === node) &&
          (purpose === null || purpose.includes(row.purpose)) &&
          (runState === null || row.runState === runState) &&
          contains(row.name, q),
      );
      const cut = paginate(rows, { page, size }, markOf(url));
      return {
        items: cut.items.map((row) => toVm(row, disabledActionsFor(estate, "vm", row.name))),
        nextPage: cut.nextPage,
      } as never;
    }),
  ),

  ...viewGuard(
    "VMView",
    getVMViewMockHandler((info) => {
      const { estate } = read(info.request);
      const found = lookup(estate.vms, refOf(info, "vm"));
      if (!found.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "VMView", 200);
      return toVm(found.row, disabledActionsFor(estate, "vm", found.row.name)) as never;
    }),
    "VM",
    (info) => lookup(read(info.request).estate.vms, refOf(info, "vm")),
  ),

  /* ---- Disk: VM storage. ---- */
  ...listGuard(
    "DiskList",
    getDiskListMockHandler((info) => {
      const { estate, page, size, url } = read(info.request);
      const host = lookup(estate.vms, refOf(info, "vm"));
      if (!host.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "DiskList", 200);
      const rows = estate.disks.filter((row) => row.vmId === host.row.id);
      const cut = paginate(rows, { page, size }, markOf(url));
      return { items: cut.items.map(toDisk), nextPage: cut.nextPage } as never;
    }),
  ),

  /* ---- Snapshot ---- */
  ...listGuard(
    "SnapshotList",
    getSnapshotListMockHandler((info) => {
      const { estate, page, size, url } = read(info.request);
      const host = lookup(estate.vms, refOf(info, "vm"));
      if (!host.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "SnapshotList", 200);
      const rows = estate.snapshots.filter((row) => row.vmId === host.row.id);
      const cut = paginate(rows, { page, size }, markOf(url));
      return { items: cut.items.map(toSnapshot), nextPage: cut.nextPage } as never;
    }),
  ),

  /* ---- Task: the unit of asynchronous work. sovren's own noun. ---- */
  ...listGuard(
    "TaskList",
    getTaskListMockHandler((info) => {
      const { estate, taskState, taskKind, target, q, page, size, url } = read(info.request);
      recordSuccess(info.request, "TaskList", 200);
      const rows = estate.tasks.filter(
        (row) =>
          (taskState === null || row.state === taskState) &&
          (taskKind === null || row.kind === taskKind) &&
          (target === null || row.target.name === target || row.target.id === target) &&
          contains(row.name, q),
      );
      const cut = paginate(rows, { page, size }, markOf(url));
      return { items: cut.items.map(toTask), nextPage: cut.nextPage } as never;
    }),
  ),

  ...taskViewHandlers(),

  /* ---- Connection: an integration and the credentials held for it. ---- */
  ...listGuard(
    "ConnectionList",
    getConnectionListMockHandler((info) => {
      const { estate, page, size, url } = read(info.request);
      recordSuccess(info.request, "ConnectionList", 200);
      const cut = paginate(estate.connections, { page, size }, markOf(url));
      return { items: cut.items.map(toConnection), nextPage: cut.nextPage } as never;
    }),
  ),

  ...viewGuard(
    "ConnectionView",
    getConnectionViewMockHandler((info) => {
      const found = lookup(read(info.request).estate.connections, refOf(info, "connection"));
      if (!found.ok) throw new UnreachableGuard();
      recordSuccess(info.request, "ConnectionView", 200);
      return toConnection(found.row) as never;
    }),
    "Connection",
    (info) => lookup(read(info.request).estate.connections, refOf(info, "connection")),
  ),

  ...taskCancelHandlers(),
  ...connectionTestHandlers(),
  ...vmCreateHandlers(),
  ...vmUpdateHandlers(),
  ...taskLogStreamHandlers(),
];

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `TaskCancel`: a 202 with the Task in `cancelled`, or a refusal.
 *
 * It does not mutate the estate. The estate is a description of what exists, and
 * a description that changed under a reader would be a description two parts of
 * the system could disagree about -- which is the failure the world builder
 * exists to prevent. What the cancel returns is the Task the operator would then
 * watch, so the console has something real to render.
 *
 * A Task that has already finished is refused rather than accepted: there is no
 * process to signal, and reporting that as cancelled would be asserting work
 * happened that did not.
 */
const taskCancelHandlers = (): HttpHandler[] => {
  const generated = getTaskCancelMockHandler((info) => {
    const found = lookup(read(info.request).estate.tasks, refOf(info, "task"));
    if (!found.ok) throw new UnreachableGuard();
    recordSuccess(info.request, "TaskCancel", 202);
    return {
      ...toTask(found.row),
      state: "cancelled",
      terminalState: "cancelled",
      cancelledReason: "Cancelled by an operator from the console.",
      failureReason: null,
    } as never;
  });

  return [
    guard(generated, (info) => {
      const staged = sentinelResponse(info.request, "TaskCancel");
      if (staged !== undefined) return staged;

      const { estate } = read(info.request);
      const found = lookup(estate.tasks, refOf(info, "task"));
      if (!found.ok) return notFound(info.request, "TaskCancel", "Task", found.ref);

      // R43: a disabled action explains itself, and the reason is a fixed code
      // rather than a sentence. The estate declares it, so the explanation the
      // console renders on a greyed button is the one the request gets.
      const refused = estate.disabledActions[`task:${found.row.name}`]?.find(
        (entry) => entry.action === "cancel",
      );
      if (refused !== undefined) {
        return failure(info.request, "TaskCancel", refused.reason, refused.explanation);
      }

      if (found.row.state !== "running" && found.row.state !== "queued") {
        return failure(
          info.request,
          "TaskCancel",
          "conflict",
          `${found.row.name} is already ${found.row.state}, so there is no process to signal.`,
        );
      }

      return undefined;
    }),
    generated,
  ];
};

/**
 * `ConnectionTest`: 200 either way.
 *
 * The test ran, and that is what the status reports. The answer is `ok: false`
 * with a sovren `code` and a `requestId` that is also in the audit trail -- a
 * connection test that returned an HTTP error would be reporting its own success
 * wrongly, and the console would have two different places to look for the answer.
 */
const connectionTestHandlers = (): HttpHandler[] => {
  const generated = getConnectionTestMockHandler((info) => {
    const { estate } = read(info.request);
    const found = lookup(estate.connections, refOf(info, "connection"));
    if (!found.ok) throw new UnreachableGuard();
    recordSuccess(info.request, "ConnectionTest", 200);
    return testResult(estate, found.row.state, found.row.name, found.row.endpoint) as never;
  });

  return [
    guard(generated, (info) => {
      const staged = sentinelResponse(info.request, "ConnectionTest");
      if (staged !== undefined) return staged;
      const found = lookup(read(info.request).estate.connections, refOf(info, "connection"));
      if (found.ok) return undefined;
      return notFound(info.request, "ConnectionTest", "Connection", found.ref);
    }),
    generated,
  ];
};

/**
 * `VMCreate`: a 202 with a Task, and refusals that name the field.
 *
 * The 400 carries `details` naming the offending field and the constraint the
 * document declares, because an operator cannot fix what is not pointed at. The
 * 409 is a name the estate already uses -- `conflict` means something else claims
 * that name, not that the request was malformed. The 404 is a Node that is not in
 * the estate, which is a different code from a bad field.
 *
 * It does not create a VM. The estate is what exists, and a mock that invented a
 * finished VM would be teaching the console to render a success nobody observed,
 * which is the one thing R44 forbids. The Task it returns is `queued`, with
 * nothing claimed and nothing emitted, because that is what queued means: one the
 * operator can watch and cancel.
 */
const vmCreateHandlers = (): HttpHandler[] => {
  // Nothing serves the 202 from the generated handler, because a create is
  // answered in the guard: the Task it returns is one the operator has to watch.
  // The handler is still constructed, and the guard still reads its method and
  // path, so the endpoint is declared by the generator and once only.
  const generated = getVMCreateMockHandler(() => {
    throw new UnreachableGuard();
  });

  return [
    guard(generated, async (info) => {
      const staged = sentinelResponse(info.request, "VMCreate");
      if (staged !== undefined) return staged;

      const { estate } = read(info.request);
      const body = await readCreateBody(info.request);

      const host = lookup(estate.nodes, body.node);
      if (!host.ok) {
        return failure(info.request, "VMCreate", "not_found", `No Node answers to ${body.node}.`, [
          {
            path: "node",
            constraint: "notFound",
            message: `No Node is named or identified by ${body.node}.`,
          },
        ]);
      }

      const name = body.name;
      const taken =
        estate.vms.some((row) => row.name === name) ||
        estate.peers.some((row) => row.name === name);
      if (taken) {
        return failure(
          info.request,
          "VMCreate",
          "conflict",
          `The estate already has something called ${name}.`,
          [{ path: "name", constraint: "nameTaken", message: `${name} is already in the estate.` }],
        );
      }

      const invalid = invalidCreate(info.request, body, estate);
      if (invalid !== undefined) return invalid;

      recordSuccess(info.request, "VMCreate", 202);
      return HttpResponse.json(pendingCreateTask(estate, body), {
        status: 202,
        headers: { "x-request-id": mintRequestId() },
      });
    }),
  ];
};

/**
 * The log stream, in the two forms its two clients need.
 *
 * The document declares `TaskLogStream` as `text/event-stream`, and that is what
 * a browser's `EventSource` asks for. The *generated client*, however, goes
 * through the same mutator as every other call, which reads the body as JSON and
 * therefore cannot consume a stream -- orval emits one `TaskLogEvent` for it
 * because a return type cannot express a stream.
 *
 * So both are served, from one endpoint, chosen by the one thing that genuinely
 * distinguishes the two callers: what they said they accept. `EventSource` sends
 * `Accept: text/event-stream`; the generated client does not. The JSON branch is
 * the generated handler, so the generated client's declared type is honoured; the
 * SSE branch is mine, so the document is honoured.
 */

/**
 * `VMUpdate`, and the branch it can honestly answer.
 *
 * The document allows 200 with the VM when a change needs no long work -- a
 * purpose, a tag -- and 202 with a Task when it does, because resizing CPU or
 * memory moves disks on Proxmox. This backend answers **202, always**, and that
 * is the honest branch rather than the cautious one: the estate is a description
 * and does not mutate, so a 200 would hand back a VM carrying a change nobody
 * performed. The very next read would contradict it, which is the one thing the
 * console's "never assert an outcome it has not observed" rule exists to prevent.
 */
const vmUpdateHandlers = (): HttpHandler[] => {
  const generated = getVMUpdateMockHandler(() => {
    throw new UnreachableGuard();
  });

  return [
    guard(generated, async (info) => {
      const staged = sentinelResponse(info.request, "VMUpdate");
      if (staged !== undefined) return staged;

      const { estate } = read(info.request);
      const found = lookup(estate.vms, refOf(info, "vm"));
      if (!found.ok) {
        return failure(
          info.request,
          "VMUpdate",
          "not_found",
          `No VM answers to ${refOf(info, "vm")}.`,
          [
            {
              path: "vm",
              constraint: "notFound",
              message: `No VM is named or identified by ${refOf(info, "vm")}.`,
            },
          ],
        );
      }

      const body = await readUpdateBody(info.request);
      const invalid = invalidUpdate(info.request, body, found.row, estate);
      if (invalid !== undefined) return invalid;

      recordSuccess(info.request, "VMUpdate", 202);
      return HttpResponse.json(pendingTask(estate, "vm_update", found.row.id, found.row.name), {
        status: 202,
        headers: { "x-request-id": mintRequestId() },
      });
    }),
  ];
};

const readUpdateBody = async (request: Request): Promise<VMUpdateRequest> => {
  const text = await request.text();
  if (text === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return (typeof parsed === "object" && parsed !== null ? parsed : {}) as VMUpdateRequest;
  } catch {
    return {};
  }
};

const invalidUpdate = (
  request: Request,
  body: VMUpdateRequest,
  row: EstateVm,
  estate: Estate,
): Response | undefined => {
  const details: { path: string; constraint: string; message: string }[] = [];

  if (body.cores !== undefined && (typeof body.cores !== "number" || body.cores < 1)) {
    details.push({
      path: "cores",
      constraint: "atLeast1",
      message: "A VM needs at least one core.",
    });
  }

  if (
    body.memoryBytes !== undefined &&
    (typeof body.memoryBytes !== "number" || body.memoryBytes < 536_870_912)
  ) {
    details.push({
      path: "memoryBytes",
      constraint: "atLeast536870912",
      message: "A VM needs at least 512 MiB of memory.",
    });
  }

  // A resize the host cannot take is refused by name. Shrinking below what the
  // guest already has would need the guest stopped, and the estate has no way to
  // say it is -- so the honest answer names the floor rather than accepting a
  // change the control plane would have to refuse later.
  const host = estate.nodes.find((node) => node.name === row.node.name);
  if (host !== undefined && body.memoryBytes !== undefined && body.memoryBytes < 536_870_912) {
    details.push({
      path: "memoryBytes",
      constraint: "unsupportedByHost",
      message: `${row.node.name} cannot give this VM that little memory.`,
    });
  }

  if (body.cpuModel !== undefined && body.cpuModel !== null && body.cpuModel !== estate.cpuFloor) {
    details.push({
      path: "cpuModel",
      constraint: "unsupportedCpuModel",
      message: `The fleet floor is ${estate.cpuFloor}. ${String(body.cpuModel)} is not a model this estate offers.`,
    });
  }

  if (details.length === 0) return undefined;
  const first = details[0] as { message: string };
  return failure(
    request,
    "VMUpdate",
    "invalid_request",
    details.length === 1
      ? first.message
      : `${details.length} fields could not be accepted as written.`,
    details,
  );
};

/**
 * `TaskView`, which also answers for a Task a write accepted but nobody watched.
 *
 * The console navigates to the Task a create returned -- that is the whole point
 * of returning 202, and the only progress channel a bare VM will ever have is the
 * log on the far side of it. If that Task were a 404, a create would land the
 * operator on a dead end at the exact moment they most want to watch something.
 *
 * The estate is a description and does not mutate, so the pending Task is derived
 * from the ref rather than stored: `tk_pending-<kind>-<name>`. Deriving beats
 * remembering, because a remembered Task is state that leaks between tests and
 * state that disagrees with the estate the moment a test asserts against it. A
 * real control plane would have the record; this one reconstructs it.
 */
const PENDING_PREFIX = "tk_pending-";

const pendingFromRef = (estate: Estate, ref: string): Record<string, unknown> | undefined => {
  if (!ref.startsWith(PENDING_PREFIX)) return undefined;
  const rest = ref.slice(PENDING_PREFIX.length);
  const dash = rest.indexOf("-");
  if (dash <= 0) return undefined;
  const kind = rest.slice(0, dash);
  if (kind !== "vm_create" && kind !== "vm_update") return undefined;
  const name = rest.slice(dash + 1);
  if (name === "") return undefined;
  return pendingTask(estate, kind, `vm_pending-${name}`, name);
};

const taskViewHandlers = (): HttpHandler[] => {
  const generated = getTaskViewMockHandler((info) => {
    const found = lookup(read(info.request).estate.tasks, refOf(info, "task"));
    if (!found.ok) throw new UnreachableGuard();
    recordSuccess(info.request, "TaskView", 200);
    return toTask(found.row) as never;
  });

  return [
    guard(generated, (info) => {
      const staged = sentinelResponse(info.request, "TaskView");
      if (staged !== undefined) return staged;

      const { estate } = read(info.request);
      const ref = refOf(info, "task");

      const pending = pendingFromRef(estate, ref);
      if (pending !== undefined) {
        recordSuccess(info.request, "TaskView", 200);
        return HttpResponse.json(pending, {
          status: 200,
          headers: { "x-request-id": mintRequestId() },
        });
      }

      const found = lookup(estate.tasks, ref);
      if (!found.ok) {
        return failure(info.request, "TaskView", "not_found", `No Task answers to ${ref}.`, [
          { path: "task", constraint: "notFound", message: `No Task is identified by ${ref}.` },
        ]);
      }

      return undefined;
    }),
    generated,
  ];
};

const taskLogStreamHandlers = (): HttpHandler[] => {
  const generated = getTaskLogStreamMockHandler((info) => {
    const found = lookup(read(info.request).estate.tasks, refOf(info, "task"));
    if (!found.ok) throw new UnreachableGuard();
    recordSuccess(info.request, "TaskLogStream", 200);
    const events = logsFrom(found.row, info.request.headers.get("last-event-id"));
    const last = events.at(-1) ?? events[0];
    // Refused by the guard, never reached: a Task with no events has no stream.
    if (last === undefined) throw new UnreachableGuard();
    return last as never;
  });

  return [
    guard(generated, (info) => {
      const staged = sentinelResponse(info.request, "TaskLogStream");
      if (staged !== undefined) return staged;

      const found = lookup(read(info.request).estate.tasks, refOf(info, "task"));
      if (!found.ok) return notFound(info.request, "TaskLogStream", "Task", found.ref);

      const accept = info.request.headers.get("accept") ?? "";
      if (accept.includes("text/event-stream")) {
        // An `EventSource` is happy with an empty stream and needs no special
        // case: a queued Task that has emitted nothing has nothing to show.
        recordSuccess(info.request, "TaskLogStream", 200);
        return eventStream(info.request, found.row);
      }

      // Not an `EventSource`, so the generated client is the caller -- and its
      // return type is a single `TaskLogEvent`, which a Task with no events has
      // none of. Refusing in a fixed code is the honest answer: the Task exists,
      // but there is no log to stream in this state, and a screen can say so.
      // R43: the same code a greyed "stream logs" control would carry.
      if (found.row.logCount === 0) {
        return failure(
          info.request,
          "TaskLogStream",
          "action_not_permitted",
          `${found.row.name} is ${found.row.state} and has emitted nothing, so there is no log to stream yet.`,
        );
      }

      return undefined;
    }),
    generated,
  ];
};

/* -------------------------------------------------------------------------- */
/* The pieces the writes need                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A JSON body, or an empty one the constraint check will refuse.
 *
 * **A double-encoded body is accepted, and that is a workaround for a defect
 * elsewhere.** `packages/client/src/safe-fetch.ts` does
 * `JSON.stringify(config.body)`, and orval has already put a *string* in
 * `config.body`. The body that reaches the wire is therefore a JSON string
 * literal containing the JSON object, so `request.json()` yields a string rather
 * than an object. The client's own chain test never issues a POST, which is why
 * this has not been caught.
 *
 * A real control plane would reject that body as malformed, and rightly so. It is
 * accepted here only because the fix belongs to `packages/client`, which this
 * package does not own, and because a mock backend that refused every write would
 * make the console's create form untestable while the real bug sat unnoticed.
 * The alternative -- narrowing to a plain object -- turns one client defect into
 * an estate-wide outage of the write path, and hides it rather than surfacing it.
 *
 * Delete the string branch when `safe-fetch.ts` stops re-stringifying.
 */
const readCreateBody = async (request: Request): Promise<VMCreateRequest> => {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === "object" && parsed !== null) return parsed as VMCreateRequest;
    if (typeof parsed === "string") {
      const inner: unknown = JSON.parse(parsed);
      if (typeof inner === "object" && inner !== null) return inner as VMCreateRequest;
    }
  } catch {
    // Falls through to the empty body below, which the constraint check refuses
    // with a `details` entry per missing field rather than a crash.
  }
  return {} as VMCreateRequest;
};

/** The `invalid_request` a create body earns, or `undefined` if it is acceptable. */
const invalidCreate = (
  request: Request,
  body: VMCreateRequest,
  estate: Estate,
): Response | undefined => {
  const details: { path: string; constraint: string; message: string }[] = [];

  if (typeof body.name !== "string" || body.name === "") {
    details.push({ path: "name", constraint: "atLeast1", message: "A VM needs a name." });
  } else if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(body.name)) {
    details.push({
      path: "name",
      constraint: "pattern",
      message: "A name is a DNS label: lowercase, with no leading or trailing hyphen.",
    });
  }

  if (typeof body.cores !== "number" || body.cores < 1) {
    details.push({
      path: "cores",
      constraint: "atLeast1",
      message: "A VM needs at least one core.",
    });
  }

  if (typeof body.memoryBytes !== "number" || body.memoryBytes < 536_870_912) {
    details.push({
      path: "memoryBytes",
      constraint: "atLeast536870912",
      message: "A VM needs at least 512 MiB of memory.",
    });
  }

  // R63: the model defaults to the fleet floor, and an unsupported model is
  // rejected by name rather than silently floored. Silently flooring would hand
  // the operator a machine that is not the one they asked for.
  if (body.cpuModel !== null && body.cpuModel !== undefined && body.cpuModel !== estate.cpuFloor) {
    details.push({
      path: "cpuModel",
      constraint: "unsupportedCpuModel",
      message: `The fleet floor is ${estate.cpuFloor}. ${String(body.cpuModel)} is not a model this estate offers.`,
    });
  }

  if (details.length === 0) return undefined;
  const first = details[0] as { message: string };
  return failure(
    request,
    "VMCreate",
    "invalid_request",
    details.length === 1
      ? first.message
      : `${details.length} fields could not be accepted as written.`,
    details,
  );
};

/**
 * A Task for a create nobody has watched yet.
 *
 * `queued`, with no `startedAt` and no log lines, because that is what queued
 * means: claimed by nobody, emitted nothing, visibly not finished.
 */
const pendingTask = (
  estate: Estate,
  kind: "vm_create" | "vm_update",
  targetId: string,
  targetName: string,
): Record<string, unknown> => ({
  id: `tk_pending-${kind}-${String(targetName)}`,
  name: `${kind}-${String(targetName)}`,
  kind,
  target: { resource: "vm", id: String(targetId), name: String(targetName) },
  state: "queued",
  terminalState: null,
  failureReason: null,
  cancelledReason: null,
  startedAt: null,
  finishedAt: null,
  lastSeq: null,
  logCount: 0,
  created: estate.now,
  updated: estate.now,
});

const pendingCreateTask = (estate: Estate, body: VMCreateRequest): Record<string, unknown> =>
  pendingTask(estate, "vm_create", `vm_pending-${String(body.name)}`, String(body.name));

/**
 * A connection test's answer, in sovren's vocabulary.
 *
 * The code is the one the console keys off, and it is in the audit trail under the
 * same `requestId`, so an operator who reports "the Dokploy test failed" can be
 * traced to the exact request.
 */
const testResult = (
  estate: Estate,
  state: ConnectionState,
  name: string,
  endpoint: string | null,
): ConnectionTestResult => {
  const requestId = mintRequestId();
  const ok = state !== "failed" && state !== "unconfigured";
  const code: ErrorCode | null = ok ? null : "upstream_unauthenticated";
  const message = ok
    ? `${endpoint ?? name} answered.`
    : "An upstream rejected the credential sovren holds. Check Settings.";

  auditLog.record({
    requestId,
    request: {
      method: "POST",
      path: `/api/v1/connections/${name}/test`,
      operation: "ConnectionTest",
    },
    status: 200,
    ...(code === null ? {} : { code, message }),
  });

  return { ok, code, message, requestId, latencyMs: ok ? 41 : 88, testedAt: estate.now };
};

/**
 * The log stream, as server-sent events.
 *
 * R49: logs are held by the control plane and streamed, which none of the three
 * upstreams offers -- all three expose logs as polled REST. The event's `seq` is
 * the SSE `id:`, so a reconnect resumes from `Last-Event-ID` without losing a
 * line or replaying one, and a Task that has already finished replays its whole
 * log from the beginning -- which is what makes a task detail page useful after
 * the fact rather than only while someone is watching.
 */
const eventStream = (request: Request, row: EstateTask): Response => {
  const from = logsFrom(row, request.headers.get("last-event-id"));
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of from) {
        controller.enqueue(
          encoder.encode(`id: ${line.seq}\nevent: ${line.tag}\ndata: ${JSON.stringify(line)}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
};

/* -------------------------------------------------------------------------- */
/* The disabled actions an operator can read about                            */
/* -------------------------------------------------------------------------- */

/**
 * The actions the estate refuses, and the sovren code holding each one back.
 *
 * R43: a disabled action explains itself rather than disappearing, and the reason
 * is a code rather than a sentence -- the console keys off `reason` and supplies
 * the wording, so a greyed control and a failed request speak one vocabulary.
 * Keyed `"<kind>:<name>"`, which is the key the refusals above look up.
 */
export const disabledActionsFor = (estate: Estate, kind: string, name: string) =>
  estate.disabledActions[`${kind}:${name}`] ?? [];

export { auditLog };
