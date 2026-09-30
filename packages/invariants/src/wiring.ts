/**
 * The wiring: whether this suite is actually reached.
 *
 * Kept apart from `repo.ts` because it answers a different question. `repo.ts`
 * says *where things are*; this says *whether anybody runs them*, which is the
 * question behind invariant 6 and the one that decides whether the other seven
 * invariants are worth anything.
 *
 * A safety suite that is not run catches nothing, and it fails silently: the
 * build stays green, the drift ships, and the only evidence is that nobody
 * noticed. So the wiring is read from the files that define it — the workspace
 * globs, the Makefile, the toolchain configuration — rather than assumed from the
 * fact that these tests are executing.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./repo";

/** The `packages:` globs in `pnpm-workspace.yaml`, minus comments. */
export const workspaceGlobs = (): string[] =>
  readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s*/, "").replace(/^["']|["']$/g, ""))
    .filter((line) => !line.startsWith("#"));

/** Every workspace package directory, relative to the repository root. */
export const packageDirectoriesOf = (): string[] => {
  const root = join(REPO_ROOT, "packages");
  return readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory())
    .map((entry) => `packages/${entry}`)
    .sort();
};

/**
 * A Makefile target: its declaration line and its recipe.
 *
 * Both, because both are the wiring. The prerequisites are on the declaration
 * line (`check: lint typecheck test`) and the command is in the recipe below it
 * (`vp test`). `undefined` when the target does not exist, which is the
 * interesting case: a removed target has to be distinguishable from one with no
 * prerequisites, or a negative control would pass for the wrong reason.
 *
 * A recipe line is a tab-indented line, which is the only thing distinguishing it
 * from a continuation of a multi-line variable assignment. Reading to the next
 * non-indented, non-comment, non-blank line is enough for a target whose recipe
 * is one or two lines, which every target this suite reads is.
 */
export const makeTarget = (makefile: string, target: string): string | undefined => {
  const lines = makefile.split("\n");
  const at = lines.findIndex((line) => new RegExp(`^${target.replaceAll(":", "\\:")}:`).test(line));
  if (at === -1) return undefined;

  const recipe: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith("\t")) break;
    recipe.push(line.trim());
  }
  return [lines[at] as string, ...recipe].join("\n");
};

/**
 * Whether the `make check` target depends on the workspace test sweep.
 *
 * The single fact that makes this package part of the build. Exported so the test
 * can assert it against the real Makefile *and* against a doctored copy, which is
 * what makes it a check rather than a reading.
 */
export const checkRunsTests = (makefile: string): boolean => {
  const line = makeTarget(makefile, "check");
  if (line === undefined) return false;
  return line
    .split(":")
    .slice(1)
    .join(":")
    .split(/\s+/)
    .filter((word) => word !== "")
    .includes("test");
};

/**
 * A `.PHONY` line GNU Make cannot parse.
 *
 * A target name containing a colon is a *static pattern rule* to make, not a
 * target, so `.PHONY: generate:check` stops make with `target pattern contains no
 * '%'` — before it reads a single recipe. That is not a lint nit: `make` refuses
 * to run at all, so `make check` and `make generate-check` both fail, and every
 * invariant in this package is unreachable.
 *
 * It is a one-character fix — escape the colon, `.PHONY: generate\:check`, or drop
 * the colon from the target's name — and it is worth a check because the failure
 * is silent from the repository's point of view: the Makefile is a file nothing
 * else reads, and the first sign of trouble is a contributor discovering that
 * `make` does not work at all.
 *
 * The check is over the `.PHONY` lines rather than over make's own parser, because
 * running make to find out is a subprocess in a suite that otherwise needs none,
 * and the grammar is small enough to state.
 */
export const unparseablePhonyViolations = (makefile: string): string[] => {
  const problems: string[] = [];

  for (const [index, line] of makefile.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(".PHONY")) continue;
    for (const token of trimmed.split(/\s+/).slice(1)) {
      // An escaped colon is make's own escape and make accepts it. It still has to
      // be repeated in the rule and in every prerequisite that names the target,
      // and getting one of the three wrong stops make just as dead, which is why
      // this repository renamed the targets rather than escaping them. The check
      // accepts the escape; it does not endorse the choice.
      if (token.replaceAll("\\:", "").includes(":") && !token.endsWith(":")) {
        problems.push(
          `Makefile:${index + 1} declares '${token}', and a target name containing a colon is a static pattern rule to make, not a target`,
        );
      }
    }
  }

  return problems;
};
