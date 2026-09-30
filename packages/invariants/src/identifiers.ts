/**
 * The identifiers that reach a screen, and the ones that should.
 *
 * **The seam is the wire, not the source text.** An earlier version of this
 * module scanned every `.ts` file for tokens shaped like identifiers, and it was
 * wrong: a test suite's negative controls are *supposed* to contain malformed
 * identifiers, so the scan reported `packages/fakes/tests/estate-consistency.test.ts`
 * for the strings that test exists to reject. A check whose false positives are
 * other people's negative controls gets switched off within a week, and a check
 * that has been switched off protects nothing.
 *
 * So the check reads what the mock backend actually serves. That is the thing the
 * ticket asks about — "a malformed identifier must fail rather than render a
 * broken row" — and a row is only rendered if a response carried it. It also has
 * a property the text scan could not have: it covers identifiers the backend
 * *mints*, which never appear in the estate at all and are therefore invisible to
 * the world builder's own check. It found one, and it is acknowledged with a
 * reason.
 *
 * The rule itself is imported from `packages/fakes`, never restated. A second copy
 * of the pattern is a second thing to keep in step, and it would eventually
 * disagree with the first — at which point the world builder would reject ids the
 * console accepts, or the reverse, and the disagreement would look like a data
 * bug rather than a configuration one.
 */

import { ID_PATTERN, idPattern, type ResourceKind } from "@sovren/fakes";

import { violation, type Violation } from "./violation";

/* -------------------------------------------------------------------------- */
/* Walking a response                                                          */
/* -------------------------------------------------------------------------- */

/** Every `id` in a response body, with the path it was found at. */
export interface ServedId {
  readonly value: string;
  /** `/vms.items.3.target.id` — enough to find the fixture that produced it. */
  readonly where: string;
}

/**
 * Every field named `id` in a decoded body, at any depth.
 *
 * Recursive rather than typed, because the estate's rows and the document's
 * `items` envelopes and the `target` links inside a Task all nest differently and
 * a typed walk would need one case per shape. The contract names the field `id`
 * everywhere and only there, which is itself part of what is being checked.
 */
export const servedIds = (body: unknown, where = ""): ServedId[] => {
  const found: ServedId[] = [];

  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const at = path === "" ? key : `${path}.${key}`;
      if (key === "id" && typeof entry === "string") found.push({ value: entry, where: at });
      walk(entry, at);
    }
  };

  walk(body, where);
  return found;
};

/* -------------------------------------------------------------------------- */
/* Judging an identifier                                                       */
/* -------------------------------------------------------------------------- */

/** The resource prefix an id claims, if it claims one of ours. */
export const claimedPrefix = (id: string): string | null => id.split("_")[0] ?? null;

/** Whether an id is well-formed for a resource we know the prefix of. */
export const isWellFormed = (id: string, kind: ResourceKind): boolean => idPattern(kind).test(id);

/**
 * What is wrong with an identifier, or `null` when nothing is.
 *
 * **What this can and cannot see, stated plainly.** A body on the wire carries an
 * id and nothing saying which resource it belongs to, so this can judge an id's
 * *shape* — the prefix, and the ten Crockford characters — and nothing more. It
 * cannot catch a VM whose id is well-formed but opens `nd_`, because nothing in
 * the response says which kind of row it is on. That check exists and is not
 * here: it is in `packages/client/tests/contract.test.ts`, read off the
 * document's schemas, where the pairing is declared rather than inferred.
 *
 * So this is a *necessary* check, not a sufficient one, and the two together
 * cover both halves: the document says what a Drive's id may look like, and the
 * wire says whether the id that was actually served looks like anything.
 *
 * Both halves of the shape rule are reported separately, because they have
 * different causes and different fixes. A wrong prefix is a name that is not one
 * of ours. A right prefix with the wrong length is a typo.
 */
export const idProblem = (
  id: string,
  prefixes: ReadonlyMap<string, ResourceKind>,
): string | null => {
  const prefix = claimedPrefix(id);

  if (prefix === null || !prefixes.has(prefix)) {
    return `it opens "${prefix ?? ""}" rather than one of sovren's resource prefixes (${[...prefixes.keys()].join(", ")}), so it is not an id at all -- it looks like a name written where a key belongs`;
  }

  if (ID_PATTERN.test(id)) return null;

  return `a ${prefixes.get(prefix) as string} id must open ${prefix}_ and carry ten Crockford base32 characters, so ${id} is not one`;
};

/* -------------------------------------------------------------------------- */
/* The check                                                                   */
/* -------------------------------------------------------------------------- */

/** A resource id the mock backend served that is not a sovren identifier. */
export interface IdentifierProblem {
  /** Where in the response it was found: `/vms.items.3.target.id`. */
  readonly where: string;
  readonly id: string;
  readonly problem: string;
}

export const servedIdentifierProblems = (
  responses: readonly { readonly where: string; readonly body: unknown }[],
  prefixes: ReadonlyMap<string, ResourceKind>,
  acknowledged: ReadonlySet<string> = new Set(),
): IdentifierProblem[] =>
  responses.flatMap((response) =>
    servedIds(response.body, response.where)
      .filter((served) => !ID_PATTERN.test(served.value) && !acknowledged.has(served.value))
      .map((served) => ({
        where: served.where,
        id: served.value,
        problem: idProblem(served.value, prefixes) ?? "is not a sovren identifier",
      })),
  );

export const identifierViolations = (problems: readonly IdentifierProblem[]): Violation[] =>
  problems.map((problem) =>
    violation(
      "fixture-identifier",
      problem.id,
      `${problem.where}: ${problem.problem}. A path parameter accepts a name or an id, so an id that is not one resolves to nothing and the row renders blank rather than failing loudly.`,
      "fix it where it is minted: the estate in packages/fakes/src/estate/fleet.ts, or a handler in packages/fakes/src/backend/handlers.ts. If it is a placeholder the backend mints deliberately, add its prefix to ACKNOWLEDGED_IDENTIFIER_PREFIXES in packages/invariants/src/acknowledged.ts with a reason.",
    ),
  );

/** The prefixes the world builder declares, as a prefix -> resource map. */
export const prefixMap = (
  prefixes: Readonly<Record<string, string>>,
): ReadonlyMap<string, ResourceKind> =>
  new Map(
    Object.entries(prefixes).map(([kind, prefix]) => [prefix, kind as ResourceKind] as const),
  );
