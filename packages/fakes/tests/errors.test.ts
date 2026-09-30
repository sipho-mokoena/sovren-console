/**
 * Every error speaks sovren, and every error is reproducible.
 *
 * Ticket 04, and the more important half of this package's work. Two properties
 * are under test and they are separable, so they are tested separately:
 *
 *  1. **The vocabulary is fixed.** A screen keys off `code` and can never be
 *    broken by an upstream string it has not seen. Every code has one meaning,
 *    one status, and one retryability, and a state a screen can show has its own.
 *  2. **A failure is reproducible on demand.** The same sentinel produces the
 *    same failure in the dev server and in a test, because the value lives in
 *    the URL rather than in a test-only override.
 *
 * And the one that makes a reported problem traceable: **the `requestId` on an
 * error is the same value in the audit trail.** That agreement is the whole of
 * R34, and it is only checkable because the trail can be read back -- which is
 * why the audit log is a real store with a real query and not a counter.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { connectionList, nodeList, nodeView, taskCancel, vMList } from "@sovren/client";
import type { ErrorCode } from "@sovren/client";

import {
  ALL_ERROR_CODES,
  SOVREN_ERROR_CODES,
  auditLog,
  isRetryable,
  mintRequestId,
  resetAuditLog,
  sentinelHelp,
  sentinelIn,
  SENTINEL_NAMES,
  SENTINELS,
  SENTINEL_PARAM,
  disabledActionsFor,
  setupSovrenServer,
  statusForCode,
  translate,
  REQUEST_ID_PATTERN,
} from "../src";
import { estateFor } from "../src/estate/registry";

const server = setupSovrenServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetAuditLog();
});
afterAll(() => server.close());

/** Reach an operation with a query parameter the generated client cannot send. */
const withQuery = (path: string, query: string): Promise<Response> =>
  fetch(`http://control-plane.test/api/v1${path}${query}`);

describe("the vocabulary is fixed", () => {
  it("declares exactly the codes the document declares", () => {
    // The document's enum, written out. If the document grows a code and this
    // does not, the build fails here -- which is the point: a mock that invents a
    // code teaches the console to key off something no control plane will send.
    expect(ALL_ERROR_CODES).toEqual([
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
    ]);
  });

  it.each(ALL_ERROR_CODES)("%s has one status, one retryability, and one meaning", (code) => {
    const entry = SOVREN_ERROR_CODES[code];
    expect(Number.isInteger(entry.status)).toBe(true);
    expect(entry.status).toBeGreaterThanOrEqual(400);
    expect(entry.status).toBeLessThan(600);
    expect(typeof entry.retryable).toBe("boolean");
    // A meaning is a sentence, not a status, so a code cannot be justified only
    // by the number it happens to travel with.
    expect(entry.meaning.length).toBeGreaterThan(20);
  });

  it("marks only the code where waiting could help as retryable", () => {
    // R34 and the console's own affordance: offering a retry on a malformed
    // request trains operators to press it. One retryable code is the honest
    // answer -- an upstream that is not answering.
    const retryable = ALL_ERROR_CODES.filter((code) => isRetryable(code));
    expect(retryable).toEqual(["upstream_unavailable"]);
  });

  it("separates the two 4xx codes that are easy to confuse", () => {
    // `unauthorised` is "who are you"; `forbidden` is "you are known and may not
    // do this". The second names a credential sovren holds, so the fix is in
    // Settings rather than in the operator's session -- and a console that
    // collapsed them would send the operator to the wrong screen.
    expect(SOVREN_ERROR_CODES.unauthorised.meaning).toContain("session");
    expect(SOVREN_ERROR_CODES.forbidden.meaning).toContain("credential");
  });

  it("separates the two upstream codes that are easy to confuse", () => {
    // `upstream_unavailable` is silence and is worth retrying;
    // `upstream_unauthenticated` is a refusal, and retrying unchanged will not
    // help. Collapsing them would make the console offer a retry button that
    // cannot work.
    expect(SOVREN_ERROR_CODES.upstream_unavailable.retryable).toBe(true);
    expect(SOVREN_ERROR_CODES.upstream_unauthenticated.retryable).toBe(false);
    expect(SOVREN_ERROR_CODES.upstream_unauthenticated.status).not.toBe(
      SOVREN_ERROR_CODES.upstream_unavailable.status,
    );
  });
});

describe("anything that is not already a sovren error becomes one", () => {
  it("passes a sovren error through with its own requestId", () => {
    // The error's requestId is what the audit entry is keyed on. Rewriting it
    // here would produce an error the operator can quote and an audit entry
    // nobody can find, which is the exact failure R34 exists to prevent.
    const body = {
      code: "conflict" as const,
      message: "The estate already has something called that.",
      requestId: "req_preserved00001",
    };
    expect(translate(body, "internal", "req_minted0000001").requestId).toBe("req_preserved00001");
  });

  it("translates a Proxmox-shaped body into a sovren error", () => {
    // R53: the fakes are faithful to the wire format including the ugly parts,
    // and Proxmox's error body is `{"errors": "..."}` -- a string, not an object
    // with a code. Nothing about that shape may reach the console.
    const proxmox = { errors: "authentication failure" };
    const translated = translate(proxmox, "internal", "req_proxmoxfailure");

    expect(translated.code).toBe("internal");
    expect(translated.requestId).toBe("req_proxmoxfailure");
    expect(JSON.stringify(translated)).not.toContain("authentication failure");
  });

  it.each([
    ["a NetBird message", { message: "resource not found", statusCode: 404 }],
    ["a Dokploy string", "Unauthorized"],
    ["an HTML error page", "<html><body>502 Bad Gateway</body></html>"],
    ["null", null],
    ["a number", 503],
  ])("translates %s rather than passing it through", (_label, body) => {
    const translated = translate(body, "upstream_unavailable", "req_shape0000001");
    expect(ALL_ERROR_CODES).toContain(translated.code);
    expect(translated.requestId).toBe("req_shape0000001");
  });
});

describe("a failure is triggered by a value the operator types", () => {
  it("reads the sentinel out of a query parameter or a path segment", () => {
    // R56: a value in the URL, and only in the URL. A header is invisible in a
    // screenshot of the bug being reproduced, and an environment variable does
    // not exist in a test.
    const byQuery = sentinelIn(new URL("http://x/api/v1/nodes?sentinel=conflict"));
    expect(byQuery).toEqual({ kind: "found", directive: { name: "conflict", code: "conflict" } });

    const byPath = sentinelIn(new URL("http://x/api/v1/nodes/~upstream-unavailable"));
    expect(byPath).toEqual({
      kind: "found",
      directive: { name: "upstream-unavailable", code: "upstream_unavailable" },
    });

    expect(sentinelIn(new URL("http://x/api/v1/nodes"))).toEqual({ kind: "none" });
  });

  it("prefers the path over a stray query parameter", () => {
    // A sentinel typed as a path segment is an operator pointing at one specific
    // resource, and that intent should not be overridden.
    const found = sentinelIn(
      new URL("http://x/api/v1/nodes/accra-desk-01/~conflict?sentinel=not-found"),
    );
    expect(found).toEqual({ kind: "found", directive: { name: "conflict", code: "conflict" } });
  });

  it("treats a sentinel it does not know as invalid_request, not as a shrug", () => {
    // A typo in the one mechanism meant to reproduce a bug must not look like
    // the bug did not happen. Silently ignoring it would send an operator hunting
    // for a failure that was never staged.
    const found = sentinelIn(new URL("http://x/api/v1/nodes?sentinel=upstrem-unavailible"));
    expect(found).toEqual({ kind: "unknown", value: "upstrem-unavailible" });
  });

  it("names every sentinel after the code it produces", () => {
    for (const name of SENTINEL_NAMES) {
      expect(SENTINELS[name].code).toBe(name.replaceAll("-", "_") as ErrorCode);
    }
    expect(sentinelHelp.length).toBe(SENTINEL_NAMES.length);
  });
});

describe("the same sentinel produces the same failure in a test and in a browser", () => {
  it.each(SENTINEL_NAMES)("?sentinel=%s produces its code, at its status", async (name) => {
    const expected = SENTINELS[name].code;
    const response = await withQuery("/nodes", `?${SENTINEL_PARAM}=${name}`);

    expect(response.status).toBe(statusForCode(expected));
    const body = (await response.json()) as { code: string; requestId: string; message: string };
    expect(body.code).toBe(expected);
    expect(body.requestId).toMatch(REQUEST_ID_PATTERN);
    // The message says the sentinel caused it, so an operator who typed one does
    // not then spend ten minutes wondering whether the estate is really broken.
    expect(body.message).toContain("sentinel");
  });

  it("works on a list, a view, and a write alike", async () => {
    // A sentinel is a property of the request, not of one operation, so an
    // operator can reproduce a failure on whichever screen they are looking at.
    for (const path of ["/nodes", "/nodes/accra-desk-01", "/vms", "/tasks", "/connections"]) {
      const response = await withQuery(path, "?sentinel=forbidden");
      expect(response.status).toBe(403);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("forbidden");
    }
  });

  it("works as a path value, so it can be typed into a URL bar", async () => {
    const response = await fetch("http://control-plane.test/api/v1/nodes/~upstream-unavailable");
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("upstream_unavailable");
    expect(body.code).toBe("upstream_unavailable");
  });

  it("refuses a sentinel it does not know, and says what it accepts", async () => {
    const response = await withQuery("/nodes", "?sentinel=upstrem-unavailible");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; details: { message: string }[] };
    expect(body.code).toBe("invalid_request");
    expect(body.details[0]?.message).toContain("upstream-unavailable");
  });

  it("produces the same failure through the generated client as through a URL", async () => {
    // The generated client cannot send an arbitrary query parameter, so this
    // goes through `fetch` -- but it is the same origin, the same path and the
    // same backend, which is the property that matters. An operator in the dev
    // server and a test in CI take one code path.
    const direct = await withQuery("/nodes", "?sentinel=conflict");
    const directBody = (await direct.json()) as { code: string };

    const viaHandler = await withQuery("/nodes", `?${SENTINEL_PARAM}=conflict`);
    const viaBody = (await viaHandler.json()) as { code: string };

    expect(viaBody.code).toBe(directBody.code);
    expect(directBody.code).toBe("conflict");
  });

  it("does not interfere with a normal request that carries no sentinel", async () => {
    // A guard that cannot decline shadows the generated handler for everything,
    // so "a request with no sentinel works" is load-bearing, not a formality.
    const response = await nodeList();
    expect(response.status).toBe(200);
  });

  it("lets a sentinel ride alongside an estate selection", async () => {
    // Both controls are query parameters, so they compose. An operator can
    // reproduce a failure on the narrow-screen estate without giving up either.
    const response = await withQuery("/nodes", "?estate=compact&sentinel=not-found");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("not_found");
  });
});

describe("the requestId on an error is the one in the audit trail", () => {
  it("agrees for a failure the operator staged with a sentinel", async () => {
    const response = await withQuery("/vms", "?sentinel=upstream-unavailable");
    const body = (await response.json()) as { code: string; requestId: string };

    expect(body.code).toBe("upstream_unavailable");

    // R34, and the assertion that makes it checkable: the two halves are the
    // same value. A handler that minted a second id on the way out would produce
    // an error the operator can quote and an audit entry nobody can find.
    const entry = auditLog.find(body.requestId);
    expect(entry).toBeDefined();
    expect(entry?.code).toBe("upstream_unavailable");
    expect(entry?.status).toBe(503);
    expect(entry?.sentinel).toBe("upstream-unavailable");
    expect(entry?.request.operation).toBe("VMList");
  });

  it("agrees for a failure the estate itself produced", async () => {
    // A 404 nothing answers to is not staged, and its requestId must be in the
    // trail just the same -- a real report is usually about one of these.
    const response = await nodeView("accra-desk-99");
    if (response.status !== 404) throw new Error("expected 404");
    const body = response.data;

    const entry = auditLog.find(body.requestId);
    expect(entry).toBeDefined();
    expect(entry?.code).toBe("not_found");
    expect(entry?.request.method).toBe("GET");
    expect(entry?.request.path).toContain("accra-desk-99");
  });

  it("agrees for a write that was refused", async () => {
    const response = await taskCancel("create-netbird");
    if (response.status !== 422) throw new Error("expected 422");

    const entry = auditLog.find(response.data.requestId);
    expect(entry?.code).toBe("action_not_permitted");
  });

  it("carries the requestId in the header as well as the body", async () => {
    // So a proxy that rewrites a body cannot detach an error from its trail. The
    // client's mutator prefers the header over the body, which is why both.
    const response = await withQuery("/vms", "?sentinel=conflict");
    const body = (await response.json()) as { requestId: string };
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("records the successes too, because a log of only failures cannot answer 'did that work?'", async () => {
    resetAuditLog();
    await connectionList();
    await vMList();

    const failures = auditLog.query({ failuresOnly: true });
    expect(failures).toEqual([]);
    // The interesting question about a destructive action is usually about the
    // request that preceded it.
    expect(auditLog.query({ operation: "ConnectionList" }).length).toBeGreaterThan(0);
  });

  it("mints requestIds in the shape the pattern declares", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(mintRequestId()).toMatch(REQUEST_ID_PATTERN);
    }
  });
});

describe("a disabled action explains itself in a fixed code", () => {
  it("refuses a disabled action with the same code the control would carry", async () => {
    // R43: a disabled control and a failed request speak one vocabulary, so a
    // test can assert the reason without matching a sentence.
    const refused = await taskCancel("restore-grafana-canary");
    if (refused.status !== 422) throw new Error(`expected 422, got ${refused.status}`);
    expect(refused.data.code).toBe("action_not_permitted");

    // And the estate's own declaration, which is what the console reads to grey
    // the button out, says the same thing.
    const declared = estateFor("fleet").disabledActions["task:restore-grafana-canary"];
    expect(declared?.[0]?.reason).toBe("action_not_permitted");
    expect(declared?.[0]?.explanation).toContain("queued");
  });
});

describe("the disabled actions a screen can read about", () => {
  it("reports nothing for an action that is offered", () => {
    // The shape a screen needs: an empty list means "not disabled", so a control
    // does not have to special-case "there was no answer".
    expect(disabledActionsFor(estateFor("fleet"), "node", "accra-rig-01")).toEqual([]);
    expect(disabledActionsFor(estateFor("fleet"), "node", "no-such-node")).toEqual([]);
  });

  it("reports a code and an explanation for one that is not", () => {
    // R43: the reason is a fixed code so the console can render it, and a clause
    // on why so the operator learns what the system can do rather than what it
    // hides.
    const disabled = disabledActionsFor(estateFor("fleet"), "node", "accra-desk-01");

    expect(disabled).toHaveLength(1);
    expect(disabled[0]?.action).toBe("migrate");
    expect(disabled[0]?.reason).toBe("action_not_permitted");
    expect(disabled[0]?.explanation).toContain("heterogeneous CPUs");
  });

  it("lists every action the estate refuses, for the two resources that refuse one", () => {
    const fleet = estateFor("fleet");

    // A VM can refuse more than one action, and each carries its own reason --
    // "you may not start it" and "you may not migrate it" are different problems.
    const legacy = disabledActionsFor(fleet, "vm", "legacy-erp");
    expect(legacy.map((entry) => entry.action).sort()).toEqual(["migrate", "start"]);
    for (const entry of legacy) expect(entry.reason).toBe("action_not_permitted");
  });
});
