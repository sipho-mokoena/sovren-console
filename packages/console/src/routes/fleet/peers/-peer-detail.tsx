/**
 * Fleet → Peers → one Peer: one machine on the overlay, and where it is.
 *
 * Overview and Machine, on tabs, with the tab in the URL so the page and the
 * specific tab are both linkable (R47, R41). Serves R22, R23, R38, R40, R58.
 *
 * ## `Peer` is NetBird's noun, and the page does not rename it
 *
 * An enrolled machine, whatever it is: a Proxmox `Node`, a guest `VM`, an
 * operator's own laptop, a phone, a CI runner. Adopting the word verbatim is the
 * Nomenclature table's rule and it has a cost worth paying -- `ops-laptop-sipho`
 * and `accra-server-01` are both Peers, and the page says so rather than quietly
 * sorting one of them into a category the other is not in. There is no "device",
 * no "agent" and no "endpoint" anywhere on it; `Endpoint` is a different noun
 * entirely and this page has nothing to say about one.
 *
 * ## `status` is the control plane's verdict, and this page holds no threshold
 *
 * `Peer.status` is `connected | stale | disconnected | unknown`, decided by the
 * control plane from `lastSeen` (R23). A peer that is asleep is `stale`; one that
 * is off is `disconnected`; those are different problems with different fixes.
 * Re-deriving them here from the timestamp would be a second implementation of a
 * rule the control plane already owns, and a second thing to be wrong -- so the
 * badge is the whole of the verdict, out of the one tone table every state in the
 * console shares.
 *
 * `lastSeen` is still rendered, and rendered twice: relatively, because "6d ago"
 * is what an operator reads, and absolutely, because a relative label is a claim
 * about a moment and the instant behind it is a fact somebody will paste into a
 * message. The relative half is computed at render, so it refreshes with the page.
 *
 * ## Where it is, and where the contract stops
 *
 * A Peer carries `node: NodeLink | null` and **no link to a `VM`**. It does not
 * carry a Site when it is not on managed hardware either, and both nulls are
 * states with consequences: an operator's laptop is enrolled, reachable and owned
 * by nobody, and a page that rendered that as a gap would be saying the machine
 * has no owner rather than that sovren does not manage it.
 *
 * So the Machine tab shows the `Node` when the contract names one, and says the
 * contract does not name one when it does not. It then lists **the guests on that
 * Node**, asked of the control plane through `VMList`'s own `node` parameter --
 * the same list, filtered, with the same columns imported from the VMs list --
 * and states plainly that the contract does not say which of them this Peer is.
 * Inventing that join -- matching on the peer's name, or assuming a guest peer
 * names a VM -- would be a second answer to a question the document has not asked,
 * and it would be wrong the first time a machine and one of its guests shared a
 * name, which the estate already does on purpose.
 *
 * ## Groups are NetBird's, and the estate's roster is not copied here
 *
 * The Groups are on the overview, in NetBird's names, and each one is a link to
 * the Peers list filtered by it. **No Group is ever written out as a choice in
 * this file.** The document declares no operation that enumerates NetBird's
 * Groups, so a set of chips built from "the six Groups this estate declares" would
 * be a second copy of a fact the estate owns, and it would start lying the moment
 * NetBird's roster changed -- which is the failure the Peers list's Group filter
 * already records rather than works around.
 *
 * They are on the overview rather than behind a third tab because they are three
 * chips long and a tab whose whole content is already on screen two clicks away is
 * a tab an operator opens to find nothing new.
 */

import { ArrowRight, Network } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePeerView, useVMList } from "@sovren/client";
import type { Peer, Vm } from "@sovren/client";

import { DetailPage } from "@/components/sovren/detail/detail-page";
import { DetailTable } from "@/components/sovren/detail/detail-table";
import type { DetailTab } from "@/components/sovren/detail/tab-state";
import { EmptyState } from "@/components/sovren/empty-state";
import { ErrorState } from "@/components/sovren/error-state";
import { PropertiesTable } from "@/components/sovren/properties-table";
import { StateBadge } from "@/components/sovren/state-badge";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { vmColumns } from "@/routes/fleet/vms/-list";

/** The list this page's breadcrumb returns to, with the operator's place on it. */
const PEERS_LIST_PATH = "/fleet/peers";

export interface PeerDetailProps {
  /**
   * The ref from the path: a name or an id, both of which the contract accepts
   * (R32) and `Peer.name` says so itself. Passed to every hook on this page
   * untouched, so a page reached by name and a page reached by id ask the control
   * plane the identical question.
   */
  peer: string;
}

export function PeerDetail({ peer: ref }: PeerDetailProps) {
  const query = usePeerView(ref);

  return (
    <DetailPage<Peer>
      query={query}
      // The Peers list's own icon, so this page and the list it was reached from
      // agree about what a Peer looks like. Written here rather than imported
      // because the list screen exports its columns and not its icon.
      icon={Network}
      breadcrumb={{ label: "Peers", to: PEERS_LIST_PATH }}
      label={(peer) => peer.name}
      error={(failure) => (
        <ErrorState
          error={failure}
          onRetry={() => {
            void query.refetch();
          }}
          busy={query.isFetching}
          actions={
            <a href={PEERS_LIST_PATH} className="text-xs underline underline-offset-4">
              Back to the Peers
            </a>
          }
        />
      )}
    >
      {(peer) => ({
        title: peer.name,
        description: (
          <span className="flex flex-wrap items-center gap-2">
            <StateBadge value={peer.status} />
            <span className="font-mono">{peer.overlay.address}</span>
            <span className="font-mono">{peer.os}</span>
            <span className="font-mono" data-node={peer.node === null ? "none" : "managed"}>
              {peer.node?.name ?? "not estate hardware"}
            </span>
          </span>
        ),
        identity: { id: peer.id, created: peer.created, updated: peer.updated },
        tabs: peerTabs(peer),
      })}
    </DetailPage>
  );
}

/** The two tabs, in the order an operator reads them. */
const peerTabs = (peer: Peer): DetailTab[] => [
  { key: "overview", label: "Overview", content: <Overview peer={peer} /> },
  {
    key: "machine",
    label: "Machine",
    description:
      "Where this Peer runs: the Node it enrols on, and the guests on that Node. A Peer is not necessarily estate hardware — an operator's own laptop is enrolled too, and then the contract names no Node at all.",
    content: <MachineTab peer={peer} />,
  },
];

/**
 * The overview: what this machine is, and how the mesh is reaching it.
 *
 * Two tables side by side -- the machine, and its place on the overlay -- because
 * a detail page that is one long list of ten properties is a page nobody reads to
 * the end, and grouping is what makes the second half visible.
 *
 * The status property is the shared `StateBadge` and nothing else. The Peers
 * list adds a second line under it ("answering", "not seen lately") because a
 * table row is one line tall and a badge alone does not read in a column of
 * forty; on a detail page the `Last seen` property sits directly beneath it and
 * says the same thing with the timestamp behind it, so restating it in prose
 * would be a second rendering of a value this page already shows.
 */
function Overview({ peer }: { peer: Peer }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">This machine</h2>
        <PropertiesTable
          label="Peer properties"
          items={[
            { label: "Name", value: peer.name, mono: true },
            {
              // The control plane's verdict, whole. The badge carries the word and
              // the tone, and nothing here decides anything from `lastSeen`.
              label: "Reachability",
              value: <StateBadge value={peer.status} />,
              hint: "decided by the control plane from when it last heard; this page holds no threshold of its own",
            },
            {
              label: "Last seen",
              value: <LastSeenValue peer={peer} />,
              hint: "relative for the eye, absolute for the truth",
            },
            { label: "OS", value: peer.os, mono: true },
            {
              // NetBird's own field, reported and not acted on: sovren does not
              // manage NetBird's access rules, so this page will not offer to
              // unblock anything.
              label: "Blocked",
              value:
                peer.isBlocked === undefined ? (
                  <span data-blocked="unreported" className="text-muted-foreground">
                    not reported
                  </span>
                ) : peer.isBlocked ? (
                  <span data-blocked="true">yes — blocked in NetBird</span>
                ) : (
                  <span data-blocked="false">no</span>
                ),
              hint: "reported, not acted on: NetBird owns its access rules",
            },
            {
              label: "User",
              value:
                peer.user === null || peer.user === undefined ? (
                  <span data-user="none" className="text-muted-foreground">
                    none
                  </span>
                ) : (
                  <span data-user={peer.user}>{peer.user}</span>
                ),
              hint: "the NetBird account this enrolment belongs to",
            },
            { label: "Overlay address", value: peer.overlay.address, mono: true },
            { label: "Overlay name", value: peer.overlay.hostname, mono: true },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">Groups</h2>
        <GroupPanel peer={peer} />
      </div>
    </div>
  );
}

/**
 * When the overlay last heard from this machine, twice.
 *
 * The relative form is what the eye reads; the absolute form is what an operator
 * copies into a message to a colleague, and it is the half that stays true
 * however long this page stays open. The `data-last-seen` marker carries the
 * contract's own timestamp, so a test can tell a six-day peer from a live one
 * without the test also having to know what "6d ago" will be on the day it runs.
 */
function LastSeenValue({ peer }: { peer: Peer }) {
  const at = Date.parse(peer.lastSeen);
  return (
    <span
      data-last-seen={peer.lastSeen}
      className="flex flex-col items-start leading-tight font-mono text-[11px]"
    >
      <span>{formatRelative(Number.isNaN(at) ? 0 : at, Date.now())}</span>
      <span className="text-muted-foreground">{formatTimestamp(peer.lastSeen)}</span>
    </span>
  );
}

/**
 * The Peer's Groups, as chips that filter the list.
 *
 * Each chip carries NetBird's own name and NetBird's own id, and links to the
 * Peers list filtered by that name -- the same filter the Peers list offers, on
 * the same parameter, so the round trip is the list's own and not a screen's
 * private idea of what "in this Group" means.
 */
function GroupPanel({ peer }: { peer: Peer }) {
  if (peer.groups.length === 0) {
    return (
      <div data-groups="none">
        <EmptyState
          compact
          title="This Peer is in no Group"
          body="NetBird puts every enrolled machine in a Group, so an empty set is a fact about this enrolment rather than a machine with no access restrictions — which is what an empty cell would read as."
        />
      </div>
    );
  }
  return (
    <div data-groups={String(peer.groups.length)} className="flex flex-col gap-1.5">
      {peer.groups.map((group) => (
        <Link
          key={group.id}
          to={`${PEERS_LIST_PATH}?group=${encodeURIComponent(group.name)}` as never}
          data-group={group.name}
          className="flex items-center justify-between border border-border px-2.5 py-1.5 text-xs hover:bg-muted/50"
        >
          <span className="flex flex-col items-start">
            <span className="font-medium">{group.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{group.id}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            the Peers in it
            <ArrowRight className="size-3" aria-hidden />
          </span>
        </Link>
      ))}
      <p className="text-[11px] text-muted-foreground">
        A Group is NetBird&rsquo;s own access-control grouping, named as NetBird names it. Each one
        links to the Peers list filtered by it, because the contract declares no operation that
        enumerates Groups and this page will not keep its own copy of the roster.
      </p>
    </div>
  );
}

/**
 * Where this Peer runs.
 *
 * The Node when the contract names one, its Site, and then the guests on that Node
 * as the control plane's own answer. The Node is a link, because a managed Peer's
 * Node has a page of its own and an operator reading "which machine is this" wants
 * to go there.
 */
function MachineTab({ peer }: { peer: Peer }) {
  if (peer.node === null) {
    return (
      <div data-node="none" className="flex flex-col gap-2">
        <EmptyState
          compact
          title={`${peer.name} is not on any Node sovren manages`}
          body="That is a real and common case, not a gap: an operator's own laptop, a phone and a CI runner are all Peers in NetBird's sense, and this is one of them. It is enrolled, it holds an overlay address, and no Node in this estate hosts it — so there is no machine here to link to and no guests to list."
        />
        <p className="text-[11px] text-muted-foreground">
          The Peers list is where a machine with no owner is found, by the fact that it has none.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PropertiesTable
        label="Machine properties"
        columns={1}
        items={[
          {
            label: "Node",
            value: (
              <Link
                to={`/fleet/nodes/${peer.node.name}` as never}
                data-node-link={peer.node.id}
                className="font-mono text-[11px] underline underline-offset-4"
              >
                {peer.node.name}
              </Link>
            ),
          },
          {
            label: "Site",
            value:
              peer.site === null ? (
                <span data-site="none" className="text-muted-foreground">
                  none reported
                </span>
              ) : (
                <span data-site={peer.site.name} className="font-mono">
                  {peer.site.name}
                </span>
              ),
          },
        ]}
      />
      <GuestsOnNode node={peer.node} />
    </div>
  );
}

/**
 * The guests on this Peer's Node, and the line the contract does not let us draw.
 *
 * The table is `VMList` filtered to the Node, with the VMs list's own columns --
 * so it is the same question the Node detail page asks, asked of the same
 * operation, and the two cannot disagree. What is added is the sentence saying
 * that the contract does not say which of these guests, if any, is the Peer the
 * operator is looking at: `Peer` carries `node` and no link to a `VM`, and a page
 * that picked one anyway would be guessing.
 */
function GuestsOnNode({ node }: { node: { readonly id: string; readonly name: string } }) {
  const query = useVMList({ node: node.id });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 className="font-heading text-xs font-medium">Guests on {node.name}</h2>
      <DetailTable<Vm>
        caption={`VMs on ${node.name}`}
        query={query}
        // The VMs list's own columns, imported rather than redrawn, for the same
        // reason the Node detail page's VMs tab uses them.
        columns={vmColumns(false)}
        rowKey={(vm) => vm.id}
        empty={{
          title: `No VM runs on ${node.name}`,
          body: "A physical machine with no guest on it is a normal thing to own: the machine itself is the resource, and this Peer is that machine rather than one of its guests.",
        }}
        more={{ to: "/fleet/vms", label: "Every VM in the estate" }}
      />
      <p data-join="absent" className="text-[11px] text-muted-foreground">
        The contract carries no link from a <span className="font-mono">Peer</span> to the{" "}
        <span className="font-mono">VM</span> it might be, so this page cannot say which of these
        guests is this Peer. The Node page&rsquo;s Peers tab is the place that question is answered,
        because a Node knows the whole of its own machine.
      </p>
    </div>
  );
}
