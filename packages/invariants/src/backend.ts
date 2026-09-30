/**
 * The two things the checks need that only exist at runtime or on disk: the
 * endpoints the mock backend actually serves, and the repository's own sources
 * to scan for identifiers.
 *
 * Both are here rather than in `checks.ts` so that `checks.ts` stays a set of
 * pure functions, which is what makes the negative controls possible.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { sovrenHandlers } from "@sovren/fakes";

import { REPO_ROOT, repoPath } from "./repo";

/* -------------------------------------------------------------------------- */
/* What the mock backend serves                                                */
/* -------------------------------------------------------------------------- */

/**
 * The endpoints the mock backend serves, as `METHOD /path` in the document's
 * own spelling.
 *
 * Read off the live handler list rather than parsed out of `handlers.ts` as
 * text. That matters: the mock backend's central claim is that the method and
 * path of every endpoint are read off the generated handler, so reading them off
 * the live handlers is reading them off the generator. A text scan would be
 * reading the same claim from a source file that could say one thing and do
 * another.
 *
 * MSW spells a path parameter `:vm` where OpenAPI spells it `{vm}`, and prefixes
 * the base URL, so both are normalised here. The result is directly comparable
 * to the document's `endpointKey`.
 */
export const servedEndpoints = (): string[] => {
  const endpoints = new Set<string>();

  for (const handler of sovrenHandlers()) {
    const info = handler.info as { method?: string; path?: unknown };
    const path = info.path;
    if (typeof info.method !== "string" || typeof path !== "string") {
      // `guard.ts` throws on this rather than guessing, so reaching it means the
      // generated handler moved in a way the backend cannot mirror. Surfacing it
      // as an unservable endpoint keeps the coverage check honest.
      endpoints.add(`UNMIRRORED ${String(path)}`);
      continue;
    }
    endpoints.add(`${info.method.toUpperCase()} ${normalisePath(path)}`);
  }

  return [...endpoints].sort();
};

/** `* / api / v1 / vms / :vm` becomes `/vms/{vm}`. */
export const normalisePath = (path: string): string =>
  path.replace(/^\*\/api\/v1/, "").replace(/:([A-Za-z0-9_]+)/g, "{$1}");

/* -------------------------------------------------------------------------- */
/* The repository's own sources                                                */
/* -------------------------------------------------------------------------- */

export interface SourceFile {
  /** Repository-relative, so a failure message points somewhere clickable. */
  readonly where: string;
  readonly source: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Directories that are not the repository's own code, and are therefore not
 * subject to its conventions.
 *
 * `src/generated` is the generator's output — the very thing the suite exists to
 * keep honest, and a file with a faker-minted `id` there is correct. `node_modules`
 * and `dist` are not ours. `refs/` is vendored upstream material.
 */
const EXCLUDED = ["/node_modules/", "/src/generated/", "/dist/", "/refs/", "/.scratch/"];

/**
 * This package, excluded from its own name scan.
 *
 * Not a convenience. The safety suite has to *name* the rule it enforces — a
 * constant called `PERMITTED_SERVICE_NAMES` is the rule, written down — and a
 * check that flagged the vocabulary of its own rule would be a check that could
 * not be written. A noun invented here would still be caught by the estate and
 * document checks it shares with the other packages; what is lost is only the
 * ability to catch a resource type declared in a package whose entire content is
 * checks, which is not a thing this package has.
 */
const SELF = "/packages/invariants/";

const walk = (dir: string, into: string[] = []): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return into;
  }

  for (const entry of entries) {
    const absolute = join(dir, entry);
    const repoRelative = `/${relative(REPO_ROOT, absolute).split("\\").join("/")}`;
    if (EXCLUDED.some((fragment) => repoRelative.includes(fragment))) continue;
    if (statSync(absolute).isDirectory()) walk(absolute, into);
    else if (SOURCE_EXTENSIONS.has(extname(entry))) into.push(absolute);
  }
  return into;
};

/**
 * Every TypeScript source the repository owns, package sources and tests alike.
 *
 * Tests are included deliberately. A hard-coded identifier in a test is a
 * fixture, and a fixture with a malformed id renders a broken row exactly as
 * readily as one in the estate builder — the difference is only that it never
 * passes through the world builder on its way to the screen.
 *
 * `packages/console` is included, and that is a live bet: the console is being
 * written while this suite runs, so a malformed id there fails the build. That is
 * the invariant working, not the suite being wrong.
 *
 * `packages/invariants` is excluded, and the reason is in `SELF` above.
 */
export const repositorySources = (): SourceFile[] =>
  walk(join(REPO_ROOT, "packages"))
    .filter((absolute) => !absolute.includes("/node_modules/"))
    .filter((absolute) => !absolute.includes(SELF))
    .map((absolute) => ({ where: repoPath(absolute), source: readFileSync(absolute, "utf8") }));

/** Every workspace package directory, for reporting what was scanned. */
export const packageDirectories = (): string[] => {
  const root = join(REPO_ROOT, "packages");
  return readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory())
    .map((entry) => `packages/${entry}`)
    .sort();
};
