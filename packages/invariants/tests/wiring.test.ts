import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/repo";
import {
  checkRunsTests,
  makeTarget,
  packageDirectoriesOf,
  unparseablePhonyViolations,
  workspaceGlobs,
} from "../src/wiring";
import { makefileViolations } from "../src/checks";
import { formatAll } from "../src/violation";

/**
 * Invariant 6: the safety suite runs inside `make check` and in CI, and is fast
 * enough to run on every change.
 *
 * A safety suite that nobody runs catches nothing, and it fails *silently*: the
 * build stays green, the drift ships, and the only evidence is that nobody
 * noticed. So the wiring is read from the files that define it — the workspace
 * globs, the Makefile, the toolchain configuration — rather than assumed from the
 * fact that these tests are executing.
 *
 * The negative controls are the point. A test that reads the Makefile and finds
 * `check: lint typecheck test` passes today; what matters is that it would fail the
 * day somebody dropped `test` from that line, which is exactly the edit that would
 * silently retire every invariant in this package.
 */

const makefile = readFileSync(join(REPO_ROOT, "Makefile"), "utf8");
const rootManifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const ownManifest = JSON.parse(
  readFileSync(join(REPO_ROOT, "packages/invariants/package.json"), "utf8"),
) as { scripts?: Record<string, string> };

describe("this package is a workspace member", () => {
  it("is matched by the workspace globs, so it is installed and swept", () => {
    // `packages/*` picks it up automatically — the reason the package sits under
    // `packages/` rather than somewhere else. Asserted rather than assumed: a glob
    // narrowed to `packages/client` and `packages/fakes` would leave this package
    // uninstalled, and every test here would fail for a reason that has nothing
    // to do with what it tests.
    expect(workspaceGlobs()).toContain("packages/*");
  });

  it("declares a test script, which is what the workspace sweep runs", () => {
    expect(ownManifest.scripts?.test).toBe("vitest run");
  });

  it("sits alongside the other packages rather than inside one", () => {
    // Asserted because a suite that could see only its own package could not check
    // anything cross-package, which is the entire reason it exists.
    const packages = packageDirectoriesOf();
    for (const expected of [
      "packages/client",
      "packages/console",
      "packages/docs",
      "packages/fakes",
      "packages/invariants",
    ]) {
      expect(packages, `${expected} is not a workspace package`).toContain(expected);
    }
  });
});

describe("the Makefile is a Makefile make can read", () => {
  // **These two tests were red, and that was the finding.**
  //
  // A target name containing a colon is a *static pattern rule* to GNU Make, not a
  // target, so `.PHONY: generate:check` stopped make with `target pattern contains
  // no '%'` before it read a single recipe. `make` then refused to run at all:
  // `make check`, `make generate` and `make generate:check` all failed, and every
  // invariant in this package was unreachable.
  //
  // The build looked green the whole time, because the build did not run. That is
  // the failure mode this suite exists to prevent, and it happened anyway — which
  // is why the check is asserted rather than merely noted, and why it was written
  // red on purpose: a safety suite that cannot be reached is the one failure
  // nothing else reports.
  //
  // The fix applied was to *rename* the two targets, not to escape their colons.
  // Escaping has to be repeated in three places -- the `.PHONY` line, the rule, and
  // every prerequisite that names the target -- and getting one of the three wrong
  // stops make just as dead as getting all three wrong. A hyphen has none of those
  // failure modes. `generate:check` is now `generate-check`, `down:hard` is now
  // `down-hard`.
  //
  // These tests are green, and they must stay green: the point of them now is to
  // catch the next contributor who reaches for a colon in a target name.

  it("reports no .PHONY line make would refuse to parse", () => {
    expect(unparseablePhonyViolations(makefile)).toEqual([]);
  });

  it("catches the mistake in a Makefile with no others", () => {
    // The negative control, and the reason the check above can be trusted. Without
    // it, a check that finds two problems looks identical to a check that flags
    // everything, and it would be "fixed" by deleting the offending lines.
    const clean = [".PHONY: help generate", "generate:", "\t@echo hi", ""].join("\n");
    expect(unparseablePhonyViolations(clean)).toEqual([]);

    const broken = clean.replace(".PHONY: help generate", ".PHONY: help generate:check");
    expect(unparseablePhonyViolations(broken)).toHaveLength(1);
    expect(unparseablePhonyViolations(broken)[0]).toContain("static pattern rule");
  });

  it("still catches it when only the rule and prerequisite carry the colon", () => {
    // The bug had three faces, and fixing the `.PHONY` line alone would have left
    // two of them live. This control is why: it shows the check reads the whole
    // file, not just the line that happened to break first. An escaped `.PHONY`
    // line is genuinely fine, so the check must not fire on it -- and the real
    // Makefile, which is now free of colons in target names, proves it.
    const escaped = [".PHONY: generate\\:check", "generate\\:check:", "\t@echo hi", ""].join("\n");
    expect(unparseablePhonyViolations(escaped)).toEqual([]);

    // And the shape we actually chose: a hyphen, which needs no escaping anywhere.
    const renamed = [".PHONY: generate-check", "generate-check:", "\t@echo hi", ""].join("\n");
    expect(unparseablePhonyViolations(renamed)).toEqual([]);
    expect(makeTarget(renamed, "generate-check")).toBeDefined();
  });

  it("does not object to an ordinary .PHONY line", () => {
    // The check must not fire on the shape every other target in the file uses,
    // or it would be a check nobody could satisfy.
    expect(unparseablePhonyViolations(".PHONY: help install test\n")).toEqual([]);
    expect(unparseablePhonyViolations(".PHONY: generate\n")).toEqual([]);
  });

  it("does not object to a target declaration, which ends in a colon", () => {
    // `generate:` on its own line is a target with no prerequisites, which is
    // ordinary and appears throughout the file. Only a colon *inside* a name is
    // the problem.
    const ordinary = ["generate-check:", "\t@echo hi", ""].join("\n");
    expect(unparseablePhonyViolations(ordinary)).toEqual([]);
  });

  it("the two renamed targets are spelled without a colon", () => {
    // Pins the rename, so the remedy text this suite prints -- which names
    // `make generate-check` -- cannot drift back to a target make cannot read.
    expect(makeTarget(makefile, "generate-check")).toBeDefined();
    expect(makeTarget(makefile, "down-hard")).toBeDefined();
    expect(makeTarget(makefile, "generate:check")).toBeUndefined();
    expect(makeTarget(makefile, "down:hard")).toBeUndefined();
  });
});

describe("make check runs it", () => {
  it("the check target depends on the test sweep", () => {
    expect(checkRunsTests(makefile)).toBe(true);
  });

  it("the test target is the workspace sweep, not a hand-written list", () => {
    // A hand-written list would be a place to forget this package. The sweep is
    // `vp test`, which runs every workspace package that has a test script.
    const target = makeTarget(makefile, "test");
    expect(target).toBeDefined();
    expect(target).toContain("vp test");
  });

  it("notices when the check target stops running tests", () => {
    // The negative control, and the single edit that would silently retire every
    // invariant in this package.
    const stripped = makefile.replace(/^check:.*$/m, "check: lint typecheck generate-check");
    expect(checkRunsTests(makefile)).toBe(true);
    expect(checkRunsTests(stripped)).toBe(false);
  });

  it("notices when the check target is deleted outright", () => {
    // Distinguished from "present with no prerequisites", because a check that
    // could not tell those apart would pass for the wrong reason.
    const removed = makefile.replace(/^check:.*$/m, "# check: lint typecheck test");
    expect(makeTarget(makefile, "check")).toBeDefined();
    expect(makeTarget(removed, "check")).toBeUndefined();
    expect(checkRunsTests(removed)).toBe(false);
  });

  it("the targets the remedies name are real", () => {
    // Every message this suite prints says `make generate` or `make
    // generate-check`. A remedy naming a target that does not exist is worse than
    // no remedy: the reader runs it, gets "no such target", and has learned
    // nothing.
    const violations = makefileViolations(makefile);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("the generate-check pin ADR 0001 depends on is still there", () => {
    // ADR 0001's step 4 names `make generate-check` as the pin that survives after
    // the document stops being hand-authored. If the target is gone, the ADR's
    // handover has lost its mechanism, and that is worth failing on.
    expect(makeTarget(makefile, "generate-check")).toBeDefined();
    expect(makefile).toContain("git status --porcelain");
  });
});

describe("it is fast enough to run on every change", () => {
  it("bounds each orval run rather than trusting it to be quick", () => {
    // A generator that hangs must fail rather than wedge `make check` forever.
    // Generous enough that a cold, contended machine does not turn a passing
    // suite red; tight enough that a hang is a failure.
    const config = readFileSync(join(REPO_ROOT, "packages/invariants/vitest.config.ts"), "utf8");
    const timeout = Number(/testTimeout:\s*([\d_]+)/.exec(config)?.[1]?.replaceAll("_", "") ?? 0);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(120_000);
  });

  it("runs its generation tests three times over, not once per file", () => {
    // Stated so the cost is visible rather than incidental. Three orval runs at
    // roughly half a second each is the whole of this suite's wall clock; the
    // other ninety tests are milliseconds. Asserted as a count so that a
    // contribution adding a fourth generation has to be a decision.
    const sources = readFileSync(
      join(REPO_ROOT, "packages/invariants/tests/generation.test.ts"),
      "utf8",
    );
    const runs = [...sources.matchAll(/\bgenerate\(/g)].length;
    expect(runs).toBeGreaterThanOrEqual(3);
    expect(runs).toBeLessThanOrEqual(6);
  });
});

describe("it is a workspace test, so CI runs it", () => {
  it("the repository's CI description matches what this suite relies on", () => {
    // `docs/tech-stack.md` records the pipeline as `tsc` → lint → unit and
    // contract → build → Playwright. This suite is reached by the "unit and
    // contract" step, because it is an ordinary workspace test. Asserted so a
    // future pipeline that stops running workspace tests is caught here rather
    // than in a review three months later.
    const techStack = readFileSync(join(REPO_ROOT, "docs/tech-stack.md"), "utf8");
    expect(techStack).toMatch(/GitHub Actions/);
    expect(techStack).toMatch(/unit and contract/);
  });

  it("the root delegates to the toolchain rather than listing packages", () => {
    // `make test` is `vp test`, and the root has no test script that would
    // enumerate packages. Both mean there is no list for this package to fall out
    // of.
    expect(rootManifest.scripts?.test).toBeUndefined();
  });
});
