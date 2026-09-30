import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { locateRegistry } from "./ports";

/**
 * The runbook promises an operator that every command in it can be pasted. This
 * is the reader that makes the promise checkable: it takes the Makefile apart
 * the same way make does and hands back the targets it actually declares.
 */

/**
 * Located on demand rather than at import: the Makefile is only ever read while
 * a page is being built, and a missing one at runtime should not be able to
 * take the server down on import.
 */
export function makefilePath(): string {
  return path.join(locateRegistry().root, "Makefile");
}

/**
 * A target is a line like `install:`, `check: lint typecheck test` or
 * `down:hard:`. It does not start with whitespace, `#` or `.` (which excludes
 * `.PHONY`), and the colon is not a `:=` assignment.
 */
const TARGET = /^(?!\s)([A-Za-z0-9_][\w.%/-]*(?::[A-Za-z0-9_][\w.%/-]*)*):(?!=)/;

/**
 * `@mkdir -p foo:` at the start of a recipe would look like a target, so only
 * lines that are not tab-indented and not a shell assignment are considered.
 */
export function parseMakeTargets(source: string): string[] {
  const targets = new Set<string>();

  for (const line of source.split("\n")) {
    if (line === "" || line.startsWith("\t") || line.startsWith("#") || line.startsWith(".")) {
      continue;
    }

    const name = TARGET.exec(line)?.[1];
    if (name) targets.add(name);
  }

  return [...targets].sort();
}

export function readMakeTargets(file: string = makefilePath()): string[] {
  if (!existsSync(file)) throw new Error(`no Makefile at ${file}`);

  return parseMakeTargets(readFileSync(file, "utf8"));
}
