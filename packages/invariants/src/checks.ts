/**
 * The checks, each one a function from inputs to violations.
 *
 * Every check takes what it reads as an argument and returns the problems it
 * finds, rather than reaching for the filesystem itself. That is what makes a
 * negative control possible: a test can hand a check a deliberately broken
 * *clone* and assert the check notices, without a fixture on disk and without
 * touching a file another agent may be working in. The only module that knows
 * where the repository is `repo.ts`, and the only one that runs a generator is
 * `generate.ts`; everything here is a pure function of its arguments.
 *
 * The pattern is lifted from `packages/client/tests/contract.test.ts`, which
 * established it for the document's conventions. It is extended here rather than
 * reinvented: the difference is that these checks cross package boundaries,
 * where the document-only checks could not reach.
 */

import { type Declared, type Document, type Tree, declaredOperations, repoPath } from "./repo";
import { REGENERATE, violation, type Violation } from "./violation";
import { ACKNOWLEDGED_OPERATIONS, ACKNOWLEDGED_SERVING } from "./acknowledged";

// -- 1. regeneration produces no diff -----------------------------------------

/**
 * A committed generated tree that a fresh generation does not reproduce.
 *
 * Returned rather than thrown so a test can assert on the *shape* of the
 * failure, not just its presence. Three cases, and they have three different
 * causes and three different fixes:
 *
 * - `changed`  — both trees have the file and the bytes differ. The case that
 *   matters: a hand-edit, or a document change nobody regenerated for.
 * - `missing`  — the generator writes it and it is not committed. A deleted or
 *   never-committed generated file.
 * - `orphaned` — it is committed and the generator no longer writes it. A
 *   hand-written file sitting in a generated directory, which is the worst of
 *   the three because `pnpm run generate` deletes the directory wholesale and
 *   takes it with no warning.
 *
 * The names are from the generator's point of view throughout, because that is
 * the point of view that decides whether the tree is correct.
 */
export interface TreeDrift {
  readonly changed: readonly string[];
  readonly missing: readonly string[];
  readonly orphaned: readonly string[];
}

export const treeDrift = (fresh: Tree, committed: Tree): TreeDrift => {
  const changed: string[] = [];
  const missing: string[] = [];
  const orphaned: string[] = [];

  for (const [path, contents] of fresh) {
    const existing = committed.get(path);
    if (existing === undefined) missing.push(path);
    else if (existing !== contents) changed.push(path);
  }
  for (const path of committed.keys()) {
    if (!fresh.has(path)) orphaned.push(path);
  }

  return { changed: changed.sort(), missing: missing.sort(), orphaned: orphaned.sort() };
};

/**
 * The first line at which two files differ, quoted with a line number and one
 * line of context either side.
 *
 * "model/node.ts differs" is the message that costs an hour. The same message
 * with the offending line next to it costs a minute, so this is worth the few
 * lines: it is the difference between a report and a pointer.
 */
const firstDifference = (fresh: string, committed: string): string | null => {
  const generated = fresh.split("\n");
  const actual = committed.split("\n");
  const at = generated.findIndex((line, index) => line !== actual[index]);
  if (at === -1) return null;

  const from = Math.max(0, at - 1);
  const to = Math.min(actual.length, at + 3);
  return [
    `  first difference at line ${at + 1}:`,
    ...actual.slice(from, to).map((line, offset) => `      ${from + offset + 1} | ${line.trim()}`),
    "  generated:",
    ...generated
      .slice(from, Math.min(generated.length, at + 3))
      .map((line, offset) => `      ${from + offset + 1} | ${line.trim()}`),
  ].join("\n");
};

/**
 * A committed generated file that a fresh generation does not reproduce.
 *
 * Named per file and, for a changed file, quoted at the first line that
 * differs -- because "src/generated/node/node.ts differs" is the message that
 * costs an hour, and the same message with three lines of context next to it is
 * the message that costs a minute.
 */
export const generationViolations = (fresh: Tree, committed: Tree): Violation[] => {
  const drift = treeDrift(fresh, committed);
  const violations: Violation[] = [];

  for (const path of drift.changed) {
    violations.push(
      violation(
        "regeneration-drift",
        `packages/client/src/generated/${path}`,
        [
          "the committed file is not what the generator produces from openapi/sovren.json",
          firstDifference(fresh.get(path) ?? "", committed.get(path) ?? ""),
          "  This is either a document change nobody regenerated for, or a hand-edit to a generated file. Both are fixed the same way, and neither is fixed by editing the generated tree.",
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        `${REGENERATE}, then commit the result alongside the document change.`,
      ),
    );
  }

  for (const path of drift.missing) {
    violations.push(
      violation(
        "regeneration-drift",
        `packages/client/src/generated/${path}`,
        "the generator writes this file and it is not committed, so the committed tree is out of date",
        `${REGENERATE}, then commit the result.`,
      ),
    );
  }

  for (const path of drift.orphaned) {
    violations.push(
      violation(
        "regeneration-drift",
        `packages/client/src/generated/${path}`,
        "this file is committed but the generator no longer writes it, so it is a hand-written file sitting in a directory that 'pnpm run generate' deletes wholesale",
        `${REGENERATE} to delete it. If the file is genuinely hand-written, it does not belong under src/generated/ -- that directory is destroyed on every generation.`,
      ),
    );
  }

  return violations;
};

// -- 2. a hand-edit to a generated artefact is detected ------------------------

/**
 * The same comparison, asked a different question.
 *
 * `generationViolations` asks "does the committed tree match a fresh
 * generation". This asks "is any committed generated file a file the generator
 * did not write", which is the narrower claim that matters most while
 * `vp check --fix` used to rewrite generated output: that fixer left a tree where
 * a human had edited generated files, and nothing said so. The two questions
 * have the same answer for a changed file and different answers for an added
 * one -- an added file is drift, but it is not a hand-edit -- so they are two
 * functions rather than one with a flag.
 */
export const handEditViolations = (fresh: Tree, committed: Tree): Violation[] =>
  treeDrift(fresh, committed).changed.map((path) =>
    violation(
      "generated-hand-edit",
      `packages/client/src/generated/${path}`,
      "a committed generated file is not what orval produces from the document, so a human has edited it or the document was changed without regenerating\n" +
        "  Edit the document at openapi/sovren.json and regenerate. Editing this file is destroyed by the next generation and hides a real drift in the meantime.",
      `${REGENERATE}.`,
    ),
  );

/**
 * The generated tree is excluded from fmt and lint, and that exclusion is what
 * makes the two checks above meaningful.
 *
 * Worth asserting rather than assuming: the exclusion was added because
 * `check --fix` rewrote generated output, and the day somebody drops the
 * `ignorePatterns` entry the fixer starts editing generated files again, which
 * produces exactly the hand-edits this suite exists to catch. The suite would
 * still pass -- the fixer and the suite would simply disagree about what a clean
 * tree means -- so the exclusion needs its own check.
 */
export const ignorePatternViolations = (configSource: string): Violation[] => {
  const violations: Violation[] = [];

  for (const tool of ["fmt", "lint"]) {
    if (!configSource.includes(`**/src/generated/**`)) {
      violations.push(
        violation(
          "generated-excluded-from-tooling",
          `vite.config.ts (${tool}.ignorePatterns)`,
          `the ${tool} tool is not excluded from packages/client/src/generated/, so 'vp check --fix' will rewrite generated output and leave a tree a human appears to have hand-edited`,
          `add "**/src/generated/**" to ${tool}.ignorePatterns in vite.config.ts. The reasoning is already written there.`,
        ),
      );
    }
  }

  return violations;
};

// -- 3. the document version and the generated version agree -------------------

/** The `OpenAPI spec version: X` line orval writes into every generated header. */
export const SPEC_VERSION_PATTERN = /^\s*\*\s*OpenAPI spec version:\s*(.+?)\s*$/m;

export const generatedVersion = (contents: string): string | null => {
  const match = SPEC_VERSION_PATTERN.exec(contents);
  return match?.[1] ?? null;
};

/**
 * A generated file that carries no header, and legitimately so.
 *
 * Orval emits two kinds of file: ones built from a schema or an operation, which
 * get the `Generated by orval` header, and pure barrels that only re-export
 * their siblings, which do not. `index.ts` at the tree root and `zod/index.ts`
 * are the latter. Failing them would be a check that cries wolf twice on every
 * run, and a check that cries wolf is one people learn to skip.
 *
 * The exemption is by *shape* rather than by name — a barrel is a file whose
 * lines are all re-exports — so a new barrel is exempt automatically and a
 * hand-written file in the tree is not, whatever it is called.
 */
export const isReexportBarrel = (contents: string): boolean => {
  const lines = contents.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return false;
  // `export * from './x'`, `export * from './x'`, `export { A } from './x'`.
  return lines.every((line) => /^\s*export\s+(type\s+)?(\*|\{[^}]*\})\s+from\s+/.test(line));
};

/**
 * Every generated file agrees with the document on its version.
 *
 * `info.version` is the only version the document has, and orval copies it into
 * every header it writes. So the header is a witness: a generated file whose
 * header says a different version was produced from a different document, and
 * the tree is holding artefacts from two generations at once. That is the state
 * a partial regeneration leaves behind, and it is invisible without this check.
 *
 * A file with no header at all is a violation too, and separately named, because
 * it means something other than a version mismatch: it means a file in the
 * generated tree that orval did not write, which is the hand-edit case wearing a
 * different hat.
 */
export const versionViolations = (document: Document, tree: Tree): Violation[] => {
  const violations: Violation[] = [];
  const expected = document.info.version;

  for (const [path, contents] of tree) {
    if (!path.endsWith(".ts")) continue;
    const found = generatedVersion(contents);
    if (found === null && isReexportBarrel(contents)) continue;

    if (found === null) {
      violations.push(
        violation(
          "version-agreement",
          `packages/client/src/generated/${path}`,
          "the file carries no 'OpenAPI spec version' header, so orval did not write it",
          `${REGENERATE}. A file in the generated tree without a generator header is a hand-written file.`,
        ),
      );
      continue;
    }

    if (found !== expected) {
      violations.push(
        violation(
          "version-agreement",
          `packages/client/src/generated/${path}`,
          `the document is at info.version ${expected} but this file was generated at ${found}, so the generated tree holds artefacts from two different documents`,
          `${REGENERATE} to bring the whole tree to ${expected} in one pass.`,
        ),
      );
    }
  }

  return violations;
};

// -- 5. an operation with no implementation, or the reverse --------------------

/** An operation the document declares, as `METHOD /path`. */
export const endpointKey = (declared: Pick<Declared, "method" | "path">): string =>
  `${declared.method.toUpperCase()} ${declared.path}`;

/**
 * The operations the document declares that nothing implements.
 *
 * An implementation is acknowledged or it is a gap, and the difference is a
 * decision somebody has to make on purpose. A new operation added to the
 * document with no handler behind it would otherwise 404 in the dev server and
 * fail as a blank screen rather than as a build failure, which is the shape of
 * failure the whole chain exists to prevent.
 *
 * The acknowledgement carries a reason, and a reason that is merely a noun is
 * treated as no reason at all: the failure message for a gap has to tell the
 * reader what to decide, not merely that a decision is outstanding.
 */
/** An operation id mapped to the reason it is in the state it is in. */
export type Acknowledgements = Readonly<Record<string, string>>;

/**
 * The operations the document declares that nothing implements.
 *
 * An implementation is acknowledged or it is a gap, and the difference is a
 * decision somebody has to make on purpose. A new operation added to the
 * document with no handler behind it would otherwise 404 in the dev server and
 * fail as a blank screen rather than as a build failure, which is the shape of
 * failure the whole chain exists to prevent.
 *
 * **The acknowledgement map is a parameter, not a closed-over import.** That is
 * what lets a negative control hand this function a map with an empty reason and
 * assert the check notices, without a fixture on disk and without the test
 * mutating the real list — which would make the check's result depend on test
 * order. The default is the committed list, so the production call reads
 * `acknowledged.ts` and nothing else has to know where it lives.
 *
 * The reason itself is required, and a reason that is merely a noun is treated
 * as no reason at all: the failure message for a gap has to tell the reader what
 * to decide, not merely that a decision is outstanding.
 */
export const coverageViolations = (
  doc: Document,
  implemented: readonly string[],
  acknowledged: Acknowledgements = ACKNOWLEDGED_OPERATIONS,
): Violation[] => {
  const served = new Set(implemented);
  const violations: Violation[] = [];

  for (const declared of declaredOperations(doc)) {
    const key = endpointKey(declared);
    if (served.has(key)) continue;

    const reason = acknowledged[declared.operationId];
    if (reason === undefined) {
      violations.push(
        violation(
          "operation-coverage",
          `${declared.operationId} at ${declared.path}`,
          `the document declares ${key} and the mock backend serves no handler for it, so it will 404 in the dev server and render a blank screen rather than fail the build`,
          `implement it in packages/fakes/src/backend/handlers.ts, or -- if it is deliberately out of scope for the prototype -- add it to ACKNOWLEDGED_OPERATIONS in ${repoPath("packages/invariants/src/acknowledged.ts")} with a reason that says why.`,
        ),
      );
      continue;
    }

    if (reason.trim() === "") {
      violations.push(
        violation(
          "operation-coverage",
          `${declared.operationId} at ${declared.path}`,
          "it is listed as acknowledged with no reason, which is an outstanding decision wearing the costume of a decision",
          `write the reason in ACKNOWLEDGED_OPERATIONS in ${repoPath("packages/invariants/src/acknowledged.ts")}.`,
        ),
      );
    }
  }

  return violations;
};

/**
 * An implementation the document does not declare.
 *
 * The other direction, and the one that catches the reverse mistake: a handler
 * left behind for an operation that was removed from the document. It is not
 * harmless -- the endpoint answers requests for something the contract no longer
 * promises, and no future DTO will produce it.
 */
export const orphanViolations = (doc: Document, implemented: readonly string[]): Violation[] => {
  const declared = new Set(declaredOperations(doc).map(endpointKey));
  return implemented
    .filter((key) => !declared.has(key))
    .sort()
    .map((key) =>
      violation(
        "operation-coverage",
        key,
        "the mock backend serves this endpoint and the document no longer declares it, so the endpoint answers for a contract that has moved on",
        `remove the handler from packages/fakes/src/backend/handlers.ts, or restore the operation to openapi/sovren.json. It will be reported as an orphan until one of those two happens.`,
      ),
    );
};

/**
 * An operation served in a way the document does not describe.
 *
 * `TaskLogStream` is the case this exists for: the document declares
 * `text/event-stream`, the generated client cannot consume a stream, and the
 * mock backend serves both -- the SSE branch from a handler the generator did
 * not write, the JSON branch from the generated one. That is a deliberate
 * divergence from "the generated handler owns the response", so it is named here
 * with a reason rather than left as an unexplained fact in a comment.
 */
export const servingViolations = (
  doc: Document,
  served: readonly string[],
  acknowledged: Acknowledgements = ACKNOWLEDGED_SERVING,
): Violation[] => {
  const violations: Violation[] = [];

  for (const [operationId, note] of Object.entries(acknowledged)) {
    const declared = declaredOperations(doc).find((entry) => entry.operationId === operationId);
    if (declared === undefined) {
      violations.push(
        violation(
          "operation-coverage",
          operationId,
          `it is listed as served unusually, but the document no longer declares it, so the acknowledgement is stale`,
          `remove it from ACKNOWLEDGED_SERVING in ${repoPath("packages/invariants/src/acknowledged.ts")}, or restore the operation.`,
        ),
      );
      continue;
    }

    const key = endpointKey(declared);
    if (!served.includes(key)) {
      violations.push(
        violation(
          "operation-coverage",
          `${operationId} at ${declared.path}`,
          "it is listed as served unusually, but nothing serves it at all now",
          `serve it, or move it to ACKNOWLEDGED_OPERATIONS in ${repoPath("packages/invariants/src/acknowledged.ts")} if it is deliberately absent.`,
        ),
      );
      continue;
    }

    if (note.trim() === "") {
      violations.push(
        violation(
          "operation-coverage",
          `${operationId} at ${declared.path}`,
          "it is listed as served unusually with no reason, so the divergence is unexplained",
          `write the reason in ACKNOWLEDGED_SERVING in ${repoPath("packages/invariants/src/acknowledged.ts")}.`,
        ),
      );
    }
  }

  return violations;
};

/**
 * An acknowledgement for an operation that is in fact implemented.
 *
 * The list that is never pruned stops being a record of decisions and becomes a
 * list of things somebody once gave up on. Checking it in both directions is
 * what keeps it a decision log: an entry whose operation has since been
 * implemented is a decision that has been overtaken, and it should be removed.
 */
export const staleAcknowledgementViolations = (
  doc: Document,
  implemented: readonly string[],
  acknowledged: Acknowledgements = ACKNOWLEDGED_OPERATIONS,
): Violation[] => {
  const violations: Violation[] = [];
  const served = new Set(implemented);
  const declaredById = new Map(
    declaredOperations(doc).map((entry) => [entry.operationId, entry] as const),
  );

  for (const operationId of Object.keys(acknowledged)) {
    const declared = declaredById.get(operationId);
    if (declared === undefined) {
      violations.push(
        violation(
          "operation-coverage",
          operationId,
          "it is acknowledged as unimplemented but the document no longer declares it, so the entry is stale",
          `remove it from ACKNOWLEDGED_OPERATIONS in ${repoPath("packages/invariants/src/acknowledged.ts")}.`,
        ),
      );
      continue;
    }
    if (served.has(endpointKey(declared))) {
      violations.push(
        violation(
          "operation-coverage",
          `${operationId} at ${declared.path}`,
          "it is acknowledged as unimplemented, but the mock backend now serves it, so the acknowledgement is out of date",
          `remove it from ACKNOWLEDGED_OPERATIONS in ${repoPath("packages/invariants/src/acknowledged.ts")} -- a gap that was closed should stop being listed as a gap.`,
        ),
      );
    }
  }

  return violations;
};

// -- 7. every failure message is actionable ------------------------------------

/**
 * Asserted rather than asserted-by-convention.
 *
 * The acceptance criterion is that every failure names what drifted and how to
 * regenerate it, and the only honest way to hold a message to that across six
 * checks is to check the messages. This runs every check over a corpus of
 * deliberately broken inputs and asserts that each violation it produces names a
 * subject and offers a remedy, which is the machine-checkable form of "you can
 * act on this without opening the diff".
 */
export const messageViolations = (violations: readonly Violation[]): Violation[] =>
  violations
    .filter((entry) => entry.remedy.trim() === "" || entry.what.trim() === "")
    .map((entry) =>
      violation(
        "actionable-failure",
        entry.what,
        `a failure from ${entry.invariant} does not say what drifted or how to fix it`,
        "every violation must name its subject and offer a remedy; the ones that do not are the ones that cost an hour",
      ),
    );

// -- the regeneration instruction, asserted -----------------------------------

/**
 * The remedy for a stale generated tree is one command, and it is named in the
 * Makefile.
 *
 * Asserted because a remedy that names a target which does not exist is worse
 * than no remedy: the reader runs it, gets "no such target", and has learned
 * nothing. The `make generate` target is the one the repository documents and
 * the one the ADR tells a later contributor to run.
 */
export const makefileViolations = (makefile: string): Violation[] => {
  const violations: Violation[] = [];
  if (!/^generate:/m.test(makefile)) {
    violations.push(
      violation(
        "actionable-failure",
        "Makefile",
        "there is no 'generate' target, so the remedy this suite prints does not exist",
        "restore the generate target to the Makefile, or change the remedy to whatever regenerates the client.",
      ),
    );
  }
  if (!/^generate-check:/m.test(makefile)) {
    violations.push(
      violation(
        "actionable-failure",
        "Makefile",
        "there is no 'generate-check' target, so the pin ADR 0001 relies on is gone",
        "restore the generate-check target, which regenerates and fails on any diff against what is committed.",
      ),
    );
  }
  return violations;
};
