import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { nodeList, nodeView, taskCancel, taskList, vMCreate, vMList } from "../src/generated";
import { getNodeListMockHandler } from "../src/generated/node/node.msw";
import { getVMCreateMockHandler } from "../src/generated/vm/vm.msw";

/**
 * The seam: the generated client over HTTP, against the generated handlers.
 *
 * Nothing here is hand-written on either side of the wire. The handler comes
 * from orval, the call comes from orval, and the only sovren-authored code in
 * between is the mutator. If these tests pass, the document produced a client
 * and a mock that agree, which is the property the whole chain exists for.
 */
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("returns a page of Nodes in sovren's envelope, without throwing", async () => {
  server.use(
    getNodeListMockHandler({
      items: [
        {
          id: "nd_01hq2v7xk3",
          name: "accra-desk-01",
          site: { id: "st_accra", name: "Accra", description: "Main lab" },
          status: "online",
          cpuModel: "Intel Core i5-4590",
          cores: 4,
          sockets: 1,
          memoryBytes: 8_589_934_592,
          maxMemoryBytes: 8_589_934_592,
          driveCount: 2,
          overlay: { address: "100.64.0.11", hostname: "accra-desk-01" },
          vmCount: 3,
          uptimeSeconds: 918_233,
          proxmoxVersion: "9.2.4",
          canMigrate: false,
          created: "2026-03-02T09:14:00Z",
          updated: "2026-09-28T18:02:00Z",
        },
      ],
      nextPage: null,
    }),
  );

  const response = await nodeList();

  // The union is discriminated on status, so reading the page requires saying
  // the request succeeded. This narrowing is the whole of R35: a call site
  // cannot get to `items` without dealing with failure.
  expect(response.status).toBe(200);
  if (response.status !== 200) throw new Error("expected a page of Nodes");

  expect(response.data.items).toHaveLength(1);
  expect(response.data.items[0]?.name).toBe("accra-desk-01");
  expect(response.data.nextPage).toBeNull();
});

it("translates an upstream failure into sovren's error vocabulary, without throwing", async () => {
  server.use(
    http.get("*/api/v1/nodes", () =>
      // Not a sovren error. A Proxmox-shaped string the console has never seen.
      HttpResponse.json({ errors: "authentication failure" }, { status: 500 }),
    ),
  );

  const response = await nodeList();

  expect(response.status).toBe(500);
  if (response.status === 200) throw new Error("expected a failure");

  expect(response.data).toMatchObject({
    code: "upstream_unavailable",
    retryable: true,
  });
  // R34: the requestId is what makes a user-reported problem traceable, so it
  // must be present on the failure and not invented at the call site.
  expect(response.data.requestId).toBeTruthy();
});

it("carries a 404 through as not_found rather than a bare status", async () => {
  server.use(http.get("*/api/v1/nodes/:node", () => new HttpResponse(null, { status: 404 })));

  const response = await nodeView("ghost");

  expect(response.status).toBe(404);
  if (response.status === 200) throw new Error("expected a failure");

  expect(response.data).toMatchObject({ code: "not_found" });
});

/**
 * The rest of the chain, over the same wire. These carry the three states a VM
 * list row has to tell apart and the one rule about long work, because those
 * are the parts a screen cannot recover if the contract is loose about them.
 */

const runningTask = {
  id: "tk_01hq2w3ab4",
  name: "create web-01",
  kind: "vm_create",
  target: { resource: "vm", id: "vm_01hq2v9cd2", name: "web-01" },
  state: "running",
  terminalState: null,
  failureReason: null,
  cancelledReason: null,
  startedAt: "2026-09-29T03:40:12Z",
  finishedAt: null,
  lastSeq: 412,
  logCount: 412,
  created: "2026-09-29T03:40:10Z",
  updated: "2026-09-29T03:40:12Z",
} as const;

it("answers a create with 202 and a Task, not a VM", async () => {
  // A four-minute boot cannot complete inside a request. What comes back is the
  // Task to watch, and the status is a member of the union rather than a guess.
  server.use(getVMCreateMockHandler(runningTask));

  const response = await vMCreate({
    node: "accra-desk-01",
    name: "web-01",
    purpose: "workload",
    cores: 2,
    memoryBytes: 2_147_483_648,
  });

  expect(response.status).toBe(202);
  if (response.status !== 202) throw new Error("expected the create to be accepted");

  expect(response.data.id).toBe("tk_01hq2w3ab4");
  expect(response.data.state).toBe("running");
  expect(response.data.terminalState).toBeNull();
});

it("keeps a VM in flight distinct from one that is stopped, and from one that failed", async () => {
  const vm = {
    id: "vm_01hq2v9cd2",
    name: "web-01",
    node: { id: "nd_01hq2v7xk3", name: "accra-desk-01" },
    site: { id: "st_accra", name: "Accra", description: "Main lab" },
    purpose: "workload",
    cpuModel: "kvm64",
    cores: 2,
    memoryBytes: 2_147_483_648,
    diskBytes: 34_359_738_368,
    runState: "transitional",
    // Mid-create: no overlay address yet, and the work in flight is named, so a
    // screen can link to it rather than only say something is happening.
    overlay: null,
    transitionalTask: { id: runningTask.id, kind: runningTask.kind, state: runningTask.state },
    failureReason: null,
    canMigrate: false,
    isTemplate: false,
    created: "2026-09-29T03:40:10Z",
    updated: "2026-09-29T03:40:12Z",
  };

  server.use(
    http.get("*/api/v1/vms", () =>
      HttpResponse.json({
        items: [
          vm,
          {
            ...vm,
            id: "vm_02",
            name: "db-01",
            runState: "failed",
            failureReason: "cloud-init snippet upload failed: no PAM account configured",
          },
        ],
        nextPage: null,
      }),
    ),
  );

  const response = await vMList();
  if (response.status !== 200) throw new Error("expected a page of VMs");

  const [inFlight, failed] = response.data.items;
  expect(inFlight?.runState).toBe("transitional");
  expect(inFlight?.overlay).toBeNull();
  expect(inFlight?.transitionalTask?.id).toBe("tk_01hq2w3ab4");
  expect(inFlight?.failureReason).toBeNull();

  expect(failed?.runState).toBe("failed");
  expect(failed?.failureReason).toContain("no PAM account configured");
  // The two are distinct states, so a failure can never read as intent.
  expect(failed?.runState).not.toBe("stopped");
});

it("answers a cancel with 202 and the Task, because the process has to actually die", async () => {
  server.use(
    http.post("*/api/v1/tasks/:task/cancel", () =>
      HttpResponse.json(
        {
          ...runningTask,
          state: "cancelled",
          terminalState: "cancelled",
          finishedAt: "2026-09-29T03:41:02Z",
        },
        { status: 202 },
      ),
    ),
  );

  const response = await taskCancel("tk_01hq2w3ab4");

  expect(response.status).toBe(202);
  if (response.status !== 202) throw new Error("expected the cancellation to be accepted");
  expect(response.data.terminalState).toBe("cancelled");
});

it("refuses to cancel a Task that already finished, and says which kind of refusal", async () => {
  server.use(
    http.post("*/api/v1/tasks/:task/cancel", () =>
      HttpResponse.json(
        {
          code: "conflict",
          message: "That task has already succeeded.",
          requestId: "req_01hq2w5ce7",
        },
        { status: 409 },
      ),
    ),
  );

  const response = await taskCancel("tk_01hq2w3ab4");

  expect(response.status).toBe(409);
  if (response.status === 202) throw new Error("expected a refusal");
  expect(response.data.code).toBe("conflict");
  expect(response.data.requestId).toBe("req_01hq2w5ce7");
});

it("finds a task whose target has since been removed, by filtering on the target", async () => {
  // The target is recorded on the Task rather than joined at read time, so a
  // run from last week is still findable after the thing it worked on is gone.
  server.use(
    http.get("*/api/v1/tasks", ({ request }) => {
      expect(new URL(request.url).searchParams.get("target")).toBe("web-01");
      return HttpResponse.json({
        items: [
          {
            ...runningTask,
            state: "failed",
            terminalState: "failed",
            failureReason: "terraform: name collision",
          },
        ],
        nextPage: "eyJvIjoyNX0",
      });
    }),
  );

  const response = await taskList({ target: "web-01" });
  if (response.status !== 200) throw new Error("expected a page of Tasks");

  expect(response.data.items[0]?.failureReason).toBe("terraform: name collision");
  // The token comes back as an opaque string, and is passed back as one.
  expect(response.data.nextPage).toBe("eyJvIjoyNX0");
});

it("sends a create body as JSON, not as a string literal", async () => {
  let seen: unknown;
  server.use(
    http.post("*/api/v1/vms", async ({ request }) => {
      seen = await request.json();
      return HttpResponse.json(
        {
          id: "tk_01hq3",
          kind: "vm_create",
          target: "vm:web-01",
          state: "queued",
          startedAt: "2026-09-29T03:00:00Z",
          finishedAt: null,
          failureReason: null,
          terminalState: null,
          name: "create web-01",
          created: "2026-09-29T03:00:00Z",
          updated: "2026-09-29T03:00:00Z",
        },
        { status: 202 },
      );
    }),
  );

  await vMCreate({
    name: "web-01",
    node: "accra-desk-01",
    purpose: "workload",
    cores: 2,
    memoryBytes: 2_147_483_648,
  });

  // orval hands the mutator an already-stringified body. Re-stringifying it
  // sends `"{\"name\":\"web-01\"}"` -- a JSON string where an object belongs,
  // which the control plane would reject as a body of the wrong shape.
  expect(seen).toEqual({
    name: "web-01",
    node: "accra-desk-01",
    purpose: "workload",
    cores: 2,
    memoryBytes: 2_147_483_648,
  });
});

it("carries field-level details through translation, so a form can point at the control that failed", async () => {
  server.use(
    http.get("*/api/v1/nodes", () =>
      HttpResponse.json(
        {
          code: "invalid_request",
          message: "That combination is not available on this node.",
          requestId: "req_abc123",
          retryable: false,
          details: [
            {
              path: "cpuModel",
              constraint: "unsupportedCpuModel",
              message: "This node cannot run that CPU model.",
            },
          ],
        },
        { status: 400 },
      ),
    ),
  );

  const response = await nodeList();
  if (response.status === 200) throw new Error("expected a failure");

  // A translated error that drops `details` leaves a form with a message and no
  // idea which input caused it. The details are the whole point of R34 here.
  expect(response.data.details).toEqual([
    {
      path: "cpuModel",
      constraint: "unsupportedCpuModel",
      message: "This node cannot run that CPU model.",
    },
  ]);
});
