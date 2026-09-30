/**
 * The Site index.
 *
 * One row per lab, with the count of machines in it, so the operator picks a lab
 * knowing what is in it rather than discovering that afterwards. The wording is
 * the model's wording: a Site is a physical grouping, so the column is Nodes and
 * not Tenants, and the footnote says what a Site is not.
 *
 * The rows come from the Nodes the backend serves, which is a seam rather than a
 * design -- the contract has no `SiteList` operation. It cannot disagree with the
 * Nodes list, because it *is* the Nodes list, read a different way.
 */

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Server } from "lucide-react";
import { useNodeList } from "@sovren/client";
import type { Node, Site } from "@sovren/client";

import { EmptyState, ListSkeleton } from "@/components/sovren/empty-state";
import { ErrorState } from "@/components/sovren/error-state";
import { StateBadge } from "@/components/sovren/state-badge";
import { readList } from "@/lib/sovren";
import { MAX_PAGE_SIZE } from "@/lib/list-state";
import { formatCount } from "@/lib/format";

interface SiteRow {
  site: Site;
  nodes: number;
  degraded: number;
  offline: number;
  unEnrolled: number;
}

/**
 * The column weights, in the order they read.
 *
 * The Site column takes the largest share because it carries the lab's own name
 * and the sentence describing it, and the two counts take the least because a
 * count is a count. The "Open" control is the one fixed-width column and is
 * declared beside these rather than in the weights.
 */
const SITE_COLUMNS = [
  ["site", 420],
  ["nodes", 120],
  ["unhealthy", 160],
  ["unEnrolled", 160],
] as const;

const SITE_COLUMN_TOTAL = SITE_COLUMNS.reduce((sum, [, weight]) => sum + weight, 0);

export function SiteIndex() {
  const query = useNodeList({ size: MAX_PAGE_SIZE });
  const read = readList<Node>(query.data);
  const error = read.kind === "error" ? read.error : null;
  const nodes = read.kind === "page" ? read.page.items : [];

  const rows = useMemo<SiteRow[]>(() => {
    const byName = new Map<string, SiteRow>();
    for (const node of nodes) {
      const entry = byName.get(node.site.name) ?? {
        site: node.site,
        nodes: 0,
        degraded: 0,
        offline: 0,
        unEnrolled: 0,
      };
      entry.nodes += 1;
      if (node.status === "degraded") entry.degraded += 1;
      if (node.status === "offline") entry.offline += 1;
      if (node.overlay === null) entry.unEnrolled += 1;
      byName.set(node.site.name, entry);
    }
    return [...byName.values()].sort((left, right) =>
      left.site.name.localeCompare(right.site.name, "en"),
    );
  }, [nodes]);

  return (
    <section aria-label="Sites" className="flex min-w-0 flex-col gap-2">
      <header className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center border border-border bg-muted">
          <MapPin className="size-3.5" aria-hidden />
        </span>
        <h1 className="font-heading text-base leading-tight font-medium">Sites</h1>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          The physical labs the estate is spread across. A Site is a latency and a failure boundary,
          not a tenancy and not a security one.
        </p>
      </header>

      {query.isPending && nodes.length === 0 && <ListSkeleton rows={3} columns={4} />}

      {error !== null && nodes.length === 0 && (
        <ErrorState
          error={error}
          onRetry={() => {
            void query.refetch();
          }}
          busy={query.isFetching}
        />
      )}

      {rows.length === 0 && error === null && !query.isPending && (
        <EmptyState
          title="No Site in this estate"
          body="Sites are the physical groupings the Nodes are in, so an estate with no machines has no Sites either."
        />
      )}

      {rows.length > 0 && (
        <div className="w-full overflow-x-auto">
          {/**
           * The same width model as the list archetype: a `table-fixed` table at
           * 100% of the page, four columns sharing what is left after a fixed-width
           * "Open". A fixed pixel sum stopped 35% short across a 1600px screen,
           * which on a three-row table is a field of nothing.
           */}
          <table
            aria-label="Sites"
            style={{ minWidth: 700 }}
            className="w-full table-fixed border-collapse text-xs"
          >
            <colgroup>
              {SITE_COLUMNS.map(([key, weight]) => (
                <col
                  key={key}
                  style={{
                    width: `calc(${(weight / SITE_COLUMN_TOTAL).toFixed(4)} * (100% - 96px))`,
                  }}
                />
              ))}
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr className="h-7">
                {["Site", "Nodes", "Not healthy", "Not on the overlay", ""].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="border-b border-border bg-muted/60 px-2 text-left font-medium whitespace-nowrap text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.site.id}
                  className="h-8 border-b border-border last:border-b-0 hover:bg-muted/50"
                >
                  <td className="sticky left-0 z-10 overflow-hidden bg-background px-2 whitespace-nowrap font-medium">
                    <span className="font-mono">{row.site.name}</span>
                    {row.site.description !== null && row.site.description !== undefined && (
                      <span
                        title={row.site.description}
                        className="ml-2 text-[11px] font-normal text-muted-foreground"
                      >
                        <span className="inline-block align-bottom">{row.site.description}</span>
                      </span>
                    )}
                  </td>
                  <td className="overflow-hidden px-2 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Server className="size-3.5 text-muted-foreground" aria-hidden />
                      {formatCount(row.nodes, "Node")}
                    </span>
                  </td>
                  <td className="overflow-hidden px-2 whitespace-nowrap">
                    {row.degraded + row.offline === 0 ? (
                      <StateBadge value="online" label="all healthy" />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {row.degraded > 0 && (
                          <StateBadge value="degraded" label={`${String(row.degraded)} degraded`} />
                        )}
                        {row.offline > 0 && (
                          <StateBadge value="offline" label={`${String(row.offline)} offline`} />
                        )}
                      </span>
                    )}
                  </td>
                  <td className="overflow-hidden px-2 whitespace-nowrap">
                    {row.unEnrolled === 0 ? (
                      <span className="text-muted-foreground">all enrolled</span>
                    ) : (
                      <span
                        data-overlay="null"
                        className="text-[11px] text-amber-700 dark:text-amber-300"
                      >
                        {String(row.unEnrolled)} not enrolled
                      </span>
                    )}
                  </td>
                  <td className="px-2 text-right">
                    <Link
                      to="/site/$site/nodes"
                      params={{ site: row.site.name }}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Open
                      <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
