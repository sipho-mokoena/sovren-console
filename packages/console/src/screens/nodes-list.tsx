/**
 * The Nodes list: the archetype with the first column set in it.
 *
 * Everything a screen is allowed to be responsible for lives here -- the column
 * set, the generated hook, the row actions, the empty state -- and everything
 * else comes from `ListPage`. The same component serves the Fleet scope and a
 * Site scope, differing only in whether a `site` filter is applied and whether
 * the Site column is worth a column's width, which is the whole argument for
 * having an archetype.
 *
 * ## The two states this screen exists to make visible
 *
 * **A Node with no overlay address.** `overlay` is `null` for a machine that was
 * never enrolled, and null is a real state. It renders as its own badge, in its
 * own tone, with the word "not enrolled" -- never as an empty cell, because an
 * empty cell in a healthy table reads as healthy, and an unenrolled NAS in an
 * annexe is the machine an operator most needs to notice.
 *
 * **A Node that cannot be migrated.** `canMigrate` is false across heterogeneous
 * CPUs, and the refusal is a sovren code from the fixed vocabulary. The control
 * is rendered, greyed, and labelled with the code; the sentence beside it is a
 * courtesy and is never the thing a screen would key off.
 */

import { useState } from "react";
import { Plus, Search, Server, X } from "lucide-react";
import { useNodeList } from "@sovren/client";
import type { DisabledAction, Node } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInheritedSearch } from "@/components/sovren/detail/tab-state";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { LinkButton } from "@/components/sovren/link-button";
import { ListPage } from "@/components/sovren/list-page";
import type { ListColumn } from "@/components/sovren/list-page";
import { StateBadge } from "@/components/sovren/state-badge";
import {
  disabledActionsOf,
  disabledActionFor,
  derivedDisabledAction,
} from "@/lib/disabled-actions";
import { formatBytes, formatNumber } from "@/lib/format";
import { stringifySovrenSearch } from "@/lib/search-params";
import { useListState, single } from "@/lib/list-state";

/** The search parameters this list owns. Everything else in the URL is left alone. */
const OWNED = ["q", "size", "page", "sort"] as const;

/** The columns that can be sorted, so an unknown key in a URL is ignored. */
const SORTABLE = ["name", "cpu", "cores", "memory", "drives", "status"] as const;

/** One list's identity for the page-token back stack. */
const pageHistoryKey = (scope: string): string => `nodes:${scope}`;

/**
 * A refusal to migrate, and where it came from.
 *
 * Three sources, in descending order of authority. A refusal the control plane
 * declared is the truth about the control plane, including on a Node this
 * screen's own rule would have got wrong. Below that, `canMigrate: false` is a
 * fact the row already carries, and the code is the one the request would carry.
 * Below that, the contract declares no operation that migrates a Node at all,
 * which is the honest reason to grey the control out on a machine that could
 * otherwise be migrated.
 */
export const migrateRefusal = (node: Node): DisabledAction => {
  const declared = disabledActionFor(disabledActionsOf(node.disabledActions), "migrate");
  if (declared !== undefined) return declared;
  if (!node.canMigrate) {
    return derivedDisabledAction(
      "migrate",
      "action_not_permitted",
      "This Node's CPU is below the fleet floor, so it cannot offer migration to anything else in the estate.",
    );
  }
  return derivedDisabledAction(
    "migrate",
    "action_not_permitted",
    "The contract declares no operation that migrates a Node.",
  );
};

/**
 * Where a row's identity cell leads, with the operator's place carried along.
 *
 * Scope-aware, and only because the breadcrumb at the other end has to know which
 * list to return to: a Site scope returns to that lab's Nodes, a Fleet scope to the
 * estate's. The ref is the Node's own name, because the detail page and every list
 * it makes accept a name exactly as well as an id.
 *
 * **The list's filters, sort and page travel with the link.** That is what makes
 * the return trip work: a detail page can only carry back what it was given, so a
 * row that dropped the query string would arrive at a detail page with no memory of
 * the view it was opened from, and its breadcrumb would return the operator to page
 * one of an unfiltered list. The detail page drops the tab on the way back, so the
 * two halves add up to the list's own URL.
 */
const nodeHref = (node: Node, site: string | undefined, search: Record<string, string>): string =>
  `${site === undefined ? "/fleet/nodes" : `/site/${site}/nodes`}/${node.name}${stringifySovrenSearch(search)}`;

/** An overlay address, or the state of not having one. */ function OverlayCell({
  node,
}: {
  node: Node;
}) {
  if (node.overlay === null) {
    return (
      <span data-overlay="null" className="text-[11px] text-amber-700 dark:text-amber-300">
        not enrolled
      </span>
    );
  }
  return (
    <span data-overlay="enrolled" className="flex flex-col leading-tight">
      <span className="font-mono text-[11px]">{node.overlay.address}</span>
      <span className="truncate text-[11px] text-muted-foreground">{node.overlay.hostname}</span>
    </span>
  );
}

/** The column set. `withSite` is the only difference between the two scopes. */
export const nodeColumns = (withSite: boolean): readonly ListColumn<Node>[] => {
  const columns: ListColumn<Node>[] = [
    {
      key: "name",
      header: "Node",
      width: 210,
      identity: true,
      sortable: true,
      sortValue: (node) => node.name,
      render: (node) => node.name,
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      sortable: true,
      sortValue: (node) => node.status,
      render: (node) => <StateBadge value={node.status} />,
    },
    {
      key: "cpu",
      header: "CPU",
      width: 250,
      sortable: true,
      sortValue: (node) => node.cpuModel,
      render: (node) => (
        <span className="flex flex-col leading-tight">
          <span className="truncate">{node.cpuModel}</span>
          <span className="text-[11px] text-muted-foreground">
            {node.sockets !== undefined && node.sockets > 1
              ? `${String(node.sockets)} sockets`
              : "1 socket"}
          </span>
        </span>
      ),
    },
    {
      key: "cores",
      header: "Cores",
      width: 80,
      numeric: true,
      sortable: true,
      sortValue: (node) => node.cores,
      render: (node) => formatNumber(node.cores),
    },
    {
      key: "memory",
      header: "Memory",
      width: 210,
      numeric: true,
      sortable: true,
      sortValue: (node) => node.memoryBytes,
      render: (node) => (
        <span title="memoryBytes of maxMemoryBytes, as this Node reports both">
          {formatBytes(node.memoryBytes)} of {formatBytes(node.maxMemoryBytes)}
        </span>
      ),
    },
    {
      key: "drives",
      header: "Drives",
      width: 175,
      numeric: true,
      sortable: true,
      sortValue: (node) => node.driveCount,
      // `Drive` is a physical disk. The count and the capacity are the question
      // an operator asks about a machine's storage, and they answer it together.
      render: (node) => (
        <span
          title={`${String(node.driveCount)} physical drives totalling ${formatBytes(node.driveBytes ?? null)}`}
        >
          {node.driveCount}
          {node.driveBytes === undefined ? "" : ` × ${formatBytes(node.driveBytes)}`}
        </span>
      ),
    },
    {
      key: "overlay",
      header: "Overlay",
      width: 200,
      render: (node) => <OverlayCell node={node} />,
    },
  ];

  if (withSite) {
    columns.push({
      key: "site",
      header: "Site",
      width: 150,
      sortable: true,
      sortValue: (node) => node.site.name,
      render: (node) => node.site.name,
    });
  }

  return columns;
};

export interface NodesListProps {
  /** Set by a Site scope. Absent in Fleet, which is every Site at once. */
  site?: string;
  /**
   * What this list is a list of, in the operator's terms.
   *
   * Accepted and deliberately not rendered. It used to be the tail of a sentence
   * above the table, and a sentence above the table is a line of the page spent
   * saying what the heading, the sidebar and the Site column already say. It
   * stays in the interface because the routes that mount this screen pass it, and
   * a screen's public shape is not something a density pass should change.
   */
  scopeLabel: string;
}

/**
 * The Nodes list.
 *
 * `useNodeList` is called with exactly the parameters the document declares for
 * `NodeList`, and the result is handed to the archetype untouched. There is no
 * client call in this file, no `await`, no `try` -- the client never throws, and
 * a component that had to catch would be a component that had forgotten to
 * narrow.
 */
export function NodesList({ site }: NodesListProps) {
  const list = useListState({
    key: pageHistoryKey(site ?? "fleet"),
    owned: OWNED,
    sortable: SORTABLE,
  });
  const query = useNodeList({
    ...(single(list.search, "q") === undefined ? {} : { q: single(list.search, "q") }),
    ...(site === undefined ? {} : { site }),
    size: list.size,
    ...(list.token === null ? {} : { page: list.token }),
  });

  /**
   * The URL as it stands, for the row links to carry.
   *
   * Read with the archetype's own reader rather than from `list.search`, because
   * `list.search` holds only the parameters this list owns -- and a row that carried
   * those but dropped the console's `?estate=` and `?sentinel=` would open a detail
   * page serving a different estate than the one the operator was looking at.
   */
  const inherited = useInheritedSearch();

  const filtering = single(list.search, "q") !== undefined;

  return (
    <ListPage<Node>
      title="Nodes"
      icon={Server}
      query={query}
      list={list}
      columns={nodeColumns(site === undefined)}
      rowKey={(node) => node.id}
      // Rows open the Node's detail page, and the row's own name is what the URL
      // carries -- the contract accepts a name or an id in every path parameter
      // (R32), so this is the ref an operator would have typed. The list's filters,
      // sort and page ride along, which is the other half of the return trip.
      rowHref={(node) => nodeHref(node, site, inherited)}
      filters={<NodeSearch list={list} filtering={filtering} />}
      // Wide enough for the control and the code that refuses it, which is the
      // whole point of rendering the code.
      actionsWidth={230}
      rowActions={(node) => (
        <DisabledActionButton action="migrate" refusal={migrateRefusal(node)} />
      )}
      // A VM is created from this screen as much as from the VMs list, because the
      // question an operator has while reading the machines is "which of these can
      // take another guest" -- so the create action belongs here. It is a link to
      // the form's own route over the VMs list (R49), carrying this list's search
      // so the operator's place in *this* view is still in the address bar when
      // the panel is open and when it closes.
      create={
        <LinkButton
          to={`/fleet/vms/new${stringifySovrenSearch(inherited)}` as never}
          variant="default"
          size="sm"
          data-vm-action="create"
        >
          <Plus aria-hidden />
          Create VM
        </LinkButton>
      }
      empty={{
        title: filtering
          ? `No Node matches “${single(list.search, "q") ?? ""}”`
          : "No Node in this estate",
        body: filtering
          ? "The filter is a substring match on the name, applied by the control plane."
          : "An estate with no machines in it has nothing to enumerate.",
        action: filtering ? <ClearFilter list={list} /> : undefined,
      }}
    />
  );
}

/** The name filter. Submits, rather than navigating on every keystroke. */
function NodeSearch({
  list,
  filtering,
}: {
  list: ReturnType<typeof useListState>;
  filtering: boolean;
}) {
  const [value, setValue] = useState(single(list.search, "q") ?? "");

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        list.setParams({ q: value.trim() === "" ? null : value.trim() });
      }}
    >
      <label className="sr-only" htmlFor="node-search">
        Filter Nodes by name
      </label>
      <Input
        id="node-search"
        name="q"
        value={value}
        placeholder="Filter by name"
        className="w-56"
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Button type="submit" variant="outline" size="icon-sm" aria-label="Apply the name filter">
        <Search aria-hidden />
      </Button>
      {filtering && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear the name filter"
          onClick={() => {
            setValue("");
            list.setParams({ q: null });
          }}
        >
          <X aria-hidden />
        </Button>
      )}
    </form>
  );
}

function ClearFilter({ list }: { list: ReturnType<typeof useListState> }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        list.clearParams();
      }}
    >
      <X aria-hidden />
      Clear the filter
    </Button>
  );
}
