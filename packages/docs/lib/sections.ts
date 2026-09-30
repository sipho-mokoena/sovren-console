import type { LoaderPlugin } from "fumadocs-core/source";
import type * as PageTree from "fumadocs-core/page-tree";

/**
 * The site is navigable by section rather than as one list of pages.
 *
 * The content files arrive from two globs and land in a tree shaped like the
 * repository: `guide/runbook`, `specs/sovren-control-plane`, `adr/0001-...`,
 * `tech-stack`, `agents/...`. This plugin gives those folders the names a reader
 * wants, in the order a reader wants them, and nothing more.
 *
 * Nothing here enumerates a file. A map from *section* to presentation is the
 * whole list, so `docs/adr/0002-anything.md` sorts itself into Decisions on the
 * day it is written.
 */

interface Section {
  name: string;
  description: string;
  /** a lucide-react icon name, resolved by `lucideIconsPlugin` */
  icon: string;
}

const FOLDERS: Record<string, Section> = {
  guide: {
    name: "Guide",
    description: "From a clean clone to a running console and documentation site.",
    icon: "Compass",
  },
  specs: {
    name: "Specification",
    description: "Authoritative on behaviour. Everything else defers to it.",
    icon: "ScrollText",
  },
  adr: {
    name: "Decisions",
    description: "Architecture decision records, in the order they were taken.",
    icon: "Gavel",
  },
  agents: {
    name: "Contributing",
    description: "How the engineering skills read this repository's domain docs.",
    icon: "Users",
  },
};

const PAGES: Record<string, Section> = {
  "tech-stack": {
    name: "Requirements R1–R69",
    description: "The requirements index, and the stack decisions behind it.",
    icon: "ListChecks",
  },
};

/** Read order. Anything not named here keeps its glob order and lands last. */
const ORDER = ["guide", "specs", "tech-stack", "adr", "agents"];

/**
 * The virtual path of a node, which is also its `$ref`. Folders carry a
 * `{ folder }` ref, pages carry the file path itself, extension and all.
 */
function ref(node: PageTree.Node): string | undefined {
  if (node.type === "separator") return undefined;

  const value = node.$ref;
  const path = typeof value === "string" ? value : value?.folder;
  if (path === undefined) return undefined;

  const dot = path.lastIndexOf(".");
  return dot === -1 ? path : path.slice(0, dot);
}

/**
 * A section's own key, ignoring anything below it. `adr/0001-x` is a page in
 * `adr`; `guide/runbook` is a page in `guide`; `tech-stack` is itself.
 */
function key(node: PageTree.Node): string | undefined {
  const path = ref(node);
  if (path === undefined) return undefined;
  const [head] = path.split("/");
  return head === "" ? undefined : head;
}

function rank(node: PageTree.Node): number {
  const at = ORDER.indexOf(key(node) ?? "");
  return at === -1 ? ORDER.length : at;
}

export function sections(): LoaderPlugin {
  return {
    name: "sovren:sections",

    transformPageTree: {
      file(node) {
        const section = PAGES[key(node) ?? ""];
        if (!section) return node;

        return {
          ...node,
          name: section.name,
          description: section.description,
          icon: section.icon,
        };
      },

      folder(node) {
        const section = FOLDERS[key(node) ?? ""];
        if (!section) return node;

        return {
          ...node,
          name: section.name,
          description: section.description,
          icon: section.icon,
          defaultOpen: true,
        };
      },

      root(node) {
        // `sort` is stable, so unlisted nodes keep the order the globs gave them.
        const children = [...node.children].sort((a, b) => rank(a) - rank(b));
        return { ...node, name: "sovren", children };
      },
    },
  };
}
