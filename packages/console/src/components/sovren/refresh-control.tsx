/**
 * The refresh control and the last-updated stamp.
 *
 * R46: an operator can tell a stale view from a broken one. Those are three
 * states, not two, and the stamp is what distinguishes them:
 *
 *   - **fresh** -- the time of the last successful fetch, in words, ticking.
 *   - **stale** -- the rows on screen are real but the last refresh failed, so
 *     the stamp keeps the *old* time and says so. A failed refresh is never
 *     presented as a fresh one, and the rows are never blanked to prove it.
 *   - **broken** -- nothing has ever loaded, which is the error state's job.
 *
 * The stamp is the time the console last got a good answer, not the time the
 * component last rendered. That distinction is the whole component: a
 * `dataUpdatedAt` rendered as "just now" on every re-render is a stamp that says
 * nothing.
 */

import { RefreshCw } from "lucide-react";
import type { ErrorResponse } from "@sovren/client";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { formatRelative, formatTimestamp } from "@/lib/format";

/** How often the relative stamp is rewritten. A stamp that flickers is noise. */
const TICK_MS = 15_000;

export interface RefreshControlProps {
  /** Epoch milliseconds of the last *successful* fetch. `null` before one. */
  updatedAt: number | null;
  isFetching: boolean;
  onRefresh: () => void;
  /**
   * A failure that did not replace the rows. Present means the view is stale,
   * and the stamp says so rather than reading as fresh.
   */
  stale?: ErrorResponse | undefined;
  className?: string;
}

export function RefreshControl({
  updatedAt,
  isFetching,
  onRefresh,
  stale,
  className,
}: RefreshControlProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const absolute = updatedAt === null ? null : new Date(updatedAt).toISOString();
  const relative = updatedAt === null ? "never" : formatRelative(updatedAt, now);
  const label = stale === undefined ? `Updated ${relative}` : `Stale — updated ${relative}`;

  return (
    <div className={cn("flex items-center gap-1.5", className)} data-refresh="true">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw className={isFetching ? "animate-spin" : ""} aria-hidden />
      </Button>
      <span
        data-stale={stale !== undefined ? "true" : "false"}
        data-updated-at={absolute ?? undefined}
        title={
          absolute === null
            ? "Nothing has loaded yet"
            : `Last good answer at ${formatTimestamp(absolute)}`
        }
        className={cn(
          "font-mono text-[11px] whitespace-nowrap",
          stale === undefined ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300",
        )}
      >
        {label}
      </span>
    </div>
  );
}
