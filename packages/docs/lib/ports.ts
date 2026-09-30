import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * `config/ports.env` is the only place a port is written. The Makefile includes
 * it, docker compose reads it as an env file, and this module is what the
 * documentation site renders -- so the port map on the site cannot disagree with
 * the ports the stack actually binds.
 *
 * Nothing here hardcodes a port, or a description of one. The description of a
 * port is the comment sitting above it, minus the sentence that only restates
 * the number, so the prose lives in the registry too.
 */

export interface PortEntry {
  /** the variable name, e.g. `SOVREN_DOCS_PORT` */
  name: string;
  /** the port, as a number */
  port: number;
  /** the human description, taken from the comment above the assignment */
  description: string;
  /** the registry path, relative to the repository root */
  source: string;
}

export interface PortRegistry {
  /** the repository root -- the directory holding `config/` */
  root: string;
  /** the absolute path of the registry file */
  file: string;
  entries: PortEntry[];
}

const REGISTRY_RELATIVE_PATH = path.join("config", "ports.env");

/**
 * Walk up from `start` until the registry turns up.
 *
 * Walking beats a fixed `../../` because this module is read by three different
 * working directories -- `next dev`, `next build` and vitest -- and the built
 * server bundle is not laid out the way the source is.
 */
export function locateRegistry(start: string = process.cwd()): { root: string; file: string } {
  let dir = path.resolve(start);

  for (;;) {
    const file = path.join(dir, REGISTRY_RELATIVE_PATH);
    if (existsSync(file)) return { root: dir, file };

    const up = path.dirname(dir);
    if (up === dir) {
      throw new Error(`no ${REGISTRY_RELATIVE_PATH} found above ${start}`);
    }

    dir = up;
  }
}

/**
 * Drop the sentence that only restates the port number, keep the rest.
 *
 * `# The console. 4141 sits clear of Vite's 5173.` reads as "The console." --
 * the second sentence is commentary about the number, not about the service.
 */
function describe(comment: string[], port: number): string {
  const joined = comment.join(" ").replace(/\s+/g, " ").trim();
  if (joined === "") return "";

  const mentionsPort = new RegExp(`(^|\\D)${port}(\\D|$)`);

  return joined
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "" && !mentionsPort.test(sentence))
    .join(" ")
    .trim();
}

export function parsePortRegistry(source: string, file: string): PortEntry[] {
  const entries: PortEntry[] = [];
  let comment: string[] = [];

  for (const line of source.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "") {
      comment = [];
      continue;
    }

    if (trimmed.startsWith("#")) {
      comment.push(trimmed.replace(/^#+\s?/, ""));
      continue;
    }

    const assignment = /^(?<name>[A-Z0-9_]+)=(?<value>.*)$/.exec(trimmed);
    const groups = assignment?.groups;
    const name = groups?.["name"];
    const value = groups?.["value"];
    if (typeof name !== "string" || typeof value !== "string") continue;

    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port)) continue;

    entries.push({ name, port, description: describe(comment, port), source: file });
    comment = [];
  }

  return entries;
}

export function readPortRegistry(): PortRegistry {
  const { root, file } = locateRegistry();

  return {
    root,
    file,
    // Read while the site is being built: every route under /docs is
    // prerendered, so the running server never needs the registry. Saying so
    // keeps the bundler from tracing the whole repository into the output.
    entries: parsePortRegistry(
      readFileSync(/* turbopackIgnore: true */ file, "utf8"),
      path.relative(root, file),
    ),
  };
}
