/**
 * The vocabulary, checked where the document is not.
 *
 * `packages/client/tests/contract.test.ts` already holds three of the naming
 * rules against the document: `Drive` has a `nodeId` and no `vmId`, `Disk` has
 * the reverse, no schema carries both, and only `Endpoint` and `NetworkResource`
 * reuse NetBird's collided word. Those are not repeated here. This module is the
 * part the document-only checks cannot reach, and it exists because the document
 * is the wrong place to look for three specific mistakes:
 *
 *  1. **A fixture that swaps the two.** The document can say `Drive` has a
 *     `nodeId` while `fleet.ts` gives a Drive a `vmId`, and every document-level
 *     check still passes. The estate is read here, not declared.
 *  2. **A noun the document never had to name.** The document's schemas are a
 *     subset — it declares no `Site` operation, no `Group` operation, no
 *     `CertificateAuthority` — so a `Service` type in the fakes package would
 *     never collide with anything in the contract.
 *  3. **A rename that only half happened.** `Endpoint` and `NetworkResource` are
 *     the permitted reuses of the collided word, and neither is a schema in the
 *     prototype's document, so the document-level check has nothing to assert
 *     about them. The *rule* is real; only its current application is empty.
 *
 * So the checks read the estate, the identifier prefixes, and the two TypeScript
 * vocabularies that a `Drive`/`Disk` confusion would show up in.
 */

import { ID_PREFIXES } from "@sovren/fakes";

import { violation, type Violation } from "./violation";

/* -------------------------------------------------------------------------- */
/* Drive and Disk, on the wire and in the estate                               */
/* -------------------------------------------------------------------------- */

/** A resource that identifies the host it belongs to. */
interface Hosted {
  readonly kind: string;
  readonly rows: readonly Record<string, unknown>[];
}

/**
 * A row's name, for a failure message.
 *
 * `typeof` rather than `String()`, because a row that somehow carried an object
 * under `name` should say so rather than print `[object Object]` in a message
 * whose whole purpose is to be readable.
 */
const nameOf = (row: Record<string, unknown>): string => {
  const name = row.name;
  if (typeof name === "string") return name;
  return name === undefined ? "(unnamed)" : JSON.stringify(name);
};

/**
 * Widen a typed estate row to the plain record these checks read.
 *
 * The estate's row types are `interface X extends <document type>`, so a `Drive`
 * cannot *declare* a `vmId` and TypeScript already forbids the swap. The check
 * exists for the case the type system cannot see — a projection, a hand-built
 * fixture, a future change to the row types — and it reads a widened record so
 * that it can judge what is actually there rather than what is declared.
 */
export const asRecord = (row: unknown): Record<string, unknown> =>
  row as unknown as Record<string, unknown>;

/**
 * A `Drive` must name a Node and a `Disk` must name a VM.
 *
 * R24: `Drive` is a physical disk on a Node and `Disk` is VM storage, and the
 * rename to `Drive` exists for exactly one reason — to keep `Disk`
 * unambiguous. A Drive that grew a `vmId`, or a Disk that grew a `nodeId`, is the
 * confusion the rename was made to prevent, and it is invisible to a document-level
 * check the moment the *estate* does it rather than the schema.
 */
export const hostViolations = (hosts: readonly Hosted[]): Violation[] =>
  hosts.flatMap(({ kind, rows }) => {
    const expected = kind === "drive" ? "nodeId" : "vmId";
    const forbidden = kind === "drive" ? "vmId" : "nodeId";

    return rows.flatMap((row) => {
      const label = `${kind} "${nameOf(row)}"`;
      const problems: string[] = [];

      if (row[expected] === undefined) {
        problems.push(`carries no ${expected}, so nothing says which host it belongs to`);
      }
      if (row[forbidden] !== undefined) {
        problems.push(
          `carries a ${forbidden}, which is the exact confusion the ${kind === "drive" ? "Drive" : "Disk"} rename exists to prevent: a ${kind === "drive" ? "Drive is on a Node and has no VM" : "Disk is a VM's storage and has no Node"}`,
        );
      }

      return problems.map((problem) =>
        violation(
          "vocabulary-host",
          label,
          problem,
          kind === "drive"
            ? "a Drive belongs to the Node that physically holds it -- see the Nomenclature table in docs/specs/sovren-control-plane.md. Fix packages/fakes/src/estate/fleet.ts, then 'make generate' if the document needs to change."
            : "a Disk is a VM's storage -- see the Nomenclature table in docs/specs/sovren-control-plane.md. Fix packages/fakes/src/estate/fleet.ts, then 'make generate' if the document needs to change.",
        ),
      );
    });
  });

/**
 * Nothing carries both a `nodeId` and a `vmId`.
 *
 * Held here as well as in the document's own check, because the document's version
 * looks at schemas and this one looks at the rows the mock backend actually
 * serves. A response is an object at runtime, and a projection that added a field
 * would produce one that carries both without any schema saying so.
 */
export const bothHostsViolations = (
  resources: readonly { readonly kind: string; readonly row: Record<string, unknown> }[],
): Violation[] =>
  resources
    .filter(({ row }) => row.nodeId !== undefined && row.vmId !== undefined)
    .map(({ kind, row }) =>
      violation(
        "vocabulary-host",
        `${kind} "${nameOf(row)}"`,
        "carries both a nodeId and a vmId, and nothing in the estate is ever both: a machine is physical or a guest is virtual",
        "decide which one it is and drop the other. The document's schemas are checked for the same thing in packages/client/tests/contract.test.ts, but that reads the contract rather than the rows being served.",
      ),
    );

/* -------------------------------------------------------------------------- */
/* The collided word                                                           */
/* -------------------------------------------------------------------------- */

/** The only two names permitted to mean NetBird's "service". */
export const PERMITTED_SERVICE_NAMES = ["Endpoint", "NetworkResource"] as const;

/**
 * A declared name that reuses NetBird's collided word.
 *
 * R26: NetBird calls a reachable address a "service", which collides with the
 * Dokploy `Service`, so it is renamed. Nothing else may quietly take the word
 * back — and "nothing else" here is every name the repository declares, not just
 * the schemas the document happens to carry.
 */
export const serviceNameViolations = (names: readonly string[]): Violation[] =>
  names
    .filter((name) => /service/i.test(name))
    .filter((name) => !(PERMITTED_SERVICE_NAMES as readonly string[]).includes(name))
    .map((name) =>
      violation(
        "vocabulary-service",
        name,
        "reuses NetBird's word for a reachable address, which is exactly the collision the rename to Endpoint was made to avoid -- the Dokploy Service is a different thing entirely",
        `rename it to Endpoint or NetworkResource, which are the only two names permitted to carry it. The Nomenclature table in docs/specs/sovren-control-plane.md records why.`,
      ),
    );

/**
 * The permitted names are still permitted, and the rule is not vacuous.
 *
 * Asserted in both directions, because a rule with nothing to apply to reads like
 * coverage and is not. `Endpoint` and `NetworkResource` are the two names the spec
 * says carry NetBird's meaning, and a check that rejected them would be enforcing
 * the opposite of the rule.
 */
export const permittedNameViolations = (names: readonly string[]): Violation[] =>
  PERMITTED_SERVICE_NAMES.filter(
    (permitted) => !names.includes(permitted) && names.some((name) => /service/i.test(name)),
  ).map((permitted) =>
    violation(
      "vocabulary-service",
      permitted,
      `something in the repository reuses the collided word while ${permitted} -- the name the spec assigns to it -- is absent, so the rename has not been applied consistently`,
      `use ${permitted} for the thing NetBird calls a service, rather than a new name carrying the word.`,
    ),
  );

/* -------------------------------------------------------------------------- */
/* The prefixes                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every prefix the world builder mints opens one of its own resources.
 *
 * `ID_PREFIXES` is the one place a resource's two-letter prefix is written down,
 * and it is read here rather than restated. A prefix added for a resource nobody
 * declared would mint ids that resolve to nothing.
 */
export const prefixViolations = (): Violation[] => {
  const seen = new Map<string, string>();
  const problems: Violation[] = [];

  for (const [kind, prefix] of Object.entries(ID_PREFIXES)) {
    const previous = seen.get(prefix);
    if (previous !== undefined) {
      problems.push(
        violation(
          "vocabulary-prefix",
          prefix,
          `is the prefix for both ${previous} and ${kind}, so an id cannot say which resource it belongs to -- which is the entire reason a prefix is there`,
          "give one of them a different prefix. The pairing is enforced in packages/fakes/src/estate/consistency.ts, so this is a second opinion rather than the only one.",
        ),
      );
      continue;
    }
    seen.set(prefix, kind);

    if (!/^[a-z]{2}$/.test(prefix)) {
      problems.push(
        violation(
          "vocabulary-prefix",
          prefix,
          `is the ${kind} prefix, and an id is a two-letter prefix, an underscore, and ten Crockford characters -- so this one cannot be part of a well-formed id`,
          "use two lowercase letters. packages/fakes/src/estate/identifiers.ts is the only place this is written.",
        ),
      );
    }
  }

  return problems;
};
