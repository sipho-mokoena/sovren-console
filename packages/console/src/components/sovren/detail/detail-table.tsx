/**
 * The table inside a detail tab.
 *
 * A list is the archetype; a *bounded* list is this. The difference is that a
 * section has no header, no create action and no pagination, and the reason is
 * specific rather than cosmetic: a section answers "what of this does this one
 * machine have", and the honest bound on that answer is the machine, not a page
 * size an operator chose somewhere else.
 *
 * ## The one guarantee this component is for
 *
 * **A detail tab and the corresponding list show the same machines, and cannot
 * disagree.** That is R47's promise and the document's job together: `VMList` and
 * `PeerList` both declare a `node` parameter, so "the VMs on this Node" is a
 * question the control plane answers rather than something the console filters
 * for itself. This component is what makes the two sides literally the same code:
 * the same generated hook, the same `node` parameter, the same column set handed
 * in from the list screen, and the same `readList` narrowing the archetype uses.
 *
 * If a list screen's columns change, this tab's change too, because the tab was
 * given them rather than having drawn its own. The alternative -- a detail tab
 * with its own hand-written columns -- is a second rendering of the same list that
 * answers the same question, and two renderings of one question is exactly how
 * they come to disagree.
 *
 * ## The four states, because a section is not a blank space
 *
 * A section that has not loaded shows the section's shape, a section that failed
 * shows the code and the `requestId`, a section with nothing in it says what is
 * absent and why, and a section with rows shows them. The empty state in
 * particular is written per section and is the reason a section needs a screen to
 * supply one: "no VM on this Node" and "no Peer on this Node" are different
 * sentences, because a VM is something someone created and a Peer is something a
 * machine enrolled as, and an operator acts on the difference.
 *
 * ## When the backend says there is more
 *
 * A section asks for the document's default page size and says so when the
 * response has a `nextPage`. It does not paginate itself, because a page token in
 * a detail page's URL would collide with the list's own token that the breadcrumb
 * is carrying back -- two cursors, one parameter. So the section states the bound
 * in words and links to the list filtered to this resource, which is where
 * paginating belongs. The estate is small enough that no seeded section trips
 * this, which is exactly why it is written as words rather than left implicit.
 */

import { useRef } from "react";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ErrorResponse } from "@sovren/client";

import { DataTable } from "@/components/sovren/data-table";
import type { ListColumn } from "@/components/sovren/data-table";
import { EmptyState, ListSkeleton } from "@/components/sovren/empty-state";
import { ErrorState } from "@/components/sovren/error-state";
import { readList, type SovrenPage } from "@/lib/sovren";

/**
 * The slice of a generated list hook's result this component reads.
 *
 * `ListQuery` from the list archetype, restated rather than imported for the same
 * reason `DetailQuery` is: the section is not the list, and a shared vocabulary
 * type is a smaller thing to depend on than a shared component tree. The shape is
 * identical, so a `useVMList(...)` result satisfies it as it stands.
 */
export interface DetailTableQuery {
  readonly data: unknown;
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly refetch: () => void;
}

export interface DetailTableProps<TRow> {
  /** The collection's accessible name: "Drives on accra-desk-01". */
  caption: string;
  /** The generated hook's result, untouched. */
  query: DetailTableQuery;
  /** The list screen's own column set, handed in rather than redrawn. */
  columns: readonly ListColumn<TRow>[];
  /** The row's stable key, from the contract. */
  rowKey: (row: TRow) => string;
  /** Where a row's identity cell links, when rows open their own detail page. */
  rowHref?: (row: TRow) => string;
  /** The sticky action column's contents for one row. */
  rowActions?: (row: TRow) => ReactNode;
  /** What is absent, in the section's own words. A section supplies this itself. */
  empty: { title: string; body?: ReactNode; action?: ReactNode };
  /** Where the full, paginated list of this collection lives. */
  more?: { to: string; label: string };
  /** Skeleton rows while the first request is in flight. */
  skeletonRows?: number;
  /** The width of the sticky action column, when there is one. */
  actionsWidth?: number;
}

export function DetailTable<TRow>({
  caption,
  query,
  columns,
  rowKey,
  rowHref,
  rowActions,
  empty,
  more,
  skeletonRows = 4,
  actionsWidth,
}: DetailTableProps<TRow>) {
  const read = readList<TRow>(query.data);

  /**
   * The last page that actually arrived.
   *
   * A failed refresh replaces the response in the cache, so a section showing rows
   * would blank itself to a failure that has not changed the estate. Same rule as
   * the list archetype, for the same reason: an operator reading a machine's peers
   * should not lose their place to an upstream that stopped answering.
   */
  const lastGood = useRef<{ page: SovrenPage<TRow> } | null>(null);
  if (read.kind === "page") lastGood.current = { page: read.page };

  const page = read.kind === "page" ? read.page : (lastGood.current?.page ?? null);
  const failure = read.kind === "error" ? read.error : undefined;
  const stale = failure !== undefined && page !== null;

  return (
    <div data-detail-table={caption} className="flex min-w-0 flex-col gap-2">
      {read.kind === "pending" && page === null && (
        <ListSkeleton rows={skeletonRows} columns={columns.length} />
      )}

      {read.kind === "error" && page === null && (
        <ErrorState
          error={failure as ErrorResponse}
          onRetry={() => {
            query.refetch();
          }}
          busy={query.isFetching}
          compact
        />
      )}

      {/* A section's rows stay when its refresh fails; the failure is stated
          beside them rather than in place of them. `stale` already means "there is
          a page to keep", so this cannot double-render with the error state above,
          which is the case where there is nothing to keep. */}
      {stale && <SectionStale code={failure?.code ?? "internal"} />}

      {page !== null && page.items.length === 0 && (
        <EmptyState
          title={empty.title}
          {...(empty.body === undefined ? {} : { body: empty.body })}
          {...(empty.action === undefined ? {} : { action: empty.action })}
          compact
        />
      )}

      {page !== null && page.items.length > 0 && (
        <DataTable
          columns={columns}
          rows={page.items}
          rowKey={rowKey}
          {...(rowHref === undefined ? {} : { rowHref })}
          {...(rowActions === undefined ? {} : { renderRowActions: rowActions })}
          caption={caption}
          {...(actionsWidth === undefined ? {} : { actionsWidth })}
        />
      )}

      {page !== null && page.nextPage !== null && more !== undefined && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {/* The caption is not lowercased into the sentence. A section is captioned
              in the operator's nouns -- "Drives on accra-desk-01" -- and splicing one
              into a sentence produces a title-case fragment halfway through a
              paragraph, which reads worse than saying "rows". */}
          <span data-more="true">More rows than this section shows.</span>
          <Link
            to={more.to as never}
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
          >
            {more.label}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * A section that failed to refresh, beside rows that are still there.
 *
 * Compact on purpose, and without a `requestId`: the page above it either loaded
 * or showed its own error with one, and a second id in a second tone on the same
 * page is a second thing to read. The code is what an operator reports.
 */
function SectionStale({ code }: { code: string }) {
  return (
    <p
      data-stale="true"
      className="border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
    >
      The last refresh of this section failed. The rows below are from the last good answer.{" "}
      <span className="font-mono">{code}</span>
    </p>
  );
}
