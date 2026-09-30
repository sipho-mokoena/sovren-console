import type { Heading, Root } from "mdast";

/** The text of a heading, ignoring the emphasis and code marks around it. */
function flatten(node: Heading): string {
  const parts: string[] = [];

  const walk = (child: Heading["children"][number]): void => {
    if (child.type === "text" || child.type === "inlineCode") parts.push(child.value);
    else if ("children" in child) child.children.forEach(walk);
  };

  node.children.forEach(walk);
  return parts.join("").trim();
}

/**
 * The repository's markdown carries no frontmatter: every file opens with its
 * own `# Title`, and fumadocs lifts that heading into the page's `title` and
 * renders it in the page header. Left in the body, every title would print
 * twice, back to back.
 *
 * This lifts the title first and only then drops the heading, because
 * fumadocs' own postprocessor -- the thing that normally does the lifting --
 * runs after any plugin registered here, and would otherwise find nothing to
 * lift and fall back to the file name.
 *
 * The source files stay as they are. This is a rendering decision, made once,
 * for every page including the ones written after this file.
 */
export function remarkStripLeadingTitle() {
  return (tree: Root, file: { data: Record<string, unknown> }): void => {
    const at = tree.children.findIndex((node) => node.type === "heading" && node.depth === 1);
    if (at === -1) return;

    const heading = tree.children[at];
    if (heading?.type !== "heading") return;

    const frontmatter = (file.data["frontmatter"] ??= {}) as Record<string, unknown>;
    if (frontmatter["title"] === undefined) frontmatter["title"] = flatten(heading);

    tree.children.splice(at, 1);
  };
}
