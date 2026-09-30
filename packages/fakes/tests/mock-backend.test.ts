/**
 * The mock backend, over real HTTP, through the generated client.
 *
 * This is the agreed seam: the generated chain, document to client to validators
 * to handlers, with both ends generated. Nothing here is hand-written on either
 * side of the wire -- the handlers come from orval, the calls come from orval,
 * and the only sovren-authored code in between is the estate and the mutator the
 * client already had.
 *
 * Expected values are literals or values the document declares. A test that
 * recomputed an expected value the way the code computes it would agree by
 * construction and assert nothing, so counts here are written out and shapes are
 * asserted against what the document says they are.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  connectionList,
  connectionTest,
  connectionView,
  diskList,
  driveList,
  driveView,
  nodeList,
  nodeView,
  peerList,
  peerView,
  snapshotList,
  taskCancel,
  taskList,
  taskLogStream,
  taskView,
  vMCreate,
  vMList,
  vMUpdate,
  vMView,
} from "@sovren/client";

import { resetAuditLog, setupSovrenServer } from "../src";
import { estateFor } from "../src/estate/registry";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../src/backend/pagination";

const server = setupSovrenServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
// Reset between tests so one suite's audit entries cannot satisfy another's
// assertion -- which would be a test passing for the wrong reason.
afterEach(() => {
  server.resetHandlers();
  resetAuditLog();
});
afterAll(() => server.close());

const fleet = estateFor("fleet");

describe("lists return the envelope the document declares", () => {
  it("returns a page of Nodes with an opaque token or null", async () => {
    const response = await nodeList();
    if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);

    // The whole fleet, which is fewer than a default page, so the last page's
    // token is null -- the case a screen has to render as "no more".
    expect(response.data.items).toHaveLength(19);
    expect(response.data.nextPage).toBeNull();
    expect(response.data.items.map((row) => row.name)).toContain("accra-desk-01");
  });

  it("returns more VMs than fit on one page, so pagination is real", async () => {
    const response = await vMList();
    if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);

    // The document's default page size is 25 and the estate has 27 VMs. This is
    // the assertion that the estate is large enough to exercise pagination
    // honestly rather than only under a test that asks for three rows.
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect(response.data.items).toHaveLength(25);
    expect(response.data.nextPage).not.toBeNull();
  });

  it("walks every page without repeating or dropping a row", async () => {
    const seen: string[] = [];
    let token: string | null = null;
    let pages = 0;

    do {
      const response: Awaited<ReturnType<typeof vMList>> = await vMList({
        page: token ?? undefined,
        size: 10,
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      seen.push(...response.data.items.map((row) => row.id));
      token = response.data.nextPage;
      pages += 1;
    } while (token !== null && pages < 20);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(27);
    // Every row exactly once. An offset would fail this the moment a row were
    // inserted, which is the whole reason R33 says the token is not one.
    expect(new Set(seen).size).toBe(27);
  });

  it("hands out a token that is not an offset", async () => {
    const first = await vMList({ size: 5 });
    if (first.status !== 200) throw new Error("expected 200");

    const token = first.data.nextPage;
    expect(token).not.toBeNull();
    // A client must not be able to construct one. If the token were `5`, a
    // crafted request would ask for page 40 and skip rows.
    expect(token).not.toMatch(/^\d+$/);
    expect(token).toMatch(/^pt_/);
  });

  it("clamps a page size to the bounds the document declares", async () => {
    const big = await nodeList({ size: MAX_PAGE_SIZE + 1000 });
    if (big.status !== 200) throw new Error("expected 200");
    expect(big.data.items).toHaveLength(19);
  });
});

describe("NameOrId: both work in every path", () => {
  it("views a Node by name and by its id, and gets the same Node", async () => {
    const byName = await nodeView("accra-rig-02");
    if (byName.status !== 200) throw new Error("expected 200");
    expect(byName.data.name).toBe("accra-rig-02");

    const byId = await nodeView(byName.data.id);
    if (byId.status !== 200) throw new Error("expected 200");
    expect(byId.data.id).toBe(byName.data.id);

    // R32: `id` is immutable and `name` is mutable, which is why a link by id
    // survives a rename and a link by name does not.
    expect(byId.data.id).toMatch(/^nd_[0-9a-hjkmnp-tv-z]{10}$/);
  });

  it.each([
    ["vMView", (ref: string) => vMView(ref), "grafana", "grafana"],
    ["peerView", (ref: string) => peerView(ref), "ops-laptop-sipho", "ops-laptop-sipho"],
    ["taskView", (ref: string) => taskView(ref), "create-netbird", "create-netbird"],
    ["connectionView", (ref: string) => connectionView(ref), "dokploy-accra", "dokploy-accra"],
  ])("%s resolves a name and an id alike", async (_name, call, byName, expected) => {
    const first = await call(byName);
    if (first.status !== 200) throw new Error(`expected 200 for ${byName}`);
    expect(first.data.name).toBe(expected);

    const second = await call(first.data.id);
    if (second.status !== 200) throw new Error(`expected 200 for ${first.data.id}`);
    expect(second.data.id).toBe(first.data.id);
  });

  it("refuses a name nothing answers to, with not_found rather than a bare 404", async () => {
    const response = await nodeView("accra-desk-99");
    expect(response.status).toBe(404);
    if (response.status === 200) throw new Error("expected a failure");

    // R35: the client never throws, and what it returns is a sovren error rather
    // than an untyped body. The code is what the console keys off.
    expect(response.data.code).toBe("not_found");
    expect(response.data.requestId).toMatch(/^req_/);
  });
});

describe("the awkward cases reach the console as real rows", () => {
  it("reports a Node with no overlay address as null, not as an empty cell", async () => {
    const response = await nodeView("takoradi-nas-01");
    if (response.status !== 200) throw new Error("expected 200");

    // The specific thing the estate exists to get right: null is a fact about
    // the machine. "" and "0.0.0.0" would both render as an address an operator
    // could try, and neither resolves.
    expect(response.data.overlay).toBeNull();
    expect(response.data.status).toBe("degraded");
  });

  it("reports a VM whose create Task is still running as transitional, with the Task", async () => {
    const response = await vMView("grafana-canary");
    if (response.status !== 200) throw new Error("expected 200");

    // R51: a resource shows a transitional state while its Task runs, and the
    // console never asserts completion it has not observed.
    expect(response.data.runState).toBe("transitional");
    expect(response.data.transitionalTask).not.toBeNull();
    expect(response.data.transitionalTask?.kind).toBe("vm_create");
    expect(response.data.overlay).toBeNull();
    expect(response.data.failureReason).toBeNull();
  });

  it("reports a failed VM as failed, distinct from stopped, and says why", async () => {
    const failed = await vMView("legacy-erp");
    if (failed.status !== 200) throw new Error("expected 200");
    expect(failed.data.runState).toBe("failed");
    expect(failed.data.failureReason).toContain("guest agent");

    // The distinction is the requirement, so it is asserted against a VM that is
    // genuinely stopped: same host, same shape, different meaning.
    const stopped = await vMView("lab-build-02");
    if (stopped.status !== 200) throw new Error("expected 200");
    expect(stopped.data.runState).toBe("stopped");
    expect(stopped.data.failureReason).toBeNull();
  });

  it("reports a Node that cannot migrate, and the reason is a fixed code", async () => {
    const response = await nodeView("accra-desk-01");
    if (response.status !== 200) throw new Error("expected 200");

    // R64: no live migration across heterogeneous CPUs, so the action is not
    // offered rather than offered and then refused.
    expect(response.data.canMigrate).toBe(false);
    expect(response.data.cpuModel).toBe("Intel Core 2 Duo E8400");
  });

  it("reports a peer last seen six days ago as stale, with the date attached", async () => {
    const response = await peerView("ops-laptop-sipho");
    if (response.status !== 200) throw new Error("expected 200");

    // Stale is a state with a date attached, not a guess, and the peers table
    // has to make it obvious at a glance.
    expect(response.data.status).toBe("stale");
    expect(response.data.lastSeen).toBe("2026-09-23T06:00:00.000Z");
    // And it has no Node, because it is a laptop: a real peer with no machine
    // behind it, which a screen that assumes otherwise will break on.
    expect(response.data.node).toBeNull();
    expect(response.data.site).toBeNull();
  });

  it("carries a Node's Drives without confusing them with a VM's Disks", async () => {
    const response = await driveList("accra-server-01");
    if (response.status !== 200) throw new Error("expected 200");

    // Drive is physical storage on a Node; Disk is VM storage. The two are never
    // the same noun and a screen that swaps them is wrong in a way no type
    // catches, because both are objects with an id and a size.
    expect(response.data.items.map((row) => row.name)).toEqual([
      "accra-server-01-sda",
      "accra-server-01-sdb",
    ]);
    for (const row of response.data.items) {
      expect(row.nodeId).toBe("nd_01hq2n0006");
      expect("vmId" in row).toBe(false);
    }

    const disks = await diskList("postgres-main");
    if (disks.status !== 200) throw new Error("expected 200");
    expect(disks.data.items.map((row) => row.name)).toEqual([
      "postgres-main-data",
      "postgres-main-wal",
    ]);
    for (const row of disks.data.items) expect("nodeId" in row).toBe(false);
  });

  it("resolves a Drive by name on its Node", async () => {
    const response = await driveView("accra-server-01", "accra-server-01-sdb");
    if (response.status !== 200) throw new Error("expected 200");
    expect(response.data.name).toBe("accra-server-01-sdb");
    expect(response.data.health).toBe("healthy");
  });

  it("chains a Snapshot to the one it was taken from", async () => {
    const response = await snapshotList("postgres-main");
    if (response.status !== 200) throw new Error("expected 200");

    const names = response.data.items.map((row) => row.name);
    expect(names).toContain("postgres-main-post-upgrade");

    const after = response.data.items.find((row) => row.name === "postgres-main-post-upgrade");
    const before = response.data.items.find((row) => row.name === "postgres-main-pre-upgrade");
    expect(after?.parentSnapshotId).toBe(before?.id);
  });
});

describe("filters come from the URL, and only the ones the client can send", () => {
  it("narrows Nodes to one Site", async () => {
    const response = await nodeList({ site: "kumasi-store" });
    if (response.status !== 200) throw new Error("expected 200");

    const sites = new Set(response.data.items.map((row) => row.site.name));
    expect([...sites]).toEqual(["kumasi-store"]);
  });

  it("narrows Nodes by a substring of the name", async () => {
    const response = await nodeList({ q: "rig" });
    if (response.status !== 200) throw new Error("expected 200");
    expect(response.data.items.map((row) => row.name).sort()).toEqual([
      "accra-rig-01",
      "accra-rig-02",
      "kumasi-rig-01",
      "takoradi-rig-01",
    ]);
  });

  it("narrows VMs by purpose and by run state", async () => {
    const transitional = await vMList({ runState: "transitional" });
    if (transitional.status !== 200) throw new Error("expected 200");
    expect(transitional.data.items.map((row) => row.name)).toEqual(["grafana-canary"]);

    const infrastructure = await vMList({ purpose: ["infrastructure"] });
    if (infrastructure.status !== 200) throw new Error("expected 200");
    for (const row of infrastructure.data.items) expect(row.purpose).toBe("infrastructure");
  });

  it("narrows Peers by the Group the estate gave them", async () => {
    const response = await peerList({ group: "Operators" });
    if (response.status !== 200) throw new Error("expected 200");

    // Groups come from the estate's Group list, never from a string typed into
    // the row, so filtering by one is an exact match rather than a substring.
    expect(response.data.items.map((row) => row.name).sort()).toEqual([
      "ops-laptop-grace",
      "ops-laptop-sipho",
      "phone-sipho",
    ]);
  });

  it("narrows Tasks by state", async () => {
    const response = await taskList({ state: "failed" });
    if (response.status !== 200) throw new Error("expected 200");

    const names = response.data.items.map((row) => row.name).sort();
    expect(names).toEqual([
      "snapshot-grafana-canary-base",
      "terraform-takoradi",
      "test-connection-dokploy",
    ]);
    for (const row of response.data.items) expect(row.failureReason).toBeTruthy();
  });
});

describe("the estate is selectable at runtime, and the test sees the same one", () => {
  it("serves the compact estate when the URL asks for it", async () => {
    // R54: the dev server and the test suite start from the same description, so
    // a screen looks the same in both. The only difference is a value in the URL.
    const response = await nodeList({ estate: "compact" } as unknown as { size?: number });
    if (response.status !== 200) throw new Error("expected 200");

    expect(response.data.items.map((row) => row.name)).toEqual([
      "accra-desk-01",
      "takoradi-nas-01",
    ]);
  });

  it("serves the default estate when nobody selected one", async () => {
    const response = await nodeList();
    if (response.status !== 200) throw new Error("expected 200");
    expect(response.data.items).toHaveLength(fleet.nodes.length);
  });
});

describe("writes are honest about being writes", () => {
  it("cancels a running Task with a 202 and a Task to watch", async () => {
    const response = await taskCancel("create-grafana-canary");
    if (response.status !== 202) throw new Error(`expected 202, got ${response.status}`);

    // R31: long work returns 202 with a Task, and R50: a running Task is
    // cancellable. The returned Task is the one the operator then watches.
    expect(response.data.state).toBe("cancelled");
    expect(response.data.terminalState).toBe("cancelled");
    expect(response.data.cancelledReason).toBeTruthy();
  });

  it("refuses to cancel a Task that has already finished, with a fixed code", async () => {
    const response = await taskCancel("create-netbird");
    expect(response.status).toBe(422);
    if (response.status === 202) throw new Error("expected a refusal");

    // R43 and R50 together: the action is not offered, and asking anyway gets
    // the same fixed code the greyed control carries -- not a free-text message
    // and not a success that pretends work was cancelled.
    expect(response.data.code).toBe("action_not_permitted");
  });

  it("answers a connection test with 200 and the answer in the body", async () => {
    const good = await connectionTest("proxmox-accra");
    if (good.status !== 200) throw new Error(`expected 200, got ${good.status}`);
    expect(good.data.ok).toBe(true);
    expect(good.data.code).toBeNull();

    // A connection test that returned an HTTP error would be reporting its own
    // success wrongly. The test ran; the answer is `ok: false`.
    const bad = await connectionTest("dokploy-accra");
    if (bad.status !== 200) throw new Error("expected 200");
    expect(bad.data.ok).toBe(false);
    expect(bad.data.code).toBe("upstream_unauthenticated");
    expect(bad.data.requestId).toMatch(/^req_/);
  });

  it("creates a VM as a queued Task rather than as a finished one", async () => {
    const response = await vMCreate({
      node: "accra-rig-01",
      name: "scratch-box",
      purpose: "workload",
      cores: 2,
      memoryBytes: 2147483648,
    });
    if (response.status !== 202) throw new Error(`expected 202, got ${response.status}`);

    // R44: the console never asserts completion it has not observed. A mock that
    // returned a `succeeded` Task, or a VM, would be reporting work nobody did.
    expect(response.data.kind).toBe("vm_create");
    expect(response.data.state).toBe("queued");
    expect(response.data.startedAt).toBeNull();
    expect(response.data.finishedAt).toBeNull();
    expect(response.data.logCount).toBe(0);

    // And the VM does not exist, because nothing has built it yet.
    const after = await vMView("scratch-box");
    expect(after.status).toBe(404);
  });

  it("refuses a create whose name is taken, and says which name", async () => {
    const response = await vMCreate({
      node: "accra-rig-01",
      name: "grafana",
      purpose: "service",
      cores: 2,
      memoryBytes: 2147483648,
    });
    expect(response.status).toBe(409);
    if (response.status === 202) throw new Error("expected a refusal");

    // `conflict` means something else claims that name, not that the request was
    // malformed -- which is a different code and a different thing to fix.
    expect(response.data.code).toBe("conflict");
    expect(response.data.message).toContain("grafana");
  });

  it("refuses a create on a Node that does not exist", async () => {
    const response = await vMCreate({
      node: "no-such-node",
      name: "scratch-box",
      purpose: "workload",
      cores: 2,
      memoryBytes: 2147483648,
    });
    expect(response.status).toBe(404);
    if (response.status === 202) throw new Error("expected a refusal");
    expect(response.data.code).toBe("not_found");
  });

  it("refuses a create whose fields break the document's constraints", async () => {
    // R35 with teeth: `invalid_request` is the code the console keys off, and it
    // is not retryable -- nothing about waiting changes a value outside its
    // constraint.
    const response = await vMCreate({
      node: "accra-rig-01",
      name: "Bad Name",
      purpose: "workload",
      cores: 0,
      memoryBytes: 1024,
    });
    expect(response.status).toBe(400);
    if (response.status === 202) throw new Error("expected a refusal");
    expect(response.data.code).toBe("invalid_request");
    expect(response.data.retryable).toBe(false);
  });

  it("names every offending field in the refusal, so a form can point at it", async () => {
    // Read at the wire rather than through the client, because the client's
    // mutator currently drops `details` on the floor -- see the note below. The
    // response body is still observable behaviour, and it is what a real control
    // plane would serve.
    const response = await fetch("http://control-plane.test/api/v1/vms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        node: "accra-rig-01",
        name: "Bad Name",
        purpose: "workload",
        cores: 0,
        memoryBytes: 1024,
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code: string;
      details: { path: string; constraint: string }[];
    };

    expect(body.code).toBe("invalid_request");
    // An operator cannot fix what is not pointed at, so each entry names the
    // field and the constraint the document declares for it.
    expect(body.details.map((entry) => entry.path).sort()).toEqual([
      "cores",
      "memoryBytes",
      "name",
    ]);
    expect(body.details.find((entry) => entry.path === "cores")?.constraint).toBe("atLeast1");
    expect(body.details.find((entry) => entry.path === "memoryBytes")?.constraint).toBe(
      "atLeast536870912",
    );
  });

  it("refuses a create naming a CPU model below the fleet floor, by name", async () => {
    // R63: the model defaults to the floor, and an unsupported one is rejected
    // rather than silently floored. Silently flooring would hand the operator a
    // machine that is not the one they asked for.
    const response = await fetch("http://control-plane.test/api/v1/vms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        node: "accra-rig-01",
        name: "scratch-box",
        purpose: "workload",
        cpuModel: "x86-64-v2-AES",
        cores: 2,
        memoryBytes: 2147483648,
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code: string;
      details: { path: string; constraint: string; message: string }[];
    };
    expect(body.code).toBe("invalid_request");
    const cpu = body.details.find((entry) => entry.path === "cpuModel");
    expect(cpu?.constraint).toBe("unsupportedCpuModel");
    expect(cpu?.message).toContain("kvm64");
  });
});

describe("Settings surfaces what sovren holds, and what it does not", () => {
  it("states both Proxmox credentials and says why both are needed", async () => {
    const response = await connectionView("proxmox-accra");
    if (response.status !== 200) throw new Error("expected 200");

    // R60: two credentials, not one, and the reason is a property of Proxmox
    // rather than a design preference -- which is why it is surfaced.
    const kinds = response.data.requirements.map((entry) => entry.kind).sort();
    expect(kinds).toEqual(["api_token", "pam_ssh_key"]);
    const ssh = response.data.requirements.find((entry) => entry.kind === "pam_ssh_key");
    expect(ssh?.required).toBe(true);
    expect(ssh?.why).toContain("SFTP");
  });

  it("shows a failed integration with the code that explains it", async () => {
    const response = await connectionView("dokploy-accra");
    if (response.status !== 200) throw new Error("expected 200");

    // A misconfiguration an operator can act on: the credential is held, the
    // endpoint is set, and the last test failed with a code rather than a
    // sentence nobody can key off.
    expect(response.data.state).toBe("failed");
    expect(response.data.lastTest?.ok).toBe(false);
    expect(response.data.lastTest?.code).toBe("upstream_unauthenticated");
  });

  it("lists every integration the estate declares", async () => {
    const response = await connectionList();
    if (response.status !== 200) throw new Error("expected 200");
    expect(response.data.items.map((row) => row.kind)).toEqual(["proxmox", "netbird", "dokploy"]);
  });
});

describe("task logs stream, and resume", () => {
  it("serves an EventSource a server-sent event stream", async () => {
    // R49: logs are held by the control plane and streamed, which none of the
    // three upstreams offers -- all three expose logs as polled REST. The event's
    // `seq` is the SSE `id:`, which is what makes a reconnect resumable.
    const response = await fetch("http://control-plane.test/api/v1/tasks/create-netbird/logs", {
      headers: { accept: "text/event-stream" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const body = await response.text();
    const events = body.split("\n\n").filter((chunk) => chunk.trim() !== "");

    // The run has four log lines and a result, and every one of them is here --
    // the log of a Task that finished an hour ago is as readable as one that is
    // still going, which is what makes a task detail page useful after the fact.
    expect(events).toHaveLength(5);
    expect(events[0]).toMatch(/^id: 1$/m);
    expect(events[0]).toMatch(/^event: log$/m);
    expect(body).toContain("Apply complete.");

    const seqs = [...body.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });

  it("resumes from Last-Event-ID without replaying a line", async () => {
    const response = await fetch("http://control-plane.test/api/v1/tasks/create-netbird/logs", {
      headers: { accept: "text/event-stream", "last-event-id": "3" },
    });

    const body = await response.text();
    const seqs = [...body.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));

    // A reconnect after a dropped connection must not lose a line or show one
    // twice, and that is a property of the id being the seq rather than a
    // timestamp the client has to compare.
    expect(seqs).toEqual([4, 5]);
  });

  it("serves the generated client the last event, since it cannot read a stream", async () => {
    // The generated client goes through the same mutator as every other call,
    // which reads the body as JSON. orval emits one `TaskLogEvent` for a stream
    // because a return type cannot express one, so the JSON branch is what it
    // gets and the type it declared is honoured.
    const response = await taskLogStream("create-netbird");
    if (response.status !== 200) throw new Error("expected 200");

    expect(response.data.tag).toBe("result");
    expect(response.data.seq).toBe(5);
  });

  it("refuses a log stream for a Task that does not exist", async () => {
    const response = await fetch("http://control-plane.test/api/v1/tasks/no-such-task/logs", {
      headers: { accept: "text/event-stream" },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("not_found");
  });

  it("has no log lines for a Task that was never claimed", async () => {
    // `queued` means claimed by nobody and emitted nothing, so an empty log is
    // the honest answer and not a rendering failure.
    const response = await fetch(
      "http://control-plane.test/api/v1/tasks/restore-grafana-canary/logs",
      {
        headers: { accept: "text/event-stream" },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");

    // The generated client, whose return type is a single `TaskLogEvent`, has no
    // way to express "no events" -- so a queued Task's log is refused rather than
    // answered with something invented. The code is a fixed one, and it is the
    // same code a greyed "stream logs" control would carry, so a task detail page
    // renders it the way it renders any other refusal.
    const viaClient = await taskLogStream("restore-grafana-canary");
    expect(viaClient.status).toBe(422);
    if (viaClient.status === 200) throw new Error("expected a refusal");
    expect(viaClient.data.code).toBe("action_not_permitted");
    expect(viaClient.data.message).toContain("queued");
  });
});

describe("a refusal the estate declares reaches the wire", () => {
  // Two screen agents reported this independently as dead code: the estate
  // declared refusals, the document declared the field, and the projection
  // dropped it on the way out. A disabled action that explains itself in terms
  // of a fixed code is only reachable if the code arrives, so this asserts the
  // arrival rather than the absence of a crash.

  it("a Node carries the refusal the estate declared for it", async () => {
    const response = await nodeView("accra-desk-01");
    if (response.status !== 200) throw new Error(`expected a Node, got ${response.status}`);

    expect(response.data.disabledActions).toEqual([
      {
        action: "migrate",
        reason: "action_not_permitted",
        explanation:
          "Live migration is not offered across heterogeneous CPUs, and this Node's CPU is below the fleet floor.",
      },
    ]);
  });

  it("a VM carries the refusal the estate declared for it", async () => {
    const response = await vMView("legacy-erp");
    if (response.status !== 200) throw new Error(`expected a VM, got ${response.status}`);

    expect(response.data.disabledActions?.map((action) => action.action)).toContain("migrate");
    expect(response.data.disabledActions?.map((action) => action.reason)).toContain(
      "action_not_permitted",
    );
  });

  it("every reason on the wire is a code from the closed vocabulary", async () => {
    // A reason is the contract; the sentence is the courtesy. A free-text reason
    // would be a refusal the console cannot key off, and one an action the
    // console will contradict later.
    const response = await nodeList({ size: 200 });
    if (response.status !== 200) throw new Error(`expected a page of Nodes`);

    const allowed = [
      "not_found",
      "unauthorised",
      "forbidden",
      "conflict",
      "invalid_request",
      "upstream_unavailable",
      "upstream_unauthenticated",
      "action_not_permitted",
      "task_failed",
      "internal",
    ];
    const declared = response.data.items.flatMap((node) => node.disabledActions ?? []);
    expect(declared.length).toBeGreaterThan(0);
    for (const action of declared) {
      expect(allowed).toContain(action.reason);
    }
  });
});

describe("a create's Task is a Task you can go and watch", () => {
  // The console navigates to the returned Task, which is an acceptance criterion
  // in its own right: a create that lands the operator on a 404 is a create whose
  // only progress channel -- a streamed log, per R49 -- is unreachable. The estate
  // deliberately does not mutate, so the pending Task is answered by the backend
  // rather than added to the description. That is a *view* answer, not a mutation:
  // the estate is still the estate, and a later read still says the VM is absent.

  it("answers TaskView for the Task a create just returned", async () => {
    const created = await vMCreate({
      name: "web-07",
      node: "accra-desk-01",
      purpose: "workload",
      cores: 2,
      memoryBytes: 2_147_483_648,
    });
    if (created.status !== 202) throw new Error(`expected a Task, got ${created.status}`);

    const viewed = await taskView(created.data.id);
    expect(viewed.status).toBe(200);
    if (viewed.status !== 200) throw new Error("unreachable");

    // The same Task, still queued, with nothing observed about it -- because
    // nothing has been observed. It is not failed, and it is not succeeded.
    expect(viewed.data.id).toBe(created.data.id);
    expect(viewed.data.state).toBe("queued");
    expect(viewed.data.terminalState).toBeNull();
    expect(viewed.data.target.name).toBe("web-07");
  });

  it("and the estate is still the estate: the created VM is not in it", async () => {
    await vMCreate({
      name: "web-08",
      node: "accra-desk-01",
      purpose: "workload",
      cores: 1,
      memoryBytes: 536_870_912,
    });

    const list = await vMList({ q: "web-08", size: 50 });
    if (list.status !== 200) throw new Error("unreachable");

    // The honest half. A mock that created the VM would be claiming work it did
    // not do, and the next read would quietly agree with itself.
    expect(list.data.items).toEqual([]);
  });
});

describe("VMUpdate is served, and answers the branch it can honestly answer", () => {
  it("accepts a partial change with a Task rather than claiming the change is done", async () => {
    const response = await vMUpdate("kumasi-web-01", { purpose: "service", cores: 4 });
    if (response.status !== 202) throw new Error(`expected a Task, got ${response.status}`);

    expect(response.data.kind).toBe("vm_update");
    expect(response.data.state).toBe("queued");
    expect(response.data.target.name).toBe("kumasi-web-01");
  });

  it("leaves the VM as the estate describes it", async () => {
    const before = await vMView("kumasi-web-01");
    await vMUpdate("kumasi-web-01", { purpose: "service" });
    const after = await vMView("kumasi-web-01");

    if (before.status !== 200 || after.status !== 200) throw new Error("unreachable");
    expect(after.data.purpose).toBe(before.data.purpose);
    expect(after.data.updated).toBe(before.data.updated);
  });

  it("refuses a CPU model the estate does not offer, by name", async () => {
    // R63: the floor is the lowest common denominator, and an unsupported model
    // is refused rather than silently floored -- silently flooring would hand the
    // operator a machine that is not the one they asked for. This is the refusal
    // the estate has an actual basis for; it has no way to know whether a shrink
    // would need the guest stopped, and inventing that basis would be a mock
    // guessing at state it does not have.
    const response = await vMUpdate("kumasi-web-01", { cpuModel: "x86-64-v2-AES" });
    if (response.status !== 400) throw new Error(`expected a refusal, got ${response.status}`);

    expect(response.data.details?.map((detail) => detail.constraint)).toContain(
      "unsupportedCpuModel",
    );
  });

  it("refuses a resize below the minimum, with the field named", async () => {
    const response = await vMUpdate("kumasi-web-01", { memoryBytes: 536_870_911 });
    if (response.status !== 400) throw new Error(`expected a refusal, got ${response.status}`);

    // A refusal names the field and the constraint, so a form can put it on the
    // control that caused it.
    expect(response.data.details?.map((detail) => detail.path)).toContain("memoryBytes");
  });

  it("refuses a VM nothing answers to", async () => {
    const response = await vMUpdate("no-such-vm", { purpose: "workload" });
    expect(response.status).toBe(404);
    if (response.status === 404) {
      expect(response.data.code).toBe("not_found");
    } else {
      throw new Error(`expected 404, got ${response.status}`);
    }
  });
});

describe("a repeatable purpose filter asks the question one value cannot", () => {
  it("returns only the purposes asked for", async () => {
    const ours = await vMList({ purpose: ["infrastructure", "service"], size: 200 });
    if (ours.status !== 200) throw new Error("unreachable");

    // The estate's own machines: the overlay, the control plane, a Dokploy host.
    // The spec calls a service host infrastructure, so it belongs with these and
    // not with the boxes handed to an operator.
    expect(ours.data.items.length).toBeGreaterThan(0);
    for (const vm of ours.data.items) {
      expect(["infrastructure", "service"]).toContain(vm.purpose);
    }
  });

  it("returns the operator's own machines on their own", async () => {
    const theirs = await vMList({ purpose: ["workload"], size: 200 });
    if (theirs.status !== 200) throw new Error("unreachable");

    for (const vm of theirs.data.items) expect(vm.purpose).toBe("workload");
  });

  it("the two views are disjoint, and together they are the whole estate", async () => {
    const all = await vMList({ size: 200 });
    const ours = await vMList({ purpose: ["infrastructure", "service"], size: 200 });
    const theirs = await vMList({ purpose: ["workload"], size: 200 });
    if (all.status !== 200 || ours.status !== 200 || theirs.status !== 200) {
      throw new Error("unreachable");
    }

    // A VM appearing in both is the confusion this filter exists to remove.
    expect(ours.data.items.map((vm) => vm.id)).not.toEqual(
      expect.arrayContaining(theirs.data.items.map((vm) => vm.id)),
    );
    expect(ours.data.items.length + theirs.data.items.length).toBe(all.data.items.length);
  });
});
