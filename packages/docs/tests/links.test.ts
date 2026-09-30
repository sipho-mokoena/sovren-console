import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { locateRegistry } from "../lib/ports";

const repoRoot = locateRegistry().root;
const contentDir = path.join(repoRoot, "content");

/** A link the site's own prose uses, e.g. `/docs/guide/ports#a-heading`. */
interface PageLink {
  page: string;
  fragment?: string;
}

function linksIn(markdown: string): PageLink[] {
  return [...markdown.matchAll(/\]\((?<url>\/docs\/[^)\s]*)\)/g)].flatMap((match) => {
    const url = match.groups?.["url"];
    if (!url) return [];

    const [page, fragment] = url.split("#");
    return [{ page: page ?? "", fragment }];
  });
}

/**
 * The site's URLs are file paths, so a link either names a file that exists or
 * it is broken. Resolving a link to a file rather than to a page keeps this
 * check independent of the loader that builds the pages.
 */
function fileFor(page: string): string | undefined {
  const relative = page.replace(/^\/docs\//, "").replace(/^guide\//, "");
  const roots = [path.join(repoRoot, "docs"), contentDir, repoRoot];
  const found = roots.flatMap((root) =>
    [
      path.join(root, relative),
      path.join(root, `${relative}.md`),
      path.join(root, `${relative}.mdx`),
    ].filter((candidate) => existsSync(candidate) && !candidate.endsWith(path.sep)),
  );

  return found.length === 1 ? found[0] : undefined;
}

/** Heading anchors are the slug of the heading text. */
function slug(heading: string): string {
  return heading
    .replace(/[*_`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function headingsIn(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/^#{1,6} +(.*)$/gm)].map(([, text]) =>
    slug(text ?? ""),
  );
}

const pages = ["index.mdx", "runbook.mdx", "ports.mdx", "glossary.mdx"];

describe("the links in the pages the site owns", () => {
  const links = pages.flatMap((from) =>
    linksIn(readFileSync(path.join(contentDir, from), "utf8")).map((link) => ({ from, ...link })),
  );

  test("there are some to check", () => {
    expect(links.length).toBeGreaterThan(5);
  });

  test("all resolve to a file in the repository", () => {
    const broken = links
      .filter((link) => fileFor(link.page) === undefined)
      .map((link) => `${link.from} -> ${link.page}`);

    expect(broken).toEqual([]);
  });

  test("the resolver is not vacuous -- it finds the pages that do exist", () => {
    const found = links.map((link) => fileFor(link.page)).filter(Boolean);

    expect(found.length).toBe(links.length);
  });

  test("every fragment resolves to a heading in the file it points at", () => {
    const broken = links.flatMap((link) => {
      if (!link.fragment) return [];

      const file = fileFor(link.page);
      if (!file) return [];

      return headingsIn(file).includes(link.fragment)
        ? []
        : [`${link.from} -> ${link.page}#${link.fragment}`];
    });

    expect(broken).toEqual([]);
  });

  test("the glossary points at the specification's nomenclature table, not a copy of it", () => {
    const glossary = readFileSync(path.join(contentDir, "glossary.mdx"), "utf8");
    const spec = fileFor("/docs/specs/sovren-control-plane");

    expect(spec).toBeDefined();
    expect(glossary).toContain("/docs/specs/sovren-control-plane#nomenclature");
    expect(headingsIn(spec ?? "")).toContain("nomenclature");
  });

  test("no page in the site's own content restates a port number", () => {
    const offenders = pages.flatMap((page) => {
      const body = readFileSync(path.join(contentDir, page), "utf8").replace(/<PortMap \/>/g, "");
      return /\b\d{4,5}\b/.test(body) ? [page] : [];
    });

    expect(offenders).toEqual([]);
  });
});
