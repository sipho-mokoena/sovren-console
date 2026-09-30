import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";
import { sections } from "./sections";

/**
 * The repository's markdown carries no frontmatter: every file opens with its
 * own `# Title`, and fumadocs lifts that into the page's title while compiling.
 *
 * The default schema demands `title` in the frontmatter and validates *before*
 * that lift happens, so it rejects every file in this repository. Making the
 * field optional is the fix; `tests/content.test.ts` then holds the promise that
 * every file the globs reach does have a title from somewhere.
 */
const document = pageSchema.extend({ title: z.string().optional() });

/**
 * Everything the site shows is the repository's own markdown, read from where it
 * already lives. Two globs, no file list to keep in step:
 *
 *   - the repository's `docs/` tree -- the control-plane spec, the requirements
 *     index, the ADRs, the agent-facing domain docs;
 *   - `content/` at the repository root -- the pages that belong to the site
 *     itself, which is why they sit outside `docs/`.
 *
 * `docs/adr/*.md` is a glob, so an ADR written after this file was written
 * appears in the site with nothing to edit here. The same is true of a new spec
 * or a new domain note.
 *
 * `dir` is resolved from the process working directory, which for both
 * `next dev` and `next build` is this package.
 */
const repository = defineDocs({
  dir: "../../docs",
  docs: { files: ["**/*.md"], schema: document },
  meta: { files: ["**/*.json"] },
});

const guide = defineDocs({
  dir: "../../content",
  docs: { files: ["**/*.md", "**/*.mdx"], schema: document },
  meta: { files: ["**/*.json"] },
});

export const source = loader(
  {
    repository: repository.toFumadocsSource(),
    guide: guide.toFumadocsSource({ baseDir: "guide" }),
  },
  {
    baseUrl: "/docs",
    // `sections` runs first so it can hand `lucideIconsPlugin` icon names to resolve.
    plugins: [sections(), lucideIconsPlugin()],
  },
);

export type Page = (typeof source)["$inferPage"];
