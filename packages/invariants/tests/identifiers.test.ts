import { describe, expect, it } from "vitest";

import { claimedPrefix, idProblem, isWellFormed, prefixMap, servedIds } from "../src/identifiers";
import { acknowledgedId, probeResponses, wireIdentifierProblems } from "../src/wire";
import { identifierViolations } from "../src/identifiers";
import { formatAll, poorlyFormed } from "../src/violation";
import { readDocument } from "../src/repo";
import { ID_PREFIXES, estateFor } from "@sovren/fakes";
import { ACKNOWLEDGED_IDENTIFIER_PREFIXES } from "../src/acknowledged";

/**
 * Invariant 4: every fixture identifier the mock backend serves is well-formed,
 * so a malformed one fails the build rather than rendering a broken row.
 *
 * The rule is imported from `packages/fakes` rather than restated, and the seam
 * is the *wire* rather than the source text. Both choices have a reason, and both
 * were arrived at by getting it wrong first: a source-text scan flagged other
 * packages' negative controls, which are malformed on purpose.
 *
 * Reading the wire is also strictly more capable. The identifiers the backend
 * *mints* for a create it does not perform never pass through the world builder,
 * so the world builder's own check cannot see them — and they are the only
 * identifiers the mock serves that are not sovren identifiers. This suite found
 * them, and they are acknowledged with a reason rather than left to be discovered
 * as a broken link.
 */

const document = readDocument();
const responses = await probeResponses(document);
const prefixes = prefixMap(ID_PREFIXES);

describe("the rule is the world builder's, not a second copy", () => {
  it("imports the pattern rather than restating it", () => {
    // If this ever fails, the fix is to import rather than to re-declare: a
    // second pattern is a second thing to keep in step, and it would eventually
    // disagree with the first -- at which point the world builder would reject
    // ids the console accepts, or the reverse, and the disagreement would look
    // like a data bug rather than a configuration one.
    expect(isWellFormed("nd_01hq2v7xk3", "node")).toBe(true);
    expect(isWellFormed("nd_01hq2v7xk3", "vm")).toBe(false);
    expect(claimedPrefix("nd_01hq2v7xk3")).toBe("nd");
    expect(idProblem("nd_01hq2v7xk3", prefixes)).toBeNull();
  });

  it("rejects the near-misses a prefix-only scan would let through", () => {
    // Both halves of the rule matter, and they have different causes. A wrong
    // length is a typo. A wrong prefix is a belief about the world -- an author
    // who thought a VM was a Node -- and both are strings, so nothing but the
    // prefix check catches it.
    // Wrong length: a typo, in either direction.
    expect(idProblem("nd_01hq2n001", prefixes)).toMatch(/ten Crockford/);
    expect(idProblem("nd_01hq2n00012", prefixes)).toMatch(/ten Crockford/);
    // No resource prefix at all: a name where a key belongs.
    expect(idProblem("xx_01hq2n001", prefixes)).toMatch(/rather than one of sovren/);
    // A readable label in an id field. This is the real shape of the mistake, and
    // it type-checks: the field is a `string`.
    expect(idProblem("st_accra", prefixes)).toMatch(/ten Crockford/);
    // And the boundary of what this can see, asserted rather than left implied: a
    // well-formed id whose prefix names a different resource passes, because a
    // response body does not say which kind of row it is on. The per-resource
    // check that does catch it lives in packages/client/tests/contract.test.ts,
    // read off the document, and the two together are what cover both halves.
    expect(idProblem("nd_01hq2v0013", prefixes)).toBeNull();
    expect(isWellFormed("nd_01hq2v0013", "node")).toBe(true);
    expect(isWellFormed("nd_01hq2v0013", "vm")).toBe(false);
  });
});

describe("every identifier the mock backend serves is a sovren identifier", () => {
  it("finds none that are malformed", () => {
    const problems = wireIdentifierProblems(responses);
    const violations = identifierViolations(problems);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("actually read the responses, from both the read and the write path", () => {
    // Without this, the check above passes on an empty response set, which is
    // the failure mode a wire probe is most prone to. Asserted two ways: many
    // bodies, and at least one from the write path — because the write path is
    // the one that *mints* identifiers rather than reading them, and minting is
    // where the acknowledged family lives.
    expect(responses.length).toBeGreaterThan(10);
    expect(responses.map((response) => response.where)).toContain("POST /vms");
    expect(responses.every((response) => response.status < 400)).toBe(true);
    const ids = responses.flatMap((response) => servedIds(response.body, response.where));
    expect(ids.length).toBeGreaterThan(200);
  });

  it("read the estate rather than a fixture of its own", () => {
    // Every probe address resolves against the real estate, so a fixture rename
    // makes the probe fail loudly rather than silently probe nothing.
    const body = responses.find((response) => response.where === "GET /vms")?.body as {
      items?: { name?: string }[];
    };
    // The name is read off the estate rather than hard-coded, which is what makes
    // this assertion possible at all: a probe that named a row itself would be
    // asserting its own assumption.
    const estate = estateFor("fleet");
    expect(body.items?.map((row) => row.name)).toContain(estate.vms[0]?.name);
  });

  it("catches an id that is one character short", () => {
    // The negative control, in the shape the bug actually takes: a body whose id
    // is the right prefix and the wrong length. The estate is a value, so it is
    // cloned and doctored rather than written to disk.
    const doctored = structuredClone(responses);
    const first = doctored.find((response) => response.where === "GET /vms");
    const body = first?.body as { items: { id: string }[] };
    body.items[0]!.id = "vm_01hq2v9cd";

    const problems = wireIdentifierProblems(doctored);
    expect(problems.map((entry) => entry.id)).toContain("vm_01hq2v9cd");
    expect(problems[0]?.problem).toContain("ten Crockford");
  });

  it("catches a name written where an id belongs", () => {
    // The confusion a body on the wire can actually reveal: a readable label in
    // a field the document types as an opaque key. Nothing resolves it, so the
    // row renders blank rather than failing loudly.
    const doctored = structuredClone(responses);
    const body = doctored.find((response) => response.where === "GET /vms")?.body as {
      items: { id: string; site: { id: string } }[];
    };
    body.items[0]!.site.id = "accra-lab";

    const problems = wireIdentifierProblems(doctored);
    expect(problems.map((entry) => entry.id)).toContain("accra-lab");
    expect(problems[0]?.where).toMatch(/\.site\.id$/);
  });

  it("catches an id buried three levels down, and says where it was", () => {
    // The depth matters: a Task's target link and a VM's transitional task are
    // both ids a screen renders as links, and both are several levels below the
    // response root. A walk that stopped at the first level would miss them, and
    // the message has to name the path so the reader can find the fixture.
    const doctored = structuredClone(responses);
    const body = doctored.find((response) => response.where === "GET /vms")?.body as {
      items: { transitionalTask: { id: string } | null }[];
    };
    const withTask = body.items.find((row) => row.transitionalTask !== null);
    expect(withTask, "the estate has a transitional VM to probe").toBeDefined();
    withTask!.transitionalTask!.id = "tk_01hq2w3ab";

    const problems = wireIdentifierProblems(doctored);
    expect(problems.length).toBe(1);
    expect(problems[0]?.where).toMatch(/^GET \/vms\.items\[\d+\]\.transitionalTask\.id$/);
  });

  it("reports every malformed identifier, not just the first", () => {
    // A fixture wrong in three ways should be fixed in one pass — the same
    // reasoning as the estate's consistency check, for the same reason.
    const doctored = structuredClone(responses);
    const body = doctored.find((response) => response.where === "GET /vms")?.body as {
      items: { id: string }[];
    };
    for (const row of body.items.slice(0, 3)) row.id = "vm_01hq2v9cd";

    expect(wireIdentifierProblems(doctored).length).toBe(3);
  });

  it("names the response the identifier came from", () => {
    const doctored = structuredClone(responses);
    const body = doctored.find((response) => response.where === "GET /peers")?.body as {
      items: { id: string }[];
    };
    body.items[0]!.id = "pr_01hq2s0ab";

    const violations = identifierViolations(wireIdentifierProblems(doctored));
    expect(violations[0]?.what).toBe("pr_01hq2s0ab");
    expect(violations[0]?.detail).toContain("GET /peers");
    expect(violations[0]?.remedy).toContain("fleet.ts");
  });

  it("leaves a well-formed id alone", () => {
    // The negative control in the other direction. A check that flagged every id
    // would be reporting the estate's several hundred good identifiers as loudly
    // as one bad one.
    expect(wireIdentifierProblems(responses)).toEqual([]);
  });
});

describe("the acknowledged identifier family is load-bearing, and says why", () => {
  it("the one on record really is served, and really is malformed", () => {
    // An acknowledgement list that is never shown to be load-bearing is a list
    // nobody has checked. This proves the entry covers something real, and that
    // the thing it covers would otherwise fail.
    const unmasked = wireIdentifierProblems(responses, () => false);
    const pending = unmasked.filter((entry) => acknowledgedId(entry.id));
    expect(pending.length).toBeGreaterThan(0);
    for (const entry of pending) {
      expect(entry.id).toMatch(/^(tk|vm)_pending-/);
    }

    // And with the acknowledgement in place, the same set is clean.
    expect(wireIdentifierProblems(responses)).toEqual([]);
  });

  it("the one on record is the family the backend mints for a create", () => {
    const created = responses.find((response) => response.where === "POST /vms")?.body as {
      id: string;
      target: { id: string };
    };
    expect(acknowledgedId(created.id)).toBe(true);
    expect(acknowledgedId(created.target.id)).toBe(true);
  });

  it("each reason explains the deviation rather than excusing it", () => {
    // "out of scope" is not a reason. The bar here is that each reason says what
    // the id is for, why it cannot be a sovren id, and what an operator sees if
    // they follow it — because following it and getting `not_found` is the
    // intended behaviour and the reason has to make that legible.
    for (const [prefix, reason] of Object.entries(ACKNOWLEDGED_IDENTIFIER_PREFIXES)) {
      expect(reason.length, `${prefix}'s reason is a stub`).toBeGreaterThan(200);
      expect(reason, `${prefix}'s reason names no cause`).toMatch(
        /estate|create|queued|control plane/,
      );
      expect(reason, `${prefix}'s reason does not say what an operator sees`).toMatch(
        /not_found|does not exist|resolves to nothing/,
      );
    }
  });

  it("covers nothing beyond the family it names", () => {
    // The negative control on the acknowledgement itself. An over-broad prefix
    // would silently excuse a real malformed id later, and the only way to know
    // is to ask what the acknowledgement actually matches.
    expect(acknowledgedId("vm_01hq2v9cd2")).toBe(false);
    expect(acknowledgedId("nd_01hq2n0001")).toBe(false);
    expect(acknowledgedId("st_accra")).toBe(false);
    expect(acknowledgedId("tk_pending-")).toBe(true);
  });
});

describe("every identifier failure is actionable", () => {
  it("names the field, the response, and the two ways to fix it", () => {
    const doctored = structuredClone(responses);
    const body = doctored.find((response) => response.where === "GET /vms")?.body as {
      items: { id: string }[];
    };
    body.items[0]!.id = "vm_01hq2v9cd";

    const violations = identifierViolations(wireIdentifierProblems(doctored));
    expect(violations).toHaveLength(1);
    expect(poorlyFormed(violations)).toEqual([]);
    expect(violations[0]?.detail).toContain("renders blank");
    expect(violations[0]?.remedy).toContain("ACKNOWLEDGED_IDENTIFIER_PREFIXES");
    expect(violations[0]?.remedy).toContain("handlers.ts");
  });
});

describe("the walk finds ids at every depth a response nests them", () => {
  it("reads through arrays, objects, and both together", () => {
    const found = servedIds({
      items: [
        { id: "a", target: { id: "b" } },
        { id: "c", nested: { deeper: { id: "d" } } },
      ],
    });
    expect(found.map((entry) => entry.value)).toEqual(["a", "b", "c", "d"]);
  });

  it("records the path it found each id at", () => {
    const found = servedIds({ items: [{ target: { id: "x" } }] }, "GET /tasks");
    expect(found[0]?.where).toBe("GET /tasks.items[0].target.id");
  });

  it("ignores a non-string id rather than crashing on it", () => {
    // A body with `id: null` is a contract bug of its own, and reporting it as a
    // malformed identifier would be a confusing way to say so.
    expect(servedIds({ id: null, name: "x" })).toEqual([]);
    expect(servedIds({ id: 42 })).toEqual([]);
  });
});

describe("the probe covers the surface the console is built against", () => {
  it("read one response per declared read operation", () => {
    // Stated so the probe's coverage is not overclaimed: it reads the reads and
    // one write. `VMDelete` is not probed because nothing serves it, and
    // `TaskLogStream` is not probed because its response is an event stream
    // rather than a JSON body — both are recorded in acknowledged.ts, and the
    // coverage check is what holds that record honest.
    const where = responses.map((response) => response.where);
    expect(where).toContain("GET /nodes");
    expect(where).toContain("GET /vms");
    expect(where).toContain("GET /tasks");
    expect(where).toContain("GET /connections");
    expect(where).toContain("POST /vms");
    expect(where).not.toContain("DELETE /vms/{vm}");
  });

  it("paged large enough to read every row the first page carries", () => {
    // A probe that read only the first ten of forty rows would report a clean
    // result over a fixture that has a malformed id in row thirty.
    const body = responses.find((response) => response.where === "GET /vms")?.body as {
      items: unknown[];
      nextPage: string | null;
    };
    expect(body.nextPage).toBeNull();
    expect(body.items.length).toBeGreaterThan(10);
  });
});
