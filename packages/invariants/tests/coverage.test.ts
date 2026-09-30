import { describe, expect, it } from "vitest";

import {
  coverageViolations,
  endpointKey,
  orphanViolations,
  servingViolations,
  staleAcknowledgementViolations,
} from "../src/checks";
import { normalisePath, servedEndpoints } from "../src/backend";
import { formatAll, poorlyFormed } from "../src/violation";
import { declaredOperations, readDocument, type Document } from "../src/repo";
import { ACKNOWLEDGED_OPERATIONS, ACKNOWLEDGED_SERVING } from "../src/acknowledged";

/**
 * Invariant 5: an operation in the document with no implementation, or an
 * implementation with no operation, fails the build until someone decides.
 *
 * This is the requirement that pays for itself. A spec change that adds an
 * operation should fail the build, and today nothing makes it: orval generates a
 * handler the mock backend never pairs with an estate, the request 404s in the
 * dev server, and the console shows a blank screen. The failure surfaces where
 * the change was made instead of where it was noticed.
 *
 * The endpoints are read off the *live* handler list rather than parsed out of
 * `handlers.ts` as text, because the mock backend's central claim is that the
 * method and path of every endpoint are read off the generated handler. Reading
 * them off the running handlers is reading them off the generator; a text scan
 * would be reading the same claim from a file that could say one thing and do
 * another.
 */

const document = readDocument();
const served = servedEndpoints();

describe("every operation the document declares is either implemented or acknowledged", () => {
  it("has a handler behind it, or a written reason why not", () => {
    const violations = coverageViolations(document, served);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("the coverage check actually compared something", () => {
    // A coverage check that passes because both sides were empty would pass
    // forever. This asserts the check had a subject in both directions.
    expect(declaredOperations(document).length).toBeGreaterThan(15);
    expect(served.length).toBeGreaterThan(15);
  });

  it("fails on an operation the document declares and nothing serves", () => {
    // The negative control, and the one that matters: this is what a spec change
    // that adds an operation looks like from the suite's point of view.
    const extended = structuredClone(document);
    (extended.paths as Record<string, unknown>)["/images"] = {
      get: { operationId: "ImageList", tags: ["Image"], responses: {} },
    };

    const violations = coverageViolations(extended, served);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("ImageList at /images");
    expect(violations[0]?.detail).toContain("will 404 in the dev server");
    expect(violations[0]?.remedy).toContain("ACKNOWLEDGED_OPERATIONS");
    expect(violations[0]?.remedy).toContain("with a reason");
  });

  it("names the operation and the path, not just the method", () => {
    // A failure that says "GET /undeclared" sends the reader to the document
    // with nothing to grep for. The operationId is the thing a person knows,
    // because it is what the console's generated hooks and the mock backend's
    // audit log are named after.
    const extended = structuredClone(document);
    (extended.paths as Record<string, unknown>)["/images"] = {
      get: { operationId: "ImageList", tags: ["Image"], responses: {} },
    };

    const violations = coverageViolations(extended, served);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("ImageList at /images");
    expect(violations[0]?.detail).toContain("GET /images");
  });

  it("joins on the method and path, so renaming an operationId is not a gap", () => {
    // Stated so the check's scope is not overclaimed. MSW matches on method and
    // path, so that is the only honest join: renaming `NodeList` in the document
    // leaves `GET /nodes` served and served correctly. The console's generated
    // hooks are renamed by the regeneration, and the mock backend's guard is
    // handed the new name, so nothing is left dangling. A check that claimed
    // otherwise would be asserting a coupling the architecture deliberately does
    // not have.
    const doctored = structuredClone(document);
    (doctored.paths["/nodes"] as { get: Record<string, unknown> }).get.operationId = "RenamedList";

    expect(coverageViolations(doctored, served)).toEqual([]);
  });

  it("treats an acknowledgement with no reason as an outstanding decision", () => {
    // The negative control for the allowlist itself. A list entry with an empty
    // string is the shape a gap takes when somebody silences a red build by
    // typing a key, and it must not read as a decision. The map is passed in
    // rather than the real one being mutated, so the check's result does not
    // depend on test order.
    const silence = { VMDelete: "" };
    const violations = coverageViolations(document, served, silence);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("VMDelete at /vms/{vm}");
    expect(violations[0]?.detail).toContain("no reason");
    expect(violations[0]?.remedy).toContain("write the reason");
  });
});

describe("an implementation the document does not declare is an orphan", () => {
  it("has none", () => {
    const violations = orphanViolations(document, served);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("catches a handler left behind for a removed operation", () => {
    // The other direction. Not harmless: the endpoint answers requests for
    // something the contract no longer promises, and no future DTO produces it.
    const doctored = structuredClone(document);
    delete (doctored.paths as Record<string, unknown>)["/connections"];
    delete (doctored.paths as Record<string, unknown>)["/connections/{connection}"];

    const violations = orphanViolations(doctored, served);
    // Both operations on the removed resource: the list and the view.
    expect(violations.map((entry) => entry.what)).toEqual([
      "GET /connections",
      "GET /connections/{connection}",
    ]);
    expect(violations[0]?.detail).toContain("no longer declares it");
  });

  it("catches an endpoint nothing but a hand-written handler could serve", () => {
    // The case the generated chain is supposed to make impossible. It is
    // possible exactly once -- by writing a handler by hand -- and this is what
    // catches it.
    const violations = orphanViolations(document, [...served, "GET /images"]);
    expect(violations.map((entry) => entry.what)).toEqual(["GET /images"]);
  });

  it("catches an endpoint at a method the document does not offer", () => {
    // A handler for `POST /nodes` when the document offers only `GET /nodes` is
    // a write the console believes cannot happen.
    const violations = orphanViolations(document, [...served, "POST /nodes"]);
    expect(violations.map((entry) => entry.what)).toEqual(["POST /nodes"]);
  });
});

describe("an operation served unusually is named, with a reason", () => {
  it("every divergence from the generated handler is recorded", () => {
    const violations = servingViolations(document, served);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("the one on record is a real operation the document declares", () => {
    for (const operationId of Object.keys(ACKNOWLEDGED_SERVING)) {
      const declared = declaredOperations(document).find(
        (entry) => entry.operationId === operationId,
      );
      expect(
        declared,
        `${operationId} is listed as served unusually but not declared`,
      ).toBeDefined();
      expect(served, `${operationId} is listed but nothing serves it`).toContain(
        endpointKey(declared!),
      );
    }
  });

  it("every recorded reason says something a reader can act on", () => {
    // "out of scope" is not a reason; "the generated client cannot consume a
    // stream because a return type cannot express one" is. The bar is length and
    // a named cause, and a five-word entry is a smell rather than a failure, so
    // the assertion is that each reason names a mechanism.
    for (const [operationId, reason] of Object.entries(ACKNOWLEDGED_SERVING)) {
      expect(reason.length, `${operationId}'s reason is a stub`).toBeGreaterThan(80);
      expect(reason, `${operationId}'s reason names no cause`).toMatch(
        /generated|generator|document|orval|client/,
      );
    }
  });

  it("catches a recorded divergence for an operation the document dropped", () => {
    const violations = servingViolations(document, served, { GhostList: "because" });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("GhostList");
    expect(violations[0]?.detail).toContain("stale");
  });

  it("catches a recorded divergence nothing serves any more", () => {
    const violations = servingViolations(document, ["GET /nodes"], {
      TaskLogStream: "because",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("TaskLogStream at /tasks/{task}/logs");
    expect(violations[0]?.detail).toContain("nothing serves it");
    expect(violations[0]?.remedy).toContain("ACKNOWLEDGED_OPERATIONS");
  });

  it("catches a recorded divergence whose reason was emptied", () => {
    const violations = servingViolations(document, served, { TaskLogStream: "  " });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("no reason");
  });
});

describe("the acknowledgement list is pruned from the other side too", () => {
  it("has no stale entry", () => {
    const violations = staleAcknowledgementViolations(document, served);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("an entry whose operation has since been implemented is reported", () => {
    // Without this, the list only ever grows and stops being a record of
    // decisions. A gap that was closed should stop being listed as a gap.
    const violations = staleAcknowledgementViolations(document, served, { VMList: "not yet" });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("VMList at /vms");
    expect(violations[0]?.detail).toContain("out of date");
  });

  it("an entry for an operation the document no longer declares is reported", () => {
    // VMDelete is genuinely unimplemented, so its real entry must NOT be stale.
    expect(staleAcknowledgementViolations(document, served)).toEqual([]);

    const invented = staleAcknowledgementViolations(document, served, {
      ImageDelete: "never existed",
    });
    expect(invented).toHaveLength(1);
    expect(invented[0]?.detail).toContain("stale");
  });
});

describe("the acknowledged list is exactly the prototype's real gaps", () => {
  it("names the operations the document declares that nothing serves", () => {
    // The list is asserted against the *computed* gap, not merely checked for
    // well-formedness. An acknowledgement for something that is in fact
    // implemented is caught above; this catches the reverse -- a gap that grew
    // and the list did not.
    const unserved = declaredOperations(document)
      .map(endpointKey)
      .filter((key) => !served.includes(key));
    const acknowledgedKeys = Object.keys(ACKNOWLEDGED_OPERATIONS).map((operationId) => {
      const declared = declaredOperations(document).find(
        (entry) => entry.operationId === operationId,
      );
      return declared === undefined ? operationId : endpointKey(declared);
    });
    expect(unserved.sort()).toEqual(acknowledgedKeys.sort());
  });

  it("each reason explains the gap rather than restating it", () => {
    for (const [operationId, reason] of Object.entries(ACKNOWLEDGED_OPERATIONS)) {
      expect(reason.length, `${operationId}'s reason is a stub`).toBeGreaterThan(120);
      expect(reason, `${operationId}'s reason names no mechanism`).toMatch(
        /document|generated|handler|prototype|console/,
      );
    }
  });
});

describe("the endpoint keys are read from the generator, in the document's spelling", () => {
  it("normalises MSW's path syntax to OpenAPI's", () => {
    expect(normalisePath(`*${"/"}api/v1/vms/:vm/disks`)).toBe("/vms/{vm}/disks");
    expect(normalisePath(`*${"/"}api/v1/nodes`)).toBe("/nodes");
    expect(endpointKey({ method: "get", path: "/nodes" })).toBe("GET /nodes");
  });

  it("every served endpoint is one the document declares", () => {
    // The two halves of the coverage check, stated as one fact, because that is
    // what they jointly mean: the mock backend and the document describe the
    // same surface.
    const orphans = orphanViolations(document, served);
    const gaps = coverageViolations(document, served);
    expect([...orphans, ...gaps], formatAll([...orphans, ...gaps])).toEqual([]);
  });

  it("every failure the coverage check produces is actionable", () => {
    const broken: Document = structuredClone(document);
    (broken.paths["/images"] as Record<string, unknown>) = {
      get: { operationId: "ImageList", responses: {} },
    };
    const corpus = [
      ...coverageViolations(broken, served),
      ...coverageViolations(broken, served, { ImageList: "" }),
      ...orphanViolations(broken, [...served, "GET /nowhere"]),
      ...servingViolations(broken, served, { GhostList: "stale" }),
      ...servingViolations(broken, served, { ImageList: "" }),
      ...staleAcknowledgementViolations(broken, served, { ImageList: "stale" }),
      ...staleAcknowledgementViolations(broken, served, { VMList: "now implemented" }),
    ];
    expect(corpus.length).toBeGreaterThan(3);
    expect(poorlyFormed(corpus)).toEqual([]);
  });
});
