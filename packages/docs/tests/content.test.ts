import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { locateRegistry } from "../lib/ports";

const repoRoot = locateRegistry().root;
const packageRoot = path.join(repoRoot, "packages", "docs");
const source = readFileSync(path.join(packageRoot, "lib", "source.ts"), "utf8");

/**
 * The claim these tests hold is that content is sourced by glob over the
 * repository rather than from a list of files, so the patterns in
 * `lib/source.ts` are read out of that file and checked against what is
 * actually on disk.
 */
interface Collection {
  dir: string;
  files: string[];
}

function collections(): Collection[] {
  return [...source.matchAll(/dir:\s*"(?<dir>[^"]+)"[\s\S]*?files:\s*\[(?<files>[^\]]*)\]/g)].map(
    (match) => {
      const dir = match.groups?.["dir"];
      const files = match.groups?.["files"];

      expect(dir, "a collection without a dir").toBeDefined();
      expect(files, "a collection without file patterns").toBeDefined();

      return {
        dir: path.resolve(packageRoot, dir ?? ""),
        files: [...(files ?? "").matchAll(/"([^"]+)"/g)].map(([, file]) => file ?? ""),
      };
    },
  );
}

/**
 * `**` spans directories, `*` spans anything but a separator. The characters
 * that mean something to a regular expression are escaped one at a time rather
 * than with a character class, which keeps this readable at the cost of a
 * little ceremony.
 */
const REGEX_SPECIALS = ".+?^${}()|[]\\";

function matches(pattern: string, file: string): boolean {
  const globstar = "\u0000";

  const body = pattern
    .split("")
    .map((char) => (REGEX_SPECIALS.includes(char) ? `\\${char}` : char))
    .join("")
    .split("**/")
    .join(globstar)
    .split("*")
    .join("[^/]*")
    .split(globstar)
    .join("(?:.*/)?");

  return new RegExp(`^${body}$`).test(file);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("how the site finds its content", () => {
  test("sources from globs over the repository, not from a list of files", () => {
    const patterns = collections().flatMap(({ files }) => files);

    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      // A pattern naming a file would be a list wearing a disguise.
      expect(pattern, `"${pattern}" names files instead of globbing`).toContain("*");
    }
  });

  test("reaches the repository's own docs and the site's own content", () => {
    expect(
      collections()
        .map(({ dir }) => path.relative(repoRoot, dir))
        .sort(),
    ).toEqual(["content", "docs"]);
  });

  test("covers every markdown file that exists, so none is silently absent", () => {
    const orphans: string[] = [];

    for (const dir of ["docs", "content"]) {
      for (const file of walk(path.join(repoRoot, dir))) {
        if (!/\.(md|mdx|json|ya?ml)$/.test(file)) continue;

        // patterns are relative to their own collection's directory
        const reached = collections().some((collection) =>
          collection.files.some((pattern) => matches(pattern, path.relative(collection.dir, file))),
        );

        if (!reached) orphans.push(path.relative(repoRoot, file));
      }
    }

    expect(orphans).toEqual([]);
  });

  test("an ADR written tomorrow is picked up with nothing to edit", () => {
    const tomorrow = path.join(repoRoot, "docs", "adr", "0002-a-decision-nobody-has-made-yet.md");

    const reaches = collections().some((collection) =>
      collection.files.some((pattern) => matches(pattern, path.relative(collection.dir, tomorrow))),
    );

    expect(reaches).toBe(true);
  });
});

describe("the files the globs reach", () => {
  const files = collections().flatMap(({ dir, files: patterns }) =>
    walk(dir).filter(
      (file) =>
        /\.(md|mdx)$/.test(file) && patterns.some((p) => matches(p, path.relative(dir, file))),
    ),
  );

  test("are not empty", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("each has a title, from frontmatter or from its own first heading", () => {
    const untitled = files.filter((file) => {
      const body = readFileSync(file, "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(body)?.[1] ?? "";

      return (
        !/^title:\s*\S/m.test(frontmatter) &&
        !/^# \S/m.test(body.replace(/^---\n[\s\S]*?\n---\n/, ""))
      );
    });

    expect(untitled.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });
});
