/**
 * The Site a scope is looking at.
 *
 * A Site scope is a context rather than a filter, and the difference is worth
 * keeping: a filter is something the operator applies to a list, while a context
 * is where they are. So the site is read from the path once, here, and every
 * screen inside the scope reads it from this context rather than re-parsing the
 * URL -- which is how two pages in the same lab cannot end up disagreeing about
 * which lab they are in.
 *
 * The site list is derived from the Nodes, because the contract has no Site
 * operation of its own. That is a seam, not a design: a `SiteList` in the
 * document would make this a direct read. Until then the sites are the distinct
 * `site` values on the Nodes the backend serves, which cannot disagree with the
 * Nodes list by construction.
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Site } from "@sovren/client";

import { useNodeList } from "@sovren/client";
import type { Node } from "@sovren/client";

import { readList } from "@/lib/sovren";
import { MAX_PAGE_SIZE } from "@/lib/list-state";

/** The whole estate's Sites, from the Nodes that are in them. */
export const useSites = (): { sites: readonly Site[]; loading: boolean; failed: boolean } => {
  const query = useNodeList({ size: MAX_PAGE_SIZE });
  const read = readList<Node>(query.data);
  const byName = new Map<string, Site>();
  if (read.kind === "page") {
    for (const node of read.page.items) byName.set(node.site.name, node.site);
  }
  return {
    sites: [...byName.values()].sort((left, right) => left.name.localeCompare(right.name, "en")),
    loading: query.isPending,
    failed: read.kind === "error",
  };
};

const SiteContext = createContext<string | null>(null);

export const SiteScopeProvider = ({ site, children }: { site: string; children: ReactNode }) => (
  <SiteContext.Provider value={site}>{children}</SiteContext.Provider>
);

/** The Site this scope is looking at. Throws outside a Site scope, by design. */
export const useSiteScope = (): string => {
  const site = useContext(SiteContext);
  if (site === null) throw new Error("useSiteScope was called outside a Site scope route.");
  return site;
};
