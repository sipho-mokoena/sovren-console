/**
 * The dense table: fixed row heights, a sticky identity column, a sticky action
 * column.
 *
 * R42 and R55, and both are about the same thing -- an operator has to see a
 * whole lab at once. Fixed row heights are what make a table scannable: the eye
 * tracks a row across nine columns because the next row starts at exactly the
 * same height every time. The two sticky columns are what make that possible on
 * a screen narrower than the table: the name stays put while the numbers scroll,
 * so a row never becomes an unlabelled row of figures.
 *
 * **Widths are declared, not discovered.** A `table-fixed` table with a
 * `<colgroup>` is the only way a column keeps its width when a value is longer
 * than its header -- and a `Drive` named `takoradi-nas-01-sdd` and a `Node` named
 * `accra-server-02` are the same column holding both.
 *
 * **A column's `width` is a weight, not a pixel count.** It used to be pixels,
 * and the table carried the sum of them as its own inline width, which is what
 * left a console on a 1600px screen with a table across 55% of the page and a
 * field of dead air to the right of the last column. The columns were a fixed
 * total whatever the container was, so the same table was cramped on a laptop and
 * stranded on a monitor. Weights make the table *the container's* width and give
 * the operator the extra pixels where the extra room is: a name column grows with
 * the window, a column holding a long CPU model grows more, and a column of
 * two-digit numbers does not grow at all.
 *
 * The action column is the one exception and stays in pixels, because it holds
 * controls whose size is known rather than data whose length is not -- a button
 * that gets wider on a wider monitor is a button with a hole in it. So the data
 * columns are percentages of *what is left* after it, computed with `calc()`,
 * and the two together always sum to the table.
 *
 * Overflow is clipped rather than wrapped. A wrapped cell is a taller row, and a
 * taller row is a column that no longer lines up, and a table whose rows do not
 * line up is a table that has to be read one cell at a time. Below
 * {@link MIN_TABLE_WIDTH} the columns would crush rather than clip usefully, so
 * the table keeps its own floor and the wrapper scrolls -- which is the case the
 * sticky columns exist for.
 */

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "cn";

import type { ListSort } from "@/lib/list-state";

/**
 * One column of a list.
 *
 * A column set is the whole of what a screen contributes to the archetype: the
 * key, the header, a fixed width, and a function from a row to a cell. Anything
 * a list needs that is not per-column -- the create action, the row actions, the
 * empty state -- is a prop of the page, not of the table, so a screen that
 * renders three columns and one that renders nine use the same table.
 */
export interface ListColumn<TRow> {
  /** Stable, and the sort key written to the URL. Not shown to the operator. */
  key: string;
  /** The noun, in the contract's own words. */
  header: string;
  /**
   * This column's share of the table, relative to the other columns'.
   *
   * A weight and not a pixel count: 240 means "this column wants about 240
   * shares of whatever shares there are", so it is 240px on a laptop and rather
   * more on a monitor. Give the column that holds a long sentence -- a CPU
   * model, a failure reason -- the largest weight, and the table gives the extra
   * room to the thing that needed it.
   */
  width: number;
  align?: "start" | "end";
  /**
   * The identity column, pinned to the left. Exactly one per column set.
   *
   * The name goes here, on every list, because the name is the thing an operator
   * navigates by and the thing they read while the rest of the row scrolls.
   */
  identity?: boolean;
  /** Whether the header offers a sort. Requires `sortValue`. */
  sortable?: boolean;
  /** What a sort orders by. Absent on a column that cannot be sorted. */
  sortValue?: (row: TRow) => string | number;
  /** Right-aligned with tabular figures, for a number being compared down a column. */
  numeric?: boolean;
  /** Extra classes, for one column's cells. */
  className?: string;
  render: (row: TRow) => ReactNode;
}

export interface DataTableProps<TRow> {
  columns: readonly ListColumn<TRow>[];
  rows: readonly TRow[];
  /** The row's stable key, from the contract. Never the array index. */
  rowKey: (row: TRow) => string;
  /** Where the identity cell links. Omit for a list whose rows open no detail page. */
  rowHref?: (row: TRow) => string;
  /** The sticky action column. Omit and the table has no right-hand column. */
  renderRowActions?: (row: TRow) => ReactNode;
  sort?: ListSort | null;
  onSort?: (key: string) => void;
  /** The accessible name of the table. */
  caption: string;
  /** The width of the sticky action column, in pixels. */
  actionsWidth?: number;
}

const ACTION_COLUMN_WIDTH = 180;

/**
 * The narrowest the table is allowed to get before it scrolls sideways.
 *
 * One number for the whole console, and a floor rather than a width: above it
 * the table is exactly as wide as its container, and below it the columns would
 * start clipping words an operator needs rather than merely widening the gaps
 * between them. The two sticky columns are what make the scroll survivable.
 */
const MIN_TABLE_WIDTH = 900;

export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  rowHref,
  renderRowActions,
  sort = null,
  onSort,
  caption,
  actionsWidth = ACTION_COLUMN_WIDTH,
}: DataTableProps<TRow>) {
  const withActions = renderRowActions !== undefined;

  /**
   * Each data column's share, as a CSS width.
   *
   * With an action column the shares are a percentage of the *remainder*, because
   * percentages on a `<col>` are of the whole table and a `300px` action column
   * added on top of percentages that already sum to 100% would make the table
   * wider than its container. `calc(share * (100% - 300px))` is the same
   * distribution expressed against the space that is actually free, and the two
   * together come to exactly the table's width.
   */
  const totalWeight = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const widthOf = (weight: number): string => {
    const share = weight / totalWeight;
    return withActions
      ? `calc(${share.toFixed(4)} * (100% - ${String(actionsWidth)}px))`
      : `${(share * 100).toFixed(4)}%`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <table
        aria-label={caption}
        style={{ minWidth: MIN_TABLE_WIDTH }}
        className="w-full table-fixed border-collapse text-xs"
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: widthOf(column.width) }} />
          ))}
          {withActions && <col style={{ width: actionsWidth }} />}
        </colgroup>

        <thead>
          <tr className="h-7">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const direction = active ? sort.direction : null;
              return (
                <th
                  key={column.key}
                  scope="col"
                  data-column={column.key}
                  data-sorted={direction ?? undefined}
                  aria-sort={
                    direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"
                  }
                  className={cn(
                    "border-b border-border bg-muted/60 px-2 text-left font-medium whitespace-nowrap text-muted-foreground",
                    column.identity === true && "sticky left-0 z-20 bg-muted",
                    column.align === "end" && "text-right",
                  )}
                >
                  {column.sortable === true && onSort !== undefined ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSort(column.key);
                      }}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 hover:text-foreground",
                        column.align === "end" && "flex-row-reverse",
                      )}
                    >
                      <span>{column.header}</span>
                      {direction === "asc" ? (
                        <ArrowUp className="size-3" aria-hidden />
                      ) : direction === "desc" ? (
                        <ArrowDown className="size-3" aria-hidden />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {withActions && (
              <th
                scope="col"
                className="sticky right-0 z-20 border-b border-border bg-muted px-2 text-right font-medium whitespace-nowrap text-muted-foreground"
              >
                Actions
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                data-row={rowKey(row)}
                className="h-8 border-b border-border last:border-b-0 hover:bg-muted/50"
              >
                {columns.map((column) => {
                  const cell = column.render(row);
                  return (
                    <td
                      key={column.key}
                      data-column={column.key}
                      className={cn(
                        "overflow-hidden px-2 whitespace-nowrap",
                        column.identity === true && "sticky left-0 z-10 bg-background font-medium",
                        column.numeric === true && "text-right font-mono tabular-nums",
                        column.align === "end" && "text-right",
                        column.className,
                      )}
                    >
                      {column.identity === true && href !== undefined ? (
                        <Link
                          // The href is composed at runtime from a name the
                          // contract supplies, so it cannot be one of the
                          // router's literal paths at compile time. The router
                          // still resolves it at render, and an address that
                          // matches no route renders the 404 rather than
                          // silently going nowhere.
                          to={href as never}
                          className="block overflow-hidden text-ellipsis hover:underline"
                        >
                          {cell}
                        </Link>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
                {withActions && (
                  <td className="sticky right-0 z-10 bg-background px-2 text-right whitespace-nowrap">
                    {renderRowActions?.(row)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
