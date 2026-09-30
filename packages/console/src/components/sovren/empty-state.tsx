/**
 * The empty state, and the difference between two of them.
 *
 * "No rows" and "nothing here yet" are different sentences and an operator acts
 * on them differently. A list that has rows on the next page says so; a list
 * with nothing at all because the filter matched nothing says *that*, and offers
 * the one action that fixes it. A screen that renders both as "no results" has
 * thrown away the only information the operator had.
 */

import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  /** What is absent, and why, in the operator's terms. */
  body?: ReactNode;
  /** The way out. A filter that matched nothing offers the filter's own clear. */
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, body, action, icon, compact = false }: EmptyStateProps) {
  return (
    <div
      data-empty="true"
      className={
        compact
          ? "flex flex-col items-start gap-2 border border-dashed border-border p-4"
          : "flex flex-col items-center gap-2 border border-dashed border-border px-6 py-14 text-center"
      }
    >
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body !== undefined && <p className="max-w-prose text-xs text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

/**
 * Rows that have not arrived.
 *
 * A fixed set of shimmering rows rather than a spinner, because the shape of the
 * table is the thing an operator is waiting for -- a spinner in a list this dense
 * removes the one cue that says "a table is coming".
 */
export function ListSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div data-loading="true" aria-busy="true" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex h-8 items-center gap-3 border-b border-border px-2"
          data-row={row}
        >
          {Array.from({ length: columns }, (_, column) => (
            <div
              key={column}
              className="h-2.5 animate-pulse bg-muted"
              style={{ width: column === 0 ? "18rem" : "5rem" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
