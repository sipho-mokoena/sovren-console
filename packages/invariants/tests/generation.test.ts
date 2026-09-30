import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { committedTree, generate, readMutator, type Generation } from "../src/generate";
import {
  generationViolations,
  handEditViolations,
  ignorePatternViolations,
  makefileViolations,
  messageViolations,
  treeDrift,
  versionViolations,
  generatedVersion,
  isReexportBarrel,
  type TreeDrift,
} from "../src/checks";
import { formatAll, poorlyFormed } from "../src/violation";
import {
  CLIENT_PACKAGE,
  GENERATED_DIR,
  MUTATOR_PATH,
  ORVAL_CONFIG,
  REPO_ROOT,
  VITE_CONFIG,
  readDocument,
  type Tree,
} from "../src/repo";

/**
 * Invariants 1, 2, 3 and 7: the generated tree is what the generator produces,
 * at the version the document says, and every failure says what to do.
 *
 * The suite generates once, into a temporary tree, and compares. Generating in
 * place would answer the question by destroying the evidence, and would also
 * mean a failing run left the working tree modified, which is a thing an agent
 * sharing this repository would have to unpick.
 */

let fresh: Tree;
let committed: Tree;

beforeAll(() => {
  fresh = generate().tree;
  committed = committedTree();
}, 120_000);

describe("a fresh generation reproduces the committed tree exactly", () => {
  it("writes the same files, with the same bytes", () => {
    const violations = generationViolations(fresh, committed);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("generated something, so the comparison above was not vacuous", () => {
    // A generator that fails silently and writes nothing would make every
    // comparison above pass for the wrong reason. This is the check that says
    // the comparison had a subject.
    expect(fresh.size).toBeGreaterThan(50);
    expect(committed.size).toBe(fresh.size);
  });

  it("reads the orval config the client package actually declares", () => {
    // The temporary generation imports the committed config rather than
    // restating it, so a change to the real config cannot be absorbed by a stale
    // copy here. This asserts the two things that copy depends on: the config
    // exists, and the mutator it names is the one that was copied.
    expect(existsSync(ORVAL_CONFIG)).toBe(true);
    const config = readFileSync(ORVAL_CONFIG, "utf8");
    expect(config).toContain("safe-fetch.ts");
    expect(readMutator()).toBe(readFileSync(MUTATOR_PATH, "utf8"));
  });
});

describe("a hand-edit to a generated artefact is caught", () => {
  it("catches a model whose field was renamed by hand", () => {
    // The negative control for invariant 2, and the one that matters most: the
    // shape a `vp check --fix` rewrite would have left behind, which is a
    // generated file with a line changed in it and nothing saying so.
    const doctored = new Map(committed);
    const target = "model/node.ts";
    const original = committed.get(target);
    expect(original, `${target} is in the generated tree`).toBeDefined();
    doctored.set(target, (original ?? "").replace("proxmoxVersion", "proxmox_version"));

    const violations = handEditViolations(fresh, doctored);
    expect(violations.map((entry) => entry.what)).toContain(
      "packages/client/src/generated/model/node.ts",
    );
    expect(violations[0]?.detail).toContain("has edited it");
    expect(violations[0]?.remedy).toContain("make generate");
  });

  it("catches a validator that was deleted to make a type error go away", () => {
    const doctored = new Map(committed);
    doctored.delete("zod/node.zod.ts");

    // A deleted file is not a hand-edit, it is drift, and the two have different
    // remedies. Asserting the distinction is the point.
    expect(handEditViolations(fresh, doctored)).toEqual([]);
    const drift = generationViolations(fresh, doctored);
    expect(drift.map((entry) => entry.invariant)).toEqual(["regeneration-drift"]);
    expect(drift[0]?.detail).toContain("not committed");
  });

  it("catches a file that was added to the generated tree by hand", () => {
    const doctored = new Map(committed);
    doctored.set("model/handwritten.ts", "export const invented = true;\n");

    const violations = generationViolations(fresh, doctored);
    expect(violations.map((entry) => entry.invariant)).toEqual(["regeneration-drift"]);
    expect(violations[0]?.detail).toContain("no longer writes it");
  });

  it("catches a document change that nobody regenerated for", () => {
    // The other end of the same comparison, and the one ADR 0001 calls the one
    // drift this repository can currently have. A changed shape in the document
    // produces different bytes, which is what the check reads.
    const doctored = new Map(committed);
    const target = "model/node.ts";
    const original = committed.get(target) ?? "";
    doctored.set(target, original.replace("export interface Node {", "export interface Machine {"));

    const violations = generationViolations(fresh, doctored);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe(`packages/client/src/generated/${target}`);
    expect(violations[0]?.detail).toContain("openapi/sovren.json");
  });

  it("reports nothing at all for a tree that matches", () => {
    expect(handEditViolations(fresh, committed)).toEqual([]);
    expect(treeDrift(fresh, committed)).toEqual({ changed: [], missing: [], orphaned: [] });
  });

  it("quotes the line that differs, so the message is worth reading", () => {
    const doctored = new Map(committed);
    const target = "model/task.ts";
    doctored.set(target, (committed.get(target) ?? "").replace("lastSeq", "last_sequence"));

    const drift: TreeDrift = treeDrift(fresh, doctored);
    expect(drift.changed).toEqual([target]);

    const violations = generationViolations(fresh, doctored);
    // The message carries a line number and the offending text. Without it the
    // reader opens a 400-line generated file and greps for what changed.
    expect(violations[0]?.detail).toMatch(/\d+ \| .*last_sequence/);
  });
});

describe("the generated tree is excluded from the tools that would rewrite it", () => {
  it("keeps fmt and lint off src/generated", () => {
    const config = readFileSync(VITE_CONFIG, "utf8");
    const violations = ignorePatternViolations(config);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("notices when the exclusion is gone", () => {
    // The negative control. The day the `ignorePatterns` entry is dropped,
    // `vp check --fix` starts editing generated output again and produces exactly
    // the hand-edits the suite above exists to catch — while the suite itself
    // would keep passing, because the fixer and the suite would have come to
    // disagree about what a clean tree means.
    const stripped = readFileSync(VITE_CONFIG, "utf8").replaceAll("**/src/generated/**", "refs/**");
    const violations = ignorePatternViolations(stripped);
    expect(violations.map((entry) => entry.invariant)).toEqual([
      "generated-excluded-from-tooling",
      "generated-excluded-from-tooling",
    ]);
    expect(violations[0]?.remedy).toContain("ignorePatterns");
  });
});

describe("the document version and the generated version agree", () => {
  it("every generated file carries the document's version", () => {
    const document = readDocument();
    const violations = versionViolations(document, committed);
    expect(violations, formatAll(violations)).toEqual([]);
  });

  it("every generated file carries a version, or is a re-export barrel", () => {
    // Stated separately because "the versions disagree" and "there is no
    // version" are different failures with different causes: the first is a
    // partial regeneration, the second is a file the generator did not write.
    //
    // Orval's two barrels — `index.ts` and `zod/index.ts` — are pure re-export
    // lists and carry no header. They are exempt by shape, not by name, and the
    // exemption is asserted here so that widening it to a hand-written file is a
    // visible change rather than a silent one.
    const headerless = [...committed]
      .filter(([path, contents]) => path.endsWith(".ts") && generatedVersion(contents) === null)
      .map(([path, contents]) => ({ path, barrel: isReexportBarrel(contents) }));
    expect(headerless.filter((entry) => !entry.barrel)).toEqual([]);
    expect(headerless.map((entry) => entry.path).sort()).toEqual(["index.ts", "zod/index.ts"]);
  });

  it("fails on a mismatch, and says which document version is authoritative", () => {
    const document = structuredClone(readDocument());
    document.info.version = "0.2.0-prototype";

    const violations = versionViolations(document, committed);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.detail).toContain("0.2.0-prototype");
    expect(violations[0]?.detail).toContain("0.1.0-prototype");
    expect(violations[0]?.remedy).toContain("make generate");
  });

  it("fails on a file with no version, calling it a hand-written file", () => {
    const doctored = new Map(committed);
    doctored.set("model/handwritten.ts", "export const invented = true;\n");

    const violations = versionViolations(readDocument(), doctored);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.what).toBe("packages/client/src/generated/model/handwritten.ts");
    expect(violations[0]?.detail).toContain("orval did not write it");
  });

  it("exempts a re-export barrel, so the check does not cry wolf twice a run", () => {
    // The negative control for the exemption. A barrel whose every line is a
    // re-export is exempt whatever it is called; anything else is not, so the
    // exemption cannot be widened into a blind spot by renaming a file.
    const barrel = new Map<string, string>([
      ["index.ts", "export * from './node/node';\nexport type { X } from './node/node';\n"],
    ]);
    expect(versionViolations(readDocument(), barrel)).toEqual([]);

    const notABarrel = new Map<string, string>([
      ["index.ts", "export * from './node/node';\nconst invented = 1;\n"],
    ]);
    expect(versionViolations(readDocument(), notABarrel)).toHaveLength(1);
  });

  it("ignores files that are not TypeScript", () => {
    // A `.json` in the generated tree has no header and never will. Failing it
    // would train the reader to ignore this check.
    const doctored = new Map<string, string>([["fixtures/estate.json", "{}\n"]]);
    expect(versionViolations(readDocument(), doctored)).toEqual([]);
  });
});

describe("the failure messages are actionable", () => {
  it("every violation the suite can produce names a subject and a remedy", () => {
    // The acceptance criterion, checked rather than promised. Built from a
    // corpus of deliberately broken inputs so that the check runs against real
    // violations rather than a hand-written sample of what one looks like.
    const document = readDocument();
    const doctoredDocument = structuredClone(document);
    doctoredDocument.info.version = "9.9.9";
    doctoredDocument.paths["/invented"] = {
      get: { operationId: "InventedList", responses: {} },
    };
    doctoredDocument.components.schemas.Invented = { properties: { id: { type: "string" } } };

    const edited = new Map(committed);
    edited.set("model/node.ts", (committed.get("model/node.ts") ?? "") + "\n// hand-written\n");
    edited.set("model/extra.ts", "export const x = 1;\n");

    const corpus = [
      ...generationViolations(fresh, edited),
      ...handEditViolations(fresh, edited),
      ...versionViolations(doctoredDocument, edited),
      ...makefileViolations("nothing here\n"),
      ...ignorePatternViolations("export default {}\n"),
    ];

    expect(corpus.length).toBeGreaterThan(5);
    const problems = poorlyFormed(corpus);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("turns a message the suite would print into a violation about the message", () => {
    // The check itself, rather than only the assertions that use it.
    // `messageViolations` is the function a future check's author calls on their
    // own output, and it is here to say so: it reports the *offending* violation
    // rather than asserting on a hand-written sample, which is what makes it
    // usable as a guard rather than a description.
    const reported = messageViolations([
      {
        invariant: "regeneration-drift",
        what: "model/node.ts",
        detail: "differs",
        remedy: "make generate",
      },
      { invariant: "regeneration-drift", what: "", detail: "differs", remedy: "make generate" },
    ]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.invariant).toBe("actionable-failure");
    expect(reported[0]?.what).toBe("");

    expect(
      messageViolations([{ invariant: "x", what: "y", detail: "z", remedy: "make generate" }]),
    ).toEqual([]);
  });

  it("notices a violation that names nothing", () => {
    // The negative control for the check above. A validator nobody has seen
    // reject anything is a validator nobody should trust, and an actionability
    // check that cannot fail is a comment.
    const problems = poorlyFormed([
      {
        invariant: "regeneration-drift",
        what: "",
        detail: "a file differs",
        remedy: "make generate",
      },
    ]);
    expect(problems).toEqual(["[regeneration-drift] names nothing"]);
  });

  it("notices a violation that offers no way to fix it", () => {
    const problems = poorlyFormed([
      {
        invariant: "regeneration-drift",
        what: "model/node.ts",
        detail: "a file differs",
        remedy: "   ",
      },
    ]);
    expect(problems).toEqual(["[regeneration-drift] model/node.ts offers no way to fix it"]);
  });

  it("notices a violation that says what is wrong but not how", () => {
    const problems = poorlyFormed([
      { invariant: "x", what: "y", detail: "", remedy: "make generate" },
    ]);
    expect(problems).toEqual(["[x] y says what is wrong but not how"]);
  });

  it("the remedy the suite prints is a target the Makefile actually has", () => {
    // A remedy naming a target that does not exist is worse than no remedy: the
    // reader runs it, gets "no such target", and has learned nothing.
    const makefile = readFileSync(join(REPO_ROOT, "Makefile"), "utf8");
    expect(makefileViolations(makefile)).toEqual([]);
  });
});

describe("the generation is repeatable", () => {
  it("produces the same tree twice, so a diff means drift and not a flake", () => {
    // Worth the second run. A generator whose output varies between runs would
    // make every check above intermittent, and an intermittent safety suite is
    // one people learn to re-run rather than read.
    const second = generate().tree;
    const third = treeDrift(second, fresh);
    expect(third, formatAll(generationViolations(second, fresh))).toEqual({
      changed: [],
      missing: [],
      orphaned: [],
    });
  }, 120_000);
});

describe("the generated tree is where the suite believes it is", () => {
  it("reads the tree under packages/client/src/generated", () => {
    // The suite resolves every path from its own module location rather than
    // from the working directory, because the working directory of a test is
    // whichever package the runner entered. This asserts the resolution, so a
    // future refactor that reintroduces a cwd-relative path fails here.
    expect(GENERATED_DIR).toBe(join(CLIENT_PACKAGE, "src/generated"));
    expect(existsSync(GENERATED_DIR)).toBe(true);
    expect(committed.size).toBeGreaterThan(50);
  });
});

describe("the generator runs, rather than being assumed to", () => {
  it("reports the generated root, and cleans it up", () => {
    // `keep: false` is the default and the suite relies on it: 120 orval runs
    // across a `make check` would otherwise leave 120 temporary trees behind.
    const generation: Generation = generate();
    expect(generation.root).toMatch(/sovren-invariants-/);
    expect(existsSync(generation.root)).toBe(false);
  }, 120_000);
});
