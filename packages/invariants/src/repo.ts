/**
 * Where everything is, and how to read it.
 *
 * This package asserts properties of the *repository* rather than of any one
 * package, so it has to know the shape of all of them: the document at the root,
 * the generated tree under `packages/client`, the world builder under
 * `packages/fakes`, and the toolchain configuration that decides what `make
 * generate` will produce. Every path is derived from this module's own location
 * rather than from the working directory, because the working directory of a
 * test is whichever package the runner happened to enter, and an invariant that
 * resolves `openapi/sovren.json` relative to that is an invariant that passes in
 * one package and silently checks nothing in another.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, three levels up from `packages/invariants/src`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const CONTRACT_PATH = join(REPO_ROOT, "openapi/sovren.json");

export const CLIENT_PACKAGE = join(REPO_ROOT, "packages/client");

/**
 * The generated tree. `vite.config.ts` excludes exactly this pattern from fmt
 * and lint, and the exclusion is the reason a clean tree means "regenerate and
 * get no diff" rather than "somebody fixed the generator's output by hand".
 */
export const GENERATED_DIR = join(CLIENT_PACKAGE, "src/generated");

/** The orval binary, resolved through the client package that declares it. */
export const ORVAL_BIN = join(CLIENT_PACKAGE, "node_modules/.bin/orval");

/** The mutator the generated client imports. Copied, never read in place. */
export const MUTATOR_PATH = join(CLIENT_PACKAGE, "src/safe-fetch.ts");

export const ORVAL_CONFIG = join(CLIENT_PACKAGE, "orval.config.ts");

/** The toolchain configuration that decides what fmt and lint touch. */
export const VITE_CONFIG = join(REPO_ROOT, "vite.config.ts");

export const repoPath = (absolute: string): string => relative(REPO_ROOT, absolute);

/* -------------------------------------------------------------------------- */
/* The contract document                                                      */
/* -------------------------------------------------------------------------- */

export interface Schema {
  $ref?: string;
  type?: string | string[];
  enum?: readonly string[];
  required?: readonly string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  oneOf?: readonly Schema[];
  allOf?: readonly Schema[];
  description?: string;
  pattern?: string;
}

export interface Parameter {
  $ref?: string;
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: Schema;
}

export interface Response {
  $ref?: string;
  description?: string;
  content?: Record<string, { schema?: Schema }>;
}

export interface Operation {
  operationId?: string;
  tags?: readonly string[];
  parameters?: readonly Parameter[];
  responses?: Record<string, Response>;
}

export interface Document {
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, Operation>>;
  components: {
    parameters: Record<string, Parameter>;
    responses: Record<string, Response>;
    schemas: Record<string, Schema>;
  };
}

export const readDocument = (): Document =>
  JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as Document;

export const METHODS = ["get", "post", "put", "patch", "delete"] as const;

export interface Declared {
  readonly path: string;
  readonly method: string;
  readonly operationId: string;
  readonly operation: Operation;
}

export const declaredOperations = (doc: Document): Declared[] =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => (METHODS as readonly string[]).includes(method))
      .map(([method, operation]) => ({
        path,
        method,
        operationId: (operation as Operation).operationId ?? "",
        operation: operation as Operation,
      })),
  );

/* -------------------------------------------------------------------------- */
/* The generated tree                                                         */
/* -------------------------------------------------------------------------- */

/** A generated file's contents, keyed by its path relative to the tree root. */
export type Tree = ReadonlyMap<string, string>;

/** Every file under `root`, as a path relative to `root`, sorted. */
export const listFiles = (root: string, prefix = ""): string[] => {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .flatMap((entry) => {
      const absolute = join(root, entry);
      const relativePath = prefix === "" ? entry : `${prefix}/${entry}`;
      return statSync(absolute).isDirectory() ? listFiles(absolute, relativePath) : [relativePath];
    })
    .sort();
};

/** Read a whole tree into memory. Cheap: the generated tree is a few hundred kB. */
export const readTree = (root: string): Tree => {
  const files = new Map<string, string>();
  for (const relativePath of listFiles(root)) {
    files.set(relativePath, readFileSync(join(root, relativePath), "utf8"));
  }
  return files;
};
