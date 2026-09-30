/**
 * Reading the Site out of the path, and the list of Sites to switch between.
 *
 * Both come from one hook, so the sidebar's picker and the scope's identity can
 * never disagree about which labs exist. The list is derived from the Nodes,
 * which is a seam rather than a design: the contract has no `SiteList`
 * operation, and until it does, the sites in the estate are exactly the sites the
 * Nodes are in.
 */

import { Link, useParams } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import type { Site } from "@sovren/client";

import { useSites } from "@/nav/site-scope";

export interface SitePickerState {
  /** The site this scope is looking at, from the path. */
  site: string;
  /** Every site the estate serves, for the picker. */
  sites: readonly Site[];
  /** A site in the path that nothing answers to. */
  unknown: boolean;
  loading: boolean;
}

/**
 * The Site in the path, and the sites beside it.
 *
 * A site that nothing answers to is `unknown` rather than an error thrown during
 * render: the layout still has to render the shell and the 404, and a throw here
 * would take the whole console with it.
 */
export const useSitePicker = (): SitePickerState => {
  const params = useParams({ strict: false }) as { site?: string };
  const site = params.site ?? "";
  const { sites, loading } = useSites();
  return {
    site,
    sites,
    unknown: !loading && sites.length > 0 && !sites.some((entry) => entry.name === site),
    loading,
  };
};

/**
 * The sidebar control for moving between labs.
 *
 * The list of labs and nothing else. The sentence saying what a Site *is* used to
 * sit under this list, and therefore under every screen in the scope, saying the
 * same thing on a Peers list as on the page where an operator picks a lab. It
 * lives on the Site index now -- the one page whose question is "which lab" -- and
 * the sidebar gives its space back to the labs.
 */
export function SitePicker({ sites, current }: { sites: readonly Site[]; current: string }) {
  if (sites.length === 0) {
    return (
      <p className="px-1 text-[11px] text-muted-foreground">
        No Site in the estate answers yet, so there is nothing to narrow to.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 border-y border-sidebar-border py-1.5">
      <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
        <MapPin className="size-3" aria-hidden />
        Site
      </p>
      {sites.map((entry) => (
        <Link
          key={entry.id}
          to="/site/$site/nodes"
          params={{ site: entry.name }}
          aria-current={entry.name === current ? "page" : undefined}
          className={
            entry.name === current
              ? "bg-sidebar-accent px-1.5 py-1 text-xs font-medium text-sidebar-accent-foreground"
              : "px-1.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          }
        >
          <span className="font-mono">{entry.name}</span>
        </Link>
      ))}
    </div>
  );
}
