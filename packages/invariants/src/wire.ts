/**
 * Asking the mock backend what it actually serves.
 *
 * The coverage and identifier checks both need the *responses*, not a reading of
 * the code that produces them. That is a deliberate choice, and it is the reason
 * this suite can see things a source-level check cannot.
 *
 * The document declares `TaskLogStream` as `text/event-stream`, orval's return
 * type cannot express a stream, and the backend serves both forms by branching on
 * the `Accept` header — a hand-written response to a declared operation, which is
 * invisible in `handlers.ts` and obvious on the wire. Likewise the Task and VM ids
 * the backend *mints* for a create it does not perform: they never appear in the
 * estate, so the world builder's own check cannot see them, and they are the only
 * identifiers the mock serves that are not sovren identifiers.
 *
 * So the probe goes over real HTTP and reads the bodies. It is a seam alongside the
 * contract tests and the world builder's consistency check, and it is the one that
 * crosses every package at once.
 *
 * **The probe addresses rows by reading the estate, not by naming them.** A
 * hard-coded `accra-golden-01` breaks the day somebody renames a fixture, and a
 * broken probe is a probe whose silence is ambiguous: it would report no
 * malformed identifiers because it never received any. Deriving the addresses from
 * the estate makes that failure impossible — a name that no longer resolves is a
 * 404, and a 404 is a failure here.
 */

import { setupSovrenServer, estateFor, type Estate } from "@sovren/fakes";
import { ID_PREFIXES } from "@sovren/fakes";

import { ACKNOWLEDGED_IDENTIFIER_PREFIXES } from "./acknowledged";
import { prefixMap, servedIdentifierProblems, type IdentifierProblem } from "./identifiers";
import { declaredOperations, type Declared, type Document } from "./repo";

export interface ServedResponse {
  /** `GET /vms` — the operation in the document's own spelling. */
  readonly where: string;
  readonly status: number;
  readonly body: unknown;
}

/** Acknowledged id families, as a predicate over the whole value. */
export const acknowledgedId = (value: string): boolean =>
  Object.keys(ACKNOWLEDGED_IDENTIFIER_PREFIXES).some((prefix) => value.startsWith(prefix));

/** One address the probe will request, and the operation it is for. */
interface Probe {
  readonly operation: Declared;
  readonly path: string;
}

/**
 * A row to address every read operation with, chosen from the estate.
 *
 * Each is picked to reach a different shape rather than merely to exist: a Node
 * with Drives, a VM with a transitional Task behind it, a Task with log lines, a
 * Connection with a credential. An identifier nested three levels down — a Task's
 * `target`, a VM's `transitionalTask` — is only read if the estate has one, and
 * these choices are what guarantee it does.
 */
const addresses = (estate: Estate): Probe["path"][] => {
  const node = estate.nodes.find((row) => estate.drives.some((d) => d.nodeId === row.id));
  const peer = estate.peers[0];
  const vm = estate.vms.find((row) => row.transitionalTask !== null) ?? estate.vms[0];
  const vmWithDisks = estate.vms.find((row) => estate.disks.some((disk) => disk.vmId === row.id));
  const vmWithSnapshots = estate.vms.find((row) =>
    estate.snapshots.some((snapshot) => snapshot.vmId === row.id),
  );
  const taskWithLogs = estate.tasks.find((row) => row.logs.length > 0) ?? estate.tasks[0];
  const connection = estate.connections[0];

  return [
    "/nodes",
    ...(node === undefined ? [] : [`/nodes/${node.name}`, `/nodes/${node.name}/drives`]),
    ...(node === undefined || estate.drives[0] === undefined
      ? []
      : [`/nodes/${node.name}/drives/${estate.drives[0]?.name ?? ""}`]),
    "/peers",
    ...(peer === undefined ? [] : [`/peers/${peer.name}`]),
    "/vms",
    ...(vm === undefined ? [] : [`/vms/${vm.name}`]),
    ...(vmWithDisks === undefined ? [] : [`/vms/${vmWithDisks.name}/disks`]),
    ...(vmWithSnapshots === undefined ? [] : [`/vms/${vmWithSnapshots.name}/snapshots`]),
    "/tasks",
    ...(taskWithLogs === undefined ? [] : [`/tasks/${taskWithLogs.name}`]),
    "/connections",
    ...(connection === undefined ? [] : [`/connections/${connection.name}`]),
  ];
};

/**
 * Match a concrete path back to the operation that declares it.
 *
 * Longest template first, so `/nodes/accra-desk-01/drives/boot-sda` matches the
 * view rather than the list, and `/nodes/accra-desk-01` matches the view rather
 * than the collection. Without that ordering the probe would read the wrong
 * operation's body under the right operation's name, and every identifier in it
 * would be checked against the wrong expectations.
 */
const operationFor = (doc: Document, path: string): Declared | undefined =>
  declaredOperations(doc)
    .filter((entry) => pathMatches(entry.path, path))
    .sort((a, b) => b.path.length - a.path.length)[0];

/**
 * `/nodes/{node}` matches `/nodes/accra-desk-01`; `/nodes` does not.
 *
 * The template is split on its parameter braces and each segment escaped
 * separately, rather than escaping the whole string and trying to un-escape the
 * placeholders afterwards — which is where that approach goes wrong, silently, on
 * a path containing a character the escape also touches.
 */
const pathMatches = (template: string, concrete: string): boolean => {
  const segments = template.split("/");
  const parts = concrete.split("/");
  if (segments.length !== parts.length) return false;
  return segments.every((segment, index) =>
    /^\{[^}]+\}$/.test(segment) ? (parts[index] ?? "") !== "" : segment === parts[index],
  );
};

/** A create body, so the write path is probed too. */
const CREATE_BODY = {
  name: "invariants-probe",
  node: estateFor("fleet").nodes[0]?.name ?? "accra-desk-01",
  cores: 2,
  memoryBytes: 1_073_741_824,
  diskBytes: 10_737_418_240,
  cpuModel: null,
  tags: [],
  isTemplate: false,
};

/**
 * Every declared read operation's response, plus one write, over real HTTP.
 *
 * Each request names a page size large enough to carry every row, so a body is not
 * half-read and a malformed id in the second page goes unnoticed. The mock backend
 * is started and stopped here rather than left to a fixture, because a leaked MSW
 * server patches global `fetch` for whatever runs next — which in a workspace this
 * size is the next test file.
 */
export const probeResponses = async (
  doc: Document,
  estateName = "fleet",
): Promise<ServedResponse[]> => {
  const estate = estateFor(estateName);
  const server = setupSovrenServer();
  const responses: ServedResponse[] = [];
  const base = "http://sovren.invariants/api/v1";

  server.listen({ onUnhandledRequest: "error" });
  try {
    for (const path of addresses(estate)) {
      const operation = operationFor(doc, path);
      if (operation === undefined) continue;
      const response = await fetch(`${base}${path}?size=200`);
      responses.push({
        where: `${operation.method.toUpperCase()} ${operation.path}`,
        status: response.status,
        body: await response.json(),
      });
    }

    // The write path, because it is the one that *mints* identifiers rather than
    // reading them, and minting is where the acknowledged family lives.
    const created = await fetch(`${base}/vms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CREATE_BODY),
    });
    responses.push({
      where: "POST /vms",
      status: created.status,
      body: await created.json(),
    });
  } finally {
    server.close();
  }

  return responses;
};

/**
 * The identifiers the mock backend serves that are not sovren identifiers.
 *
 * The check itself, applied to a real set of responses. `acknowledged` is a
 * parameter so a negative control can pass "nothing is acknowledged" and watch the
 * whole acknowledged family reported — the point being that an acknowledgement
 * list which is never shown to be load-bearing is a list nobody has checked.
 */
export const wireIdentifierProblems = (
  responses: readonly ServedResponse[],
  acknowledged: (value: string) => boolean = acknowledgedId,
): IdentifierProblem[] =>
  servedIdentifierProblems(
    responses.map((response) => ({ where: response.where, body: response.body })),
    prefixMap(ID_PREFIXES),
    new Set(
      responses.flatMap((response) => servedIdentifierValues(response.body)).filter(acknowledged),
    ),
  );

/** Every id string in a body, flat. */
export const servedIdentifierValues = (body: unknown): string[] => {
  const values: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" && typeof entry === "string") values.push(entry);
      walk(entry);
    }
  };
  walk(body);
  return values;
};
