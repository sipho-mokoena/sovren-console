/**
 * The Peers list: who is on the overlay, and who has stopped answering on it.
 *
 * R22, R23, R58, and the same archetype the Nodes list is built on -- a different
 * column set, a different generated hook, and the same refresh, pagination and
 * four states. There is no fetch in this file, no `await` and no `try`: the
 * client never throws, and the archetype is the one place a response union is
 * narrowed.
 *
 * ## The staleness decision is the server's, and this screen holds no threshold
 *
 * `Peer.status` is `connected | stale | disconnected | unknown`, decided by the
 * control plane from `lastSeen` (R23). A peer that is merely asleep is `stale`;
 * one that is off is `disconnected`; those are different problems with different
 * fixes, and a UI that re-derived them from the timestamp would be a second
 * implementation of a rule the control plane already owns -- and a second thing
 * to be wrong. So the filter here is `?status=stale`, the control plane does the
 * deciding, and the badge shows what it decided.
 *
 * `lastSeen` is still rendered, and it is still rendered twice: relatively,
 * because "6d ago" is what an operator reads, and absolutely, because a relative
 * label is a claim about a moment and the instant behind it is a fact. The
 * relative half is computed at render, so it refreshes when the row does.
 *
 * ## Groups are NetBird's, spelled the way NetBird spells them
 *
 * The Nomenclature table adopts `Group` verbatim, because a sovren-specific word
 * for something natively called a NetBird Group would force a translation table
 * on the operator. So the cell says "Infrastructure", "Service Hosts",
 * "Build Runners" -- NetBird's names, unmodified, and not a synonym for them.
 *
 * **The Group filter is a text field, and that is a gap rather than a choice.**
 * The document declares `PeerList.group` as "one NetBird Group, by name or by
 * id" but declares no `GroupList` operation, so the console cannot enumerate the
 * Groups that exist -- and typing the six this estate declares into a dropdown
 * would be a second list of the same fact, drifting the moment NetBird's roster
 * changed. An input asks for the name and lets the control plane answer, which is
 * what every other filter on this list does. Recorded rather than worked around;
 * a `GroupList` operation would close it.
 */

import { useState } from "react";
import { Network, Search, X } from "lucide-react";
import { PeerStatus, usePeerList } from "@sovren/client";
import type { Peer } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInheritedSearch } from "@/components/sovren/detail/tab-state";
import { ListPage } from "@/components/sovren/list-page";
import type { ListColumn } from "@/components/sovren/list-page";
import { StateBadge } from "@/components/sovren/state-badge";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { useListState, single } from "@/lib/list-state";
import { stringifySovrenSearch } from "@/lib/search-params";

/** The search parameters this list owns. Everything else in the URL is left alone. */
const OWNED = ["q", "group", "status", "size", "page", "sort"] as const;

/** The columns that can be sorted, so an unknown key in a URL is ignored. */
const SORTABLE = ["name", "status", "os", "groups", "lastSeen", "node"] as const;

/** One list's identity for the page-token back stack. */
const pageHistoryKey = (scope: string): string => `peers:${scope}`;

type ListState = ReturnType<typeof useListState>;

/**
 * A URL value as one of the contract's own values, or nothing.
 *
 * Search parameters arrive as strings and the document's filters are closed
 * vocabularies, so `?status=stalee` has to become *no filter* rather than a
 * request no backend can answer. The generated enum is the vocabulary, so a
 * state the document adds is accepted the moment the client is regenerated, and
 * a state it removes stops being accepted on the same run.
 */
const oneOf = <T extends string>(
  vocabulary: Readonly<Record<string, T>>,
  value: string | undefined,
): T | undefined =>
  value === undefined ? undefined : Object.values(vocabulary).find((entry) => entry === value);

/**
 * A peer's groups, in NetBird's vocabulary.
 *
 * NetBird puts every Peer in a Group, so the empty case is a machine the estate
 * does not describe rather than a real state -- but it is rendered as itself
 * anyway, because a cell with nothing in it reads as a Peer with no access
 * restrictions, which is the opposite of what null would mean.
 */
function GroupsCell({ peer }: { peer: Peer }) {
  if (peer.groups.length === 0) {
    return (
      <span data-groups="none" className="text-[11px] text-amber-700 dark:text-amber-300">
        in no Group
      </span>
    );
  }
  return (
    <span data-groups={String(peer.groups.length)} className="flex items-center gap-1">
      {peer.groups.map((group) => (
        <span
          key={group.id}
          data-group={group.name}
          className="inline-flex h-4.5 items-center border border-border bg-muted px-1.5 font-mono text-[10px] leading-none whitespace-nowrap text-muted-foreground"
        >
          {group.name}
        </span>
      ))}
    </span>
  );
}

/**
 * Reachability, as the control plane decided it.
 *
 * The badge is the whole of it. `connected` is emerald, `stale` is amber,
 * `disconnected` is destructive and `unknown` is muted, and those four tones come
 * from the one lookup table every state in the console shares -- so an operator
 * who has learned to read amber on the Nodes list is already able to read it
 * here. The `data-status` marker is for the same reason the overlay cell on
 * Nodes carries one: a test can distinguish a stale row from a live one without
 * the test also having to know what colour amber is.
 */
function StatusCell({ peer }: { peer: Peer }) {
  return (
    <span data-status={peer.status} className="flex flex-col items-start leading-tight">
      <StateBadge value={peer.status} />
      {peer.status === "connected" && (
        <span className="text-[10px] text-muted-foreground">answering</span>
      )}
      {peer.status === "stale" && (
        <span className="text-[10px] text-amber-700 dark:text-amber-300">not seen lately</span>
      )}
      {peer.status === "disconnected" && (
        <span className="text-[10px] text-destructive">not answering</span>
      )}
      {peer.status === "unknown" && (
        <span className="text-[10px] text-muted-foreground">unreported</span>
      )}
    </span>
  );
}

/**
 * When the overlay last heard from this peer, twice.
 *
 * `lastSeen` is reported whatever the status, because a peer that is `stale` is
 * far more useful with the timestamp than with the word. The relative form is
 * what the eye reads; the absolute form is what an operator copies into a
 * message to a colleague, and it is the half that is true independently of when
 * the row was rendered.
 */
function LastSeenCell({ peer }: { peer: Peer }) {
  const at = Date.parse(peer.lastSeen);
  return (
    <span data-last-seen={peer.lastSeen} className="flex flex-col items-start leading-tight">
      <span className="font-mono text-[11px]">
        {formatRelative(Number.isNaN(at) ? 0 : at, Date.now())}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {formatTimestamp(peer.lastSeen)}
      </span>
    </span>
  );
}

/**
 * The machine behind the peer, or the fact that there isn't one.
 *
 * `node` is null for a peer that is not a guest on a machine sovren manages -- an
 * operator's own laptop, a phone, a CI runner -- and those are real Peers in
 * NetBird's sense. So the cell says so, rather than leaving a gap that reads as
 * a peer with no owner.
 */
function NodeCell({ peer }: { peer: Peer }) {
  if (peer.node === null) {
    return (
      <span data-node="none" className="text-[11px] text-amber-700 dark:text-amber-300">
        not estate hardware
      </span>
    );
  }
  return (
    <span data-node="managed" className="font-mono text-[11px]">
      {peer.node.name}
    </span>
  );
}

/** The column set. `withSite` is the only difference between the two scopes. */
export const peerColumns = (withSite: boolean): readonly ListColumn<Peer>[] => {
  const columns: ListColumn<Peer>[] = [
    {
      key: "name",
      header: "Peer",
      width: 210,
      identity: true,
      sortable: true,
      sortValue: (peer) => peer.name,
      render: (peer) => peer.name,
    },
    {
      key: "status",
      header: "Reachability",
      width: 130,
      sortable: true,
      sortValue: (peer) => peer.status,
      render: (peer) => <StatusCell peer={peer} />,
    },
    {
      key: "address",
      header: "Overlay address",
      width: 200,
      render: (peer) => (
        <span data-overlay="enrolled" className="flex flex-col leading-tight">
          <span className="font-mono text-[11px]">{peer.overlay.address}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {peer.overlay.hostname}
          </span>
        </span>
      ),
    },
    {
      key: "os",
      header: "OS",
      width: 90,
      sortable: true,
      sortValue: (peer) => peer.os,
      render: (peer) => <span className="font-mono text-[11px]">{peer.os}</span>,
    },
    {
      key: "groups",
      header: "Groups",
      width: 300,
      sortable: true,
      // The whole set, so a peer in one Group and a peer in three sort the way
      // the column reads rather than the way one of them happens to be ordered.
      sortValue: (peer) => peer.groups.map((group) => group.name).join(", "),
      render: (peer) => <GroupsCell peer={peer} />,
    },
    {
      key: "lastSeen",
      header: "Last seen",
      width: 170,
      sortable: true,
      sortValue: (peer) => peer.lastSeen,
      render: (peer) => <LastSeenCell peer={peer} />,
    },
  ];

  // Only the Fleet scope needs the machine named: in a Site scope every peer on
  // screen is by definition in that lab, so the column would repeat the header.
  if (withSite) {
    columns.push({
      key: "node",
      header: "Node",
      width: 190,
      sortable: true,
      sortValue: (peer) => peer.node?.name ?? "",
      render: (peer) => <NodeCell peer={peer} />,
    });
  }

  return columns;
};

export interface PeersListProps {
  /** Set by a Site scope. Absent in Fleet, which is every Site at once. */
  site?: string;
  /**
   * What this list is a list of, in the operator's terms.
   *
   * Accepted and deliberately not rendered: it was the tail of a sentence above
   * the table saying what the heading and the sidebar already say. It stays in
   * the interface because the routes that mount this screen pass it.
   */
  scopeLabel: string;
}

/**
 * The Peers list.
 *
 * `usePeerList` is called with exactly the parameters the document declares, and
 * its result goes to the archetype untouched. The `site` filter is the only
 * difference between the two scopes, which is the whole argument for an
 * archetype: a list that behaves identically in two scopes is a list an operator
 * learns once.
 */
export function PeersList({ site }: PeersListProps) {
  const list = useListState({
    key: pageHistoryKey(site ?? "fleet"),
    owned: OWNED,
    sortable: SORTABLE,
  });

  // Read once, narrowed once. Everything below -- the request, the filter rail and
  // the empty state -- decides from the same three values, so they cannot disagree
  // about what is being filtered.
  const q = single(list.search, "q");
  const group = single(list.search, "group");
  const status = oneOf(PeerStatus, single(list.search, "status"));

  const query = usePeerList({
    ...(q === undefined ? {} : { q }),
    ...(group === undefined ? {} : { group }),
    ...(status === undefined ? {} : { status }),
    ...(site === undefined ? {} : { site }),
    size: list.size,
    ...(list.token === null ? {} : { page: list.token }),
  });

  const filtering = q !== undefined || group !== undefined || status !== undefined;

  /**
   * The console's own parameters, for a row's link to carry.
   *
   * `?estate=` and `?sentinel=` are in nobody's `OWNED` list, and the same loose
   * reader the detail archetype uses is what keeps them on every row's href --
   * which is what lets an operator send a colleague a link to the peer they are
   * looking at, in the estate they are looking at, with the failure they are
   * chasing still selected (R56).
   */
  const inherited = useInheritedSearch();

  return (
    <ListPage<Peer>
      title="Peers"
      icon={Network}
      query={query}
      list={list}
      columns={peerColumns(site === undefined)}
      rowKey={(peer) => peer.id}
      // A row opens its Peer's detail page, and the ref in the URL is the Peer's
      // own name: `Peer.name` is NetBird's mutable name and the document says it
      // "works in any path parameter alongside the id" (R32). The list's filters,
      // sort and page ride along, which is the other half of the return trip.
      rowHref={(peer) =>
        `/fleet/peers/${encodeURIComponent(peer.name)}${stringifySovrenSearch(inherited)}`
      }
      filters={
        <>
          <PeerSearch list={list} filtering={filtering} />
          <GroupFilter list={list} />
          <StatusFilter list={list} selected={status} />
        </>
      }
      // A Peer enrols itself with a SetupKey; there is nothing for an operator to
      // create here, and saying so is better than a greyed button.
      create={
        <span className="font-mono text-[11px] text-muted-foreground">
          peers enrol themselves with a SetupKey — they are not created here
        </span>
      }
      empty={{
        title: peerEmptyTitle({ q, group, status }),
        body: peerEmptyBody({ q, group, status }),
        action: filtering ? <ClearFilters list={list} /> : undefined,
      }}
    />
  );
}

/** The three filters this list owns, already read out of the URL. */
interface PeerFilters {
  readonly q: string | undefined;
  readonly group: string | undefined;
  readonly status: PeerStatus | undefined;
}

const peerEmptyTitle = ({ q, group, status }: PeerFilters): string => {
  if (group !== undefined) return `No Peer in the Group “${group}”`;
  if (status !== undefined) return `No Peer is ${status}`;
  if (q !== undefined) return `No Peer matches “${q}”`;
  return "No Peer is enrolled on the overlay";
};

const peerEmptyBody = ({ q, group, status }: PeerFilters): string => {
  if (status !== undefined) {
    return "The staleness decision is the control plane's, made from when it last heard from each peer. An empty answer means the estate has no peer in that state right now.";
  }
  if (group !== undefined) {
    return "A Group is NetBird's own access-control grouping, named as NetBird names it. The control plane matches the name exactly.";
  }
  if (q !== undefined) {
    return "The filter is a substring match on the name, applied by the control plane.";
  }
  return "Nothing has enrolled on the overlay. Machines join it themselves, with a SetupKey, and appear here the moment they do.";
};

/** The name filter. Submits, rather than navigating on every keystroke. */
function PeerSearch({ list, filtering }: { list: ListState; filtering: boolean }) {
  const [value, setValue] = useState(single(list.search, "q") ?? "");

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        list.setParams({ q: value.trim() === "" ? null : value.trim() });
      }}
    >
      <label className="sr-only" htmlFor="peer-search">
        Filter Peers by name
      </label>
      <Input
        id="peer-search"
        name="q"
        value={value}
        placeholder="Filter by name"
        className="w-48"
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
          aria-label="Clear every Peers filter"
          onClick={() => {
            setValue("");
            list.clearParams();
          }}
        >
          <X aria-hidden />
        </Button>
      )}
    </form>
  );
}

/**
 * The Group filter, as a name to type rather than a list to pick from.
 *
 * The document declares no operation that enumerates NetBird's Groups, so the
 * choices are not knowable here without a second copy of a list the estate
 * already owns. Asking for the name and letting the control plane answer is what
 * the other filters do, and it cannot go stale.
 */
function GroupFilter({ list }: { list: ListState }) {
  const [value, setValue] = useState(single(list.search, "group") ?? "");

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        list.setParams({ group: value.trim() === "" ? null : value.trim() });
      }}
    >
      <label className="sr-only" htmlFor="peer-group">
        Filter Peers by NetBird Group
      </label>
      <Input
        id="peer-group"
        name="group"
        value={value}
        placeholder="NetBird Group"
        className="w-44"
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Button type="submit" variant="outline" size="sm">
        Group
      </Button>
    </form>
  );
}

/**
 * The staleness filter, as the control plane's own vocabulary.
 *
 * The four values come from the generated `PeerStatus` rather than from a list
 * written out here, so a state the document adds becomes a filter the moment the
 * client is regenerated, and a state the document removes leaves nothing behind.
 * Each button is a link state in the URL (`?status=stale`), not a client-side
 * predicate -- which is what keeps the staleness rule in one place.
 */
function StatusFilter({ list, selected }: { list: ListState; selected: PeerStatus | undefined }) {
  return (
    <div role="group" aria-label="Filter Peers by reachability" className="flex items-center gap-1">
      {Object.values(PeerStatus).map((status) => {
        const active = selected === status;
        return (
          <Button
            key={status}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={active}
            onClick={() => {
              list.setParams({ status: active ? null : status });
            }}
          >
            {/* The pressed filter wears the badge, so choosing "stale" shows the
                same amber the rows will show. The choice and its consequence read
                as one thing. */}
            {active ? <StateBadge value={status} /> : status}
          </Button>
        );
      })}
    </div>
  );
}

function ClearFilters({ list }: { list: ListState }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        list.clearParams();
      }}
    >
      <X aria-hidden />
      Clear the filters
    </Button>
  );
}
