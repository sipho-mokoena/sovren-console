/**
 * A fresh generation, into a temporary directory, from the committed document.
 *
 * The whole safety suite rests on being able to ask "what would the generator
 * produce right now?" and compare the answer against what is committed. That
 * question cannot be answered by running the generator in place, because the
 * generator deletes and rewrites `src/generated/` wholesale -- so asking it would
 * destroy the evidence. Hence a temporary tree, and hence this module.
 *
 * **The real orval config is imported, not copied.** A hand-maintained copy of
 * `packages/client/orval.config.ts` inside the safety suite would be a second
 * statement of how the client is generated, and it would drift the moment
 * somebody added a third output. This reads the committed config and rewrites
 * only the three things that must move: where the output goes, where the input
 * comes from, and where the mutator is read from. Everything else -- the client
 * flavour, the mode, the mock generator, the mutator's name -- is whatever the
 * repository says it is, so a config change cannot be absorbed by a stale test.
 *
 * **The mutator is copied rather than referenced.** Orval writes an import
 * specifier for the mutator relative to the file it is writing, so pointing at
 * the real `src/safe-fetch.ts` from a temporary tree produces an import of
 * `../../../../home/you/Workspace/.../safe-fetch` and every generated file
 * differs. Copying the file to the same relative position inside the temporary
 * root makes the generated import identical to the committed one, which is what
 * lets a byte comparison mean anything.
 *
 * **The config runs with `packages/client` as its working directory**, because
 * that is where `@tanstack/react-query` is installed and orval reads its major
 * version from the nearest `package.json` to decide the shape of the hooks it
 * emits. Generate from anywhere else and every hook file differs, for a reason
 * that has nothing to do with drift.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLIENT_PACKAGE, MUTATOR_PATH, ORVAL_BIN, readTree, type Tree } from "./repo";

/** Where a generation ran, and what it produced. */
export interface Generation {
  /** The temporary root. Removed by `dispose`; the caller owns it until then. */
  readonly root: string;
  readonly tree: Tree;
}

export interface GenerateOptions {
  /** Generate from this document rather than the committed one. */
  readonly documentPath?: string;
  /** Keep the temporary tree, for a test that wants to read the failure. */
  readonly keep?: boolean;
}

/**
 * A temporary root shaped like `packages/client`, so relative paths inside the
 * generated tree come out the same as they do in the committed one.
 */
const scaffold = (): string => {
  const root = mkdtempSync(join(tmpdir(), "sovren-invariants-"));
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(MUTATOR_PATH, join(root, "src/safe-fetch.ts"));
  return root;
};

/**
 * The relocated config, written as TypeScript because orval reads a `.ts` config
 * and because the real config is one.
 *
 * It imports the committed config by absolute path and rewrites three fields.
 * The rewrite is written defensively -- a field that is absent or of an
 * unexpected shape is left alone rather than guessed at -- and the caller
 * compares the *result*, so a rewrite that quietly did nothing shows up as a
 * diff rather than as a passing test.
 */
const configSource = (root: string, documentPath: string): string => `
import real from ${JSON.stringify(join(CLIENT_PACKAGE, "orval.config.ts"))};

const root = ${JSON.stringify(root)};
const relocate = (path) => path.replace(/^.*src\\/generated/, \`\${root}/src/generated\`);

const relocated = {};
for (const [name, config] of Object.entries(real)) {
  const output = { ...config.output };
  if (typeof output.target === "string") output.target = relocate(output.target);
  if (typeof output.schemas === "string") {
    output.schemas = relocate(output.schemas);
  } else if (output.schemas !== null && typeof output.schemas === "object") {
    output.schemas = { ...output.schemas, path: relocate(output.schemas.path) };
  }
  const mutator = output.override?.mutator;
  if (mutator !== null && typeof mutator === "object" && mutator !== undefined) {
    output.override = { ...output.override, mutator: { ...mutator, path: \`\${root}/src/safe-fetch.ts\` } };
  }
  // orval reads the react-query major version from the package.json nearest the
  // output, and emits a different hook shape per major. Pinning it to the
  // client's own package.json is what makes the temporary generation comparable.
  output.packageJson = ${JSON.stringify(join(CLIENT_PACKAGE, "package.json"))};
  relocated[name] = { ...config, input: { target: ${JSON.stringify(documentPath)} }, output };
}

export default relocated;
`;

/**
 * Run the generator, read what it produced, and hand back the tree.
 *
 * Throws if orval is missing or fails, because a safety suite that skips its
 * central check when the tool is absent is worse than no suite: it reports green
 * and the drift it exists to catch ships.
 */
export const generate = (options: GenerateOptions = {}): Generation => {
  const root = scaffold();
  const documentPath = options.documentPath ?? join(CLIENT_PACKAGE, "../../openapi/sovren.json");
  const configPath = join(root, "orval.config.ts");
  writeFileSync(configPath, configSource(root, documentPath), "utf8");

  try {
    execFileSync(ORVAL_BIN, ["--config", configPath], {
      cwd: CLIENT_PACKAGE,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      `The safety suite could not run the generator, so it cannot prove the generated tree is current.\n` +
        `  orval: ${ORVAL_BIN}\n` +
        `  ${detail}\n` +
        `  fix: run 'make install' so the client package has orval, then re-run.`,
      { cause },
    );
  }

  const tree = readTree(join(root, "src/generated"));
  if (options.keep !== true) rmSync(root, { recursive: true, force: true });
  return { root, tree };
};

/** The generated tree as it is committed, read into memory. */
export const committedTree = (): Tree => readTree(join(CLIENT_PACKAGE, "src/generated"));

/** The mutator, read from the committed location. Used to prove it was copied. */
export const readMutator = (): string => readFileSync(MUTATOR_PATH, "utf8");
