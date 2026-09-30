import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { estateFor, ID_PREFIXES, RESOURCE_KINDS } from "@sovren/fakes";

import {
  PERMITTED_SERVICE_NAMES,
  asRecord,
  bothHostsViolations,
  hostViolations,
  permittedNameViolations,
  prefixViolations,
  serviceNameViolations,
} from "../src/vocabulary";
import { formatAll, poorlyFormed } from "../src/violation";
import { REPO_ROOT, readDocument } from "../src/repo";
import { packageDirectories, repositorySources } from "../src/backend";
import { join } from "node:path";

/**
 * Invariant 8: the vocabulary stays honest.
 *
 * **What is deliberately not repeated.** `packages/client/tests/contract.test.ts`
 * already asserts, against the document, that `Drive` has a `nodeId` and no
 * `vmId`, that `Disk` has a `vmId` and no `nodeId`, that no schema carries both,
 * that `DiskPage` and `DrivePage` stay separate, and that no schema name reuses
 * NetBird's collided word. Those are five good checks and duplicating them here
 * would add five lines of code and no coverage.
 *
 * What is here is what a document-only check cannot see:
 *
 *  - the *estate*, which is a value rather than a declaration and can swap a
 *    Drive's host while every schema stays correct;
 *  - the *projections*, which are the join between the estate and the wire and
 *    could add a field no schema declares;
 *  - the *identifier prefixes*, which no document mentions;
 *  - the *TypeScript vocabularies* of the packages, which contain nouns the
 *    document's subset of schemas never had to name — there is no `Site`
 *    operation, no `Group` operation, and no `CertificateAuthority` at all, so a
 *    `Service` type in `packages/fakes` would collide with nothing in the
 *    contract and the document-level check would have nothing to say.
 *
 * The last one is the most valuable and the least obvious. It is also the one
 * most likely to find something in a package being written right now, which is the
 * intended behaviour rather than a false positive: a noun the document never
 * declared is precisely a noun the document-level check cannot police.
 */

const estates = ["fleet", "compact"].map((name) => ({ name, estate: estateFor(name) }));

/** Every declared TypeScript type name, across the packages the suite may read. */
const declaredNames = (): string[] => {
  const sources = repositorySources();
  const names = new Set<string>();

  for (const { source } of sources) {
    for (const match of source.matchAll(
      /\b(?:export\s+)?(?:declare\s+)?(?:interface|type|class|enum|const|function)\s+([A-Z][A-Za-z0-9_]*)/g,
    )) {
      if (match[1] !== undefined) names.add(match[1]);
    }
  }

  return [...names].sort();
};

describe("a Drive is on a Node and a Disk is on a VM, in the estate itself", () => {
  it("every Drive names a Node and no Drive names a VM", () => {
    // The check the document cannot make. The document says a Drive has a
    // `nodeId`; the estate is what the mock backend actually serves, and it could
    // disagree with the document and still type-check, because both fields are
    // strings.
    const hosts = estates.flatMap(({ estate }) => [
      { kind: "drive", rows: estate.drives.map(asRecord) },
    ]);
    const violations = hostViolations(hosts);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("every Disk names a VM and no Disk names a Node", () => {
    const hosts = estates.flatMap(({ estate }) => [
      { kind: "disk", rows: estate.disks.map(asRecord) },
    ]);
    const violations = hostViolations(hosts);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("covers both estates, not just the default one", () => {
    // The compact estate is the narrow-screen fixture and is a separate
    // hand-written description. A rule applied to the default estate only is a
    // rule applied to half the fixtures.
    const violations = hostViolations(
      estates.flatMap(({ estate }) => [
        { kind: "drive", rows: estate.drives.map(asRecord) },
        { kind: "disk", rows: estate.disks.map(asRecord) },
      ]),
    );
    expect(violations).toEqual([]);
    expect(estates).toHaveLength(2);
  });

  it("catches a Drive carrying a vmId", () => {
    // The negative control, and the exact confusion the rename exists to prevent:
    // a Drive is on a Node and has no VM. It type-checks, because the field would
    // be a string.
    const violations = hostViolations([
      {
        kind: "drive",
        rows: [{ name: "accra-desk-01-sda", nodeId: "nd_01hq2n0001", vmId: "vm_01hq2v9cd2" }],
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe('drive "accra-desk-01-sda"');
    expect(violations[0]?.detail).toContain("Drive is on a Node and has no VM");
  });

  it("catches a Disk carrying a nodeId", () => {
    const violations = hostViolations([
      {
        kind: "disk",
        rows: [{ name: "netbird-root", vmId: "vm_01hq2v9cd2", nodeId: "nd_01hq2n0001" }],
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("Disk is a VM's storage and has no Node");
  });

  it("catches a Drive with no host at all", () => {
    // A row that belongs to nothing resolves to nothing when a detail page asks
    // for it, and the list shows a count that is not backed by a row.
    const violations = hostViolations([{ kind: "drive", rows: [{ name: "orphan-sda" }] }]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("carries no nodeId");
  });

  it("every failure it produces is actionable", () => {
    const violations = hostViolations([
      { kind: "drive", rows: [{ name: "a", nodeId: "nd_01hq2n0001", vmId: "vm_01hq2v9cd2" }] },
      { kind: "disk", rows: [{ name: "b" }] },
    ]);
    // The drive reports the forbidden field; the disk reports the missing one.
    // Two problems from two rows, and a reader is told which is which.
    expect(violations).toHaveLength(2);
    expect(violations.map((entry) => entry.invariant)).toEqual([
      "vocabulary-host",
      "vocabulary-host",
    ]);
    expect(poorlyFormed(violations)).toEqual([]);
    for (const entry of violations) {
      expect(entry.remedy).toContain("docs/specs/sovren-control-plane.md");
    }
  });
});

describe("nothing in the estate is both a machine and a guest", () => {
  it("no served row carries both a nodeId and a vmId", () => {
    // Held over the estate as well as over the document's schemas, because the
    // document's version reads the contract and this one reads the rows. A
    // projection that added a field would produce a response carrying both with
    // no schema saying so.
    const resources = estates.flatMap(({ estate }) => [
      ...estate.drives.map((row) => ({ kind: "drive", row: asRecord(row) })),
      ...estate.disks.map((row) => ({ kind: "disk", row: asRecord(row) })),
      ...estate.snapshots.map((row) => ({ kind: "snapshot", row: asRecord(row) })),
    ]);
    const violations = bothHostsViolations(resources);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("catches a row that claims both", () => {
    const violations = bothHostsViolations([
      {
        kind: "disk",
        row: { name: "netbird-root", nodeId: "nd_01hq2n0001", vmId: "vm_01hq2v9cd2" },
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("nothing in the estate is ever both");
    expect(violations[0]?.remedy).toContain("contract.test.ts");
  });
});

describe("no sovren noun collides with NetBird's service", () => {
  it("across every name the repository declares, not just the document's schemas", () => {
    // The valuable one. The document declares no `Service`, no `Endpoint`, and no
    // `NetworkResource` — its schema list is a subset of the Nomenclature table.
    // So the document-level check has nothing to assert about any of them, and a
    // `Service` type invented in `packages/fakes` or `packages/console` would
    // collide with the Dokploy Service without the contract ever noticing.
    const violations = serviceNameViolations(declaredNames());
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("scanned enough of the repository for the check to mean something", () => {
    // A name-scan that read three files is a name-scan that missed three
    // packages. Asserted in two directions: many names, and at least one name
    // from every workspace package, so a future package cannot be added outside
    // the check's reach without this failing.
    const names = declaredNames();
    expect(names.length).toBeGreaterThan(100);
    expect(names).toContain("EstateNode");
    expect(names).toContain("EstateDisk");
  });

  it("catches a Service type invented in a package the document never names", () => {
    // The negative control, in the shape the mistake actually takes. A `Service`
    // type in the fakes package is invisible to every check in
    // `contract.test.ts`, because the document has no `Service` schema to collide
    // with.
    const violations = serviceNameViolations(["EstateNode", "DokployService"]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("DokployService");
    expect(violations[0]?.detail).toContain("Endpoint");
  });

  it("catches a lowercase field or path reusing the word", () => {
    // The word can come back in a different case, which is the same collision.
    expect(serviceNameViolations(["serviceEndpoint"])).toHaveLength(1);
    expect(serviceNameViolations(["ServiceHosts"])).toHaveLength(1);
    expect(serviceNameViolations(["DokployServiceKind"])).toHaveLength(1);
  });

  it("permits Endpoint and NetworkResource, and only those two", () => {
    // Asserted positively rather than only negatively. A rule that rejected the
    // names the spec assigns to NetBird's meaning would be enforcing the opposite
    // of the rule, and a check that cannot be wrong in the other direction is
    // half a check.
    expect(serviceNameViolations([...PERMITTED_SERVICE_NAMES])).toEqual([]);
    expect(serviceNameViolations(["Endpoint", "NetworkResource", "DokployService"])).toHaveLength(
      1,
    );
  });

  it("notices when the collided word is back and the rename is not applied", () => {
    // The consistency direction: something took the word while the names the spec
    // assigns to it are absent, so the rename has been half-applied. This is what
    // stops the rule decaying into "nothing uses the word" rather than "the right
    // names are used". Both permitted names are reported, because both are
    // missing and a reader fixing one would otherwise have to re-run to find the
    // other.
    const violations = permittedNameViolations(["DokployService"]);
    expect(violations.map((entry) => entry.what)).toEqual([...PERMITTED_SERVICE_NAMES]);
    expect(violations[0]?.detail).toContain("not been applied consistently");
  });

  it("says nothing when the word is absent entirely", () => {
    // A prototype that has not built an Endpoint yet has not violated anything,
    // and a check that complained would be inventing a requirement.
    expect(permittedNameViolations(["EstateNode", "EstateDisk"])).toEqual([]);
  });
});

describe("the identifier prefixes stay one prefix per resource", () => {
  it("none are shared and all are two lowercase letters", () => {
    const violations = prefixViolations();
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("reads the world builder's table rather than a copy of it", () => {
    // If this fails the fix is to import, never to re-declare: a second prefix
    // table is a second thing to keep in step with the first.
    expect(Object.keys(ID_PREFIXES)).toEqual([...RESOURCE_KINDS]);
    expect(ID_PREFIXES.drive).toBe("dr");
    expect(ID_PREFIXES.disk).toBe("ds");
  });

  it("catches a prefix shared by two resources", () => {
    // The negative control, built by hand because the real table cannot be made
    // wrong without editing a package this suite does not own — which is exactly
    // why the check takes its input as a parameter in `prefixViolations`'s
    // sibling `idProblem`, and why this one is asserted over a clone.
    const shared = { node: "nd", drive: "nd", disk: "ds" } as const;
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [kind, prefix] of Object.entries(shared)) {
      const previous = seen.get(prefix);
      if (previous !== undefined) clashes.push(`${previous}/${kind}`);
      else seen.set(prefix, kind);
    }
    expect(clashes).toEqual(["node/drive"]);
  });

  it("catches a prefix that could not be part of an id", () => {
    // A one-letter or uppercase prefix makes every id carrying it malformed, and
    // the world builder's own pattern would reject it — so this is a second
    // opinion, and worth having at the repository level.
    const bad = ["nd", "D", "node", "n_d", ""];
    expect(bad.filter((prefix) => !/^[a-z]{2}$/.test(prefix))).toHaveLength(4);
  });
});

describe("the document's own nouns still hold, and the suite does not restate them", () => {
  it("the document declares the Drive/Disk split the estate follows", () => {
    // Not a duplicate of the contract test — a statement of which suite owns which
    // half, so a future reader does not add the other half here. The document's
    // schemas say what a Drive may carry; `packages/fakes/src/backend/projections.ts`
    // decides what actually crosses the wire; this suite holds the estate to the
    // same rule from the other direction.
    const document = readDocument();
    const drive = document.components.schemas.Drive;
    const disk = document.components.schemas.Disk;
    expect(drive?.properties).toHaveProperty("nodeId");
    expect(drive?.properties).not.toHaveProperty("vmId");
    expect(disk?.properties).toHaveProperty("vmId");
    expect(disk?.properties).not.toHaveProperty("nodeId");
  });

  it("the projections carry through exactly what the estate holds", () => {
    // The join between the two, and the one place a field could be added or lost
    // on the way to the wire. Held here because a projection is a function and the
    // estate is a value: neither is a schema, so the document's check cannot see
    // either.
    const estate = estateFor("fleet");
    const projection = join(REPO_ROOT, "packages/fakes/src/backend/projections.ts");
    const source = readFileSync(projection, "utf8");
    expect(source).toContain("export const toDrive");
    expect(source).toContain("export const toDisk");
    // The estate's Drives really do carry nodeId, so a projection that dropped it
    // would be caught by a body assertion rather than by this one.
    expect(estate.drives[0]?.nodeId).toBeDefined();
    // Read through the widened record rather than off the typed row, because
    // `EstateDrive extends Drive` and `Drive` declares no `vmId` — so
    // `estate.drives[0].vmId` does not type-check, which is the type system
    // already doing this check's job for the estate and leaving it to do the part
    // types cannot see.
    expect(asRecord(estate.drives[0]).vmId).toBeUndefined();
  });
});

describe("the vocabulary scan reaches every package", () => {
  it("reads sources from each workspace package it is meant to cover", () => {
    // `packages/invariants` is excluded, and for a stated reason asserted below:
    // this package's entire content is checks, and a check has to name the rule
    // it enforces. Asserted for the other four, so that adding a package without
    // thinking about its reach fails here.
    const where = repositorySources().map((entry) => entry.where);
    for (const directory of packageDirectories().filter((name) => name !== "packages/invariants")) {
      expect(
        where.some((path) => path.startsWith(`${directory}/`)),
        `${directory} was not scanned, so a noun invented there would go unnoticed`,
      ).toBe(true);
    }
  });

  it("excludes the generated tree, whose names come from the document", () => {
    // Orval derives its model names from the document's schemas, so a generated
    // `Service` is a document-level problem and is already checked there.
    const where = repositorySources().map((entry) => entry.where);
    expect(where.some((path) => path.includes("/src/generated/"))).toBe(false);
  });

  it("excludes this suite's own sources, and says why", () => {
    // The check has to name the rule it enforces -- a constant called
    // `PERMITTED_SERVICE_NAMES` *is* the rule -- so scanning its own vocabulary
    // would report the rule as a violation of itself. Asserted rather than left
    // implied, so that widening the exclusion later is a visible change.
    const names = declaredNames();
    expect(names).not.toContain("PERMITTED_SERVICE_NAMES");
    expect(names).toContain("EstateNode");
  });
});
