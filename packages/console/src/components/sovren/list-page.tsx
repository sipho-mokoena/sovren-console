/**
 * The list archetype: header, refresh, create, table, pagination.
 *
 * This is the deliverable of ticket 05, not the Nodes page. Three more screens
 * get built by handing `ListPage` a different column set and a different
 * generated hook, and a console where every list is learned once is the reason
 * the archetype exists (R38, R45).
 *
 * ## What a screen supplies
 *
 *  - a **column set**: key, header, fixed width, and a function per column from
 *    a row to a cell. Exactly one column is the `identity` column.
 *  - the **generated hook's result**, untouched. `query.data` is the response
 *    union, and this component is the one place that narrows it.
 *  - the **URL state** from `useListState`, so filters, sort and the page token
 *    live in the route (R41).
 *  - whatever is specific to the screen: the create action, row actions, the
 *    empty state, extra filters.
 *
 * What a screen does *not* supply is the part that matters: no fetch call, no
 * pagination arithmetic, no refresh, no last-updated stamp, no error rendering,
 * no empty state. Those are the six ways four lists would have differed, and the
 * six ways an operator would have had to relearn the console four times.
 *
 * ## The states
 *
 * Four, and they are disjoint, because a screen that blurs them is a screen that
 * lies:
 *
 *   - **pending** -- nothing has ever arrived. Skeleton rows, because a dense
 *     table's shape is what an operator is waiting to see.
 *   - **error** -- nothing has ever arrived and the request failed. The code, the
 *     message, the `requestId`, and something to do about it.
 *   - **empty** -- the request succeeded and the list has no rows. The screen's
 *     own words, and the way out.
 *   - **stale** -- rows are on screen and the last refresh failed. The rows stay,
 *     the stamp keeps the old time, and the failure is stated as a failure.
 *
 * ## Sorting
 *
 * Sorting is applied to the page the server served, in the browser, and the sort
 * lives in the URL. That is a consequence of the contract rather than a choice:
 * no list operation declares a sort parameter, so there is nothing to send. A
 * screen that needs server-side ordering needs a document change, and until then
 * this is the honest behaviour -- reorder what you were given, and say so in the
 * control's title.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ErrorResponse } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/sovren/data-table";
import type { ListColumn } from "@/components/sovren/data-table";
import { EmptyState, ListSkeleton } from "@/components/sovren/empty-state";
import { ErrorState, StaleNotice } from "@/components/sovren/error-state";
import {
  MockControlPanel,
  useMockControls,
  useSentinelShortcut,
} from "@/components/sovren/mock-controls";
import { RefreshControl } from "@/components/sovren/refresh-control";
import { readList, type SovrenPage } from "@/lib/sovren";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { sortRows, type ListState } from "@/lib/list-state";

export type { ListColumn } from "@/components/sovren/data-table";

/**
 * The slice of a generated react-query hook's result that the archetype reads.
 *
 * Structural, so `useNodeList(...)`'s result satisfies it as it stands -- no
 * wrapper, no cast, and no second copy of what react-query already tracks. A
 * screen cannot hand this a hand-written fetcher that skips the generated hook,
 * because the hook's result *is* the thing it takes.
 */
export interface ListQuery {
  /** The response union the generated hook resolved to. `undefined` while pending. */
  readonly data: unknown;
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly dataUpdatedAt: number;
  readonly refetch: () => void;
}

export interface ListPageProps<TRow> {
  /** The screen's title, in the contract's nouns. */
  title: string;
  /** The noun's icon. One per list, so the sidebar and the header agree. */
  icon: LucideIcon;
  /**
   * A short clause about what the list answers, if the name does not already say
   * it.
   *
   * Optional and off by default, because the console is denser than a paragraph:
   * a screen's name, its columns and its rows already state what it is, and a
   * sentence above every table is a sentence an operator stops reading. Where an
   * explanation has to live -- what a `Drive` is, why every VM is `kvm64` -- it
   * belongs on the detail page for the thing, or in the docs, where somebody goes
   * looking for it.
   */
  description?: ReactNode;
  /** The generated hook's result, untouched. */
  query: ListQuery;
  /** The URL state, from `useListState`. */
  list: ListState;
  /** The column set. Exactly one column is the identity column. */
  columns: readonly ListColumn<TRow>[];
  /** The row's stable key from the contract. */
  rowKey: (row: TRow) => string;
  /** Where a row's identity cell links, when rows open a detail page. */
  rowHref?: (row: TRow) => string;
  /** The create action, hard against the refresh control. */
  create?: ReactNode;
  /** The refinements, in the header row: a search box, a filter rail, a view switch. */
  filters?: ReactNode;
  /** The sticky action column's contents for one row. */
  rowActions?: (row: TRow) => ReactNode;
  /** The empty state, in the screen's own words. */
  empty: { title: string; body?: ReactNode; action?: ReactNode };
  /** Anything the screen wants above the table -- a Site banner, a warning. */
  banner?: ReactNode;
  /** Skeleton rows while the first request is in flight. */
  skeletonRows?: number;
  /** The width of the sticky action column. */
  actionsWidth?: number;
}

export function ListPage<TRow>({
  title,
  icon: Icon,
  description,
  query,
  list,
  columns,
  rowKey,
  rowHref,
  create,
  filters,
  rowActions,
  empty,
  banner,
  skeletonRows = 10,
  actionsWidth,
}: ListPageProps<TRow>) {
  const read = readList<TRow>(query.data);
  const failure = read.kind === "error" ? read.error : undefined;
  const page: SovrenPage<TRow> | null = read.kind === "page" ? read.page : null;

  /**
   * The last page that actually arrived.
   *
   * A failed refresh replaces the response in the cache, so the rows on screen
   * would disappear and an operator reading a list would lose their place to a
   * failure that has not changed the estate. Keeping the last good page here is
   * what makes "stale" a state rather than a blank screen -- and it is a
   * `useRef` rather than state because a successful fetch is already a render.
   */
  const lastGood = useRef<{ page: SovrenPage<TRow>; at: number } | null>(null);
  if (read.kind === "page") lastGood.current = { page: read.page, at: Date.now() };

  const controls = useMockControls();
  useSentinelShortcut(controls.cycleSentinel);

  /**
   * A changed estate or sentinel is a changed backend, and the query key knows
   * nothing about either -- the generated hook's parameters are the ones the
   * document declares. So the refetch is explicit. Skipped on the first run,
   * because the first run is the fetch the query is already making.
   */
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    query.refetch();
    // The controls are the trigger; the query is read fresh each render.
  }, [controls.estate, controls.sentinel, query.refetch]);

  // A ticking clock for the stamp, so "updated 12s ago" does not need a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  /**
   * The held page is for a *failed refresh*, never for a request that has not
   * answered yet.
   *
   * Changing a filter or a sort changes the query key, and react-query reports
   * `isPending` while the new key has no data of its own. Holding the previous
   * page across that gap is how a `Workloads` list spends a moment showing the
   * Infrastructure rows underneath its own heading -- the exact confusion the
   * two views exist to remove, produced by the thing meant to prevent a different
   * confusion. A refresh of the *same* query has already resolved once, so
   * `isPending` is false and the held page is exactly right.
   */
  const unanswered = query.isPending;
  const stale = failure !== undefined && !unanswered && lastGood.current !== null;
  const shown = page ?? (unanswered ? null : (lastGood.current?.page ?? null));
  const updatedAt = lastGood.current?.at ?? null;

  /**
   * The page the pagination bar is describing.
   *
   * A page token is a *position*, not content, so the last one the backend handed
   * out is still the right one while the next page is in flight -- and reading it
   * from `shown` instead would make "Next page" blink out of existence for exactly
   * as long as it is most wanted. The rows are a different matter, and the rule
   * above is the one that governs them.
   */
  const paging = shown ?? (unanswered ? (lastGood.current?.page ?? null) : null);

  const sort = list.sort;
  const sortKey = sort?.key ?? "";
  const column = columns.find((entry) => entry.key === sortKey);
  const rows =
    shown === null || column?.sortValue === undefined
      ? (shown?.items ?? [])
      : sortRows(shown.items, sort, column.sortValue);

  const missingSortValue = columns.some(
    (entry) => entry.sortable === true && entry.sortValue === undefined,
  );
  if (import.meta.env.DEV && missingSortValue) {
    console.warn(`sovren: a column on ${title} is sortable but declares no sortValue.`);
  }
  if (import.meta.env.DEV && columns.filter((entry) => entry.identity === true).length !== 1) {
    console.warn(`sovren: the ${title} column set must declare exactly one identity column.`);
  }

  const onRefresh = () => {
    query.refetch();
  };

  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      {/**
       * One row, and it is the header.
       *
       * This was three: a title block, a control rail, and a gap between them,
       * which on a 1600px screen put a third of the page's height into chrome
       * before the operator reached a single row of data. The name, the filters,
       * the create action, the refresh and the stamp are one sentence about the
       * same view, so they are one line: name on the left, the question and its
       * refinements beside it, and the things that are true of the answer -- how
       * fresh it is, what can be done to it -- hard against the right edge.
       *
       * The last-updated stamp is not a separate control. It lives inside
       * {@link RefreshControl}, next to the button that changes it, because
       * "updated 12s ago" is a reading of the refresh button and belongs beside
       * it rather than at the far end of a rail of its own.
       */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center border border-border bg-muted">
            <Icon className="size-3.5" aria-hidden />
          </span>
          <h1 className="font-heading text-base leading-tight font-medium">{title}</h1>
          {description !== undefined && (
            <p className="min-w-0 truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>

        {filters !== undefined && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {create !== undefined && <div className="flex items-center gap-2">{create}</div>}
          <RefreshControl
            updatedAt={updatedAt}
            isFetching={query.isFetching}
            onRefresh={onRefresh}
            stale={stale ? failure : undefined}
          />
          <MockControlPanel controls={controls} />
        </div>
      </header>

      {banner}

      {stale && failure !== undefined && updatedAt !== null && (
        <StaleNotice
          error={failure}
          updatedAtLabel={`${formatRelative(updatedAt, now)} (${formatTimestamp(new Date(updatedAt).toISOString())})`}
          onRetry={onRefresh}
        />
      )}

      {read.kind === "pending" && shown === null && (
        <ListSkeleton rows={skeletonRows} columns={columns.length} />
      )}

      {read.kind === "error" && shown === null && (
        <ErrorState error={failure as ErrorResponse} onRetry={onRefresh} busy={query.isFetching} />
      )}

      {shown !== null && rows.length === 0 && (
        <EmptyState
          title={empty.title}
          {...(empty.body === undefined ? {} : { body: empty.body })}
          {...(empty.action === undefined ? {} : { action: empty.action })}
        />
      )}

      {shown !== null && rows.length > 0 && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          {...(rowHref === undefined ? {} : { rowHref })}
          {...(rowActions === undefined ? {} : { renderRowActions: rowActions })}
          sort={sort}
          onSort={list.toggleSort}
          caption={title}
          {...(actionsWidth === undefined ? {} : { actionsWidth })}
        />
      )}

      <PaginationBar
        rows={rows.length}
        hasNext={paging?.nextPage != null}
        nextToken={paging?.nextPage ?? null}
        list={list}
        busy={query.isFetching}
      />
    </section>
  );
}

export interface PaginationBarProps {
  rows: number;
  hasNext: boolean;
  /** The opaque token for the next page. `null` at the end of the list. */
  nextToken: string | null;
  list: ListState;
  busy?: boolean;
}

/**
 * The pagination bar: opaque tokens, and nothing that pretends to be a count.
 *
 * There is no "page 3 of 7" here, and that is deliberate. `nextPage` is opaque
 * (R33) -- the console cannot construct one, invert one, or ask how many there
 * are -- so a bar that showed a total would be showing a number it guessed. What
 * it shows instead is what it actually knows: how many rows are on this page,
 * whether there is another, and whether the operator has somewhere to go back
 * to.
 */
export function PaginationBar({
  rows,
  hasNext,
  nextToken,
  list,
  busy = false,
}: PaginationBarProps) {
  return (
    <nav
      aria-label="Pagination"
      data-pagination="true"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"
    >
      <span className="font-mono text-[11px] text-muted-foreground">
        {rows} {rows === 1 ? "row" : "rows"} on this page
        {list.pageNumber !== null && ` · page ${String(list.pageNumber)}`}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          onClick={list.goBack}
          disabled={!list.canGoBack || busy}
        >
          Back
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={list.goFirst}
          disabled={list.isFirstPage || busy}
        >
          First page
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            if (nextToken !== null) list.goNext(nextToken);
          }}
          disabled={!hasNext || nextToken === null || busy}
        >
          Next page
        </Button>
      </div>
    </nav>
  );
}
