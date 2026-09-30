/**
 * One problem, named precisely enough to act on before reading the diff.
 *
 * The shape is not decoration. A failure that says "assertion failed" costs its
 * author an hour, and the whole point of this package is that it is the last
 * thing standing between a hand-authored document and a console that quietly
 * disagrees with a server. So every violation carries three things and the
 * `wellFormed` check refuses one that does not:
 *
 * - `invariant` — which rule broke, so a reader who has not opened this file
 *   still knows what kind of thing went wrong.
 * - `what`      — the specific artefact, path, or identifier. Never "a value".
 * - `remedy`    — the command or the decision that fixes it. For anything
 *   downstream of the document that is `make generate`; for an unacknowledged
 *   gap it is "decide, then write it down in acknowledged.ts".
 *
 * `wellFormed` exists because the alternative is a suite whose own messages rot
 * quietly. Nothing stops a future contributor writing `remedy: ""`; this does.
 */

/** The command that regenerates everything downstream of the contract document. */
export const REGENERATE = "make generate";

/** Where an unacknowledged operation gap is recorded once someone has decided. */
export const ACKNOWLEDGED_FILE = "packages/invariants/src/acknowledged.ts";

export interface Violation {
  /** Which invariant broke. Stable enough to grep for and to filter on. */
  readonly invariant: string;
  /** The specific artefact, path, or identifier that drifted. */
  readonly what: string;
  /** What it drifted from, or why it is wrong. */
  readonly detail: string;
  /** The command or the decision that resolves it. Never empty. */
  readonly remedy: string;
}

export const violation = (
  invariant: string,
  what: string,
  detail: string,
  remedy: string,
): Violation => ({ invariant, what, detail, remedy });

/** The one line a test prints, and the one a terminal shows. */
export const format = (entry: Violation): string =>
  `[${entry.invariant}] ${entry.what}\n    ${entry.detail}\n    fix: ${entry.remedy}`;

/** Every violation, one per line, in the order they were found. */
export const formatAll = (entries: readonly Violation[]): string => entries.map(format).join("\n");

/**
 * Violations that are not actionable enough to be worth failing on.
 *
 * A separate function rather than a constructor guard so that a negative
 * control can build a deliberately bad violation and assert this rejects it --
 * a validator nobody has seen reject anything is a validator nobody should
 * trust.
 */
export const poorlyFormed = (entries: readonly Violation[]): string[] => {
  const problems: string[] = [];

  for (const entry of entries) {
    if (entry.invariant.trim() === "") problems.push("a violation names no invariant");
    if (entry.what.trim() === "") problems.push(`[${entry.invariant}] names nothing`);
    if (entry.detail.trim() === "") {
      problems.push(`[${entry.invariant}] ${entry.what} says what is wrong but not how`);
    }
    if (entry.remedy.trim() === "") {
      problems.push(`[${entry.invariant}] ${entry.what} offers no way to fix it`);
    }
  }

  return problems;
};
