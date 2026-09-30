/**
 * The properties table: key and value, the fixed form for a detail page.
 *
 * R38 fixes three archetypes and this is the vocabulary two of them share. A
 * detail page is properties, and a form's read-only summary is properties, and
 * two implementations of "label on the left, value on the right" is how a
 * console stops looking like one thing.
 *
 * Values are rendered by the caller, not stringified here. A value that is
 * absent is a real state in this estate -- `overlay` is null on a Node that was
 * never enrolled, and `driveBytes` is absent on a drive nobody has measured --
 * so "absent" is a first-class value with its own rendering rather than an
 * empty cell that reads as healthy.
 */

import type { ReactNode } from "react";
import { cn } from "cn";
import { ABSENT } from "@/lib/format";

export interface PropertyItem {
  /** The noun, in the contract's own words. */
  label: string;
  value: ReactNode;
  /** Monospace, for an id, an address, a code, or anything an operator will copy. */
  mono?: boolean;
  /** Span the full width, for a `why` or a message that needs the room. */
  wide?: boolean;
  /** Rendered under the value. Used for the ID/created/updated block. */
  hint?: ReactNode;
}

export interface PropertiesTableProps {
  items: readonly PropertyItem[];
  /** A caption for assistive technology. Every table needs one. */
  label: string;
  className?: string;
  columns?: 1 | 2;
}

export function PropertiesTable({ items, label, className, columns = 2 }: PropertiesTableProps) {
  return (
    <table aria-label={label} className={cn("w-full border-collapse text-xs", className)}>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.label}
            data-property={item.label}
            className="border-b border-border last:border-b-0"
          >
            <th
              scope="row"
              className={cn(
                "w-44 align-top py-2 pr-3 text-left font-medium text-muted-foreground",
                columns === 2 ? "md:w-48" : "md:w-56",
              )}
            >
              {item.label}
            </th>
            <td
              className={cn(
                "align-top py-2 text-foreground",
                item.mono === true && "font-mono text-[11px]",
                item.wide === true && "break-words",
              )}
            >
              {item.value === undefined || item.value === null || item.value === "" ? (
                <span className="text-muted-foreground">{ABSENT}</span>
              ) : (
                item.value
              )}
              {item.hint !== undefined && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The identity block every detail page opens with.
 *
 * R40: ID, created, updated, on every detail page, identical every time. It is
 * here as one component rather than three properties per screen because a
 * property list that puts `created` before `id` on one page and after it on
 * another is a property list nobody can scan.
 */
export function IdentityBlock({
  id,
  created,
  updated,
}: {
  id: string;
  created: string;
  updated: string;
}) {
  return (
    <div
      data-identity="true"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <span>ID</span>
        <code className="font-mono text-foreground">{id}</code>
      </span>
      <span className="flex items-center gap-1.5">
        <span>Created</span>
        <span className="font-mono text-foreground">{created}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span>Updated</span>
        <span className="font-mono text-foreground">{updated}</span>
      </span>
    </div>
  );
}
