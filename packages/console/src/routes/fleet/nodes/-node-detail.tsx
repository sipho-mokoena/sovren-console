/**
 * Fleet → Nodes → one Node: what this machine is responsible for.
 *
 * Overview, Drives, VMs and Peers, on tabs, with the tab in the URL so the page
 * and the specific tab are both linkable (R47, R41). Serves R24, R38, R40.
 *
 * ## The three things this page is for
 *
 * **A heterogeneous machine reports what it actually has.** These are retired
 * university desktops: a 2009 Core 2 Duo beside a 2019 Xeon, one with 4 GB and
 * one with 192. The overview's CPU property is whatever the machine reported, its
 * cores are the cores it has, and a field the estate did not report arrives as
 * absent rather than as a fleet-wide default. Nothing on this page normalises,
 * because a page that did would be the first place the console told a fiction.
 *
 * **`Drive` and `Disk` never meet.** The Drives tab is about physical disks on
 * this machine and says `Drive` in every heading, column and empty state; VM
 * storage is a `Disk`, it belongs to a VM, and it appears on a VM's own page. The
 * Drives tab's column header is "Drive" and the word "Disk" does not occur on that
 * tab anywhere -- which is the assertion the invariant suite is watching for, and
 * it is asserted here against the rendered string rather than asserted in a
 * comment.
 *
 * **A Node that never enrolled reads as unenrolled.** `overlay` is `null` on
 * `takoradi-nas-01`, a retired NAS in an annexe, and null is a fact about the
 * machine rather than a gap in a table. It renders with the word "not enrolled" in
 * its own tone, exactly as the Nodes list renders it, so one phrase means one
 * thing across the console.
 *
 * ## The VMs and Peers tabs are the lists, filtered
 *
 * `VMList` and `PeerList` both declare a `node` parameter, so each tab asks the
 * control plane "the VMs of this Node" rather than fetching all the VMs and
 * filtering in the browser. The column sets are imported from the list screens
 * themselves, so a tab and its list are the same rendering of the same question --
 * the only difference is the filter, and the filter is the server's.
 *
 * A consequence worth stating because it is counter-intuitive: **a Node's Peers
 * tab is not just the machine itself.** A peer is an enrolment record, and every
 * guest on the machine is enrolled too, so `accra-server-01` shows itself plus
 * `netbird`, `sovren-cp` and `golden`. That is what the peers list filtered to this
 * machine means, and showing only the Node's own peer would be a second, different,
 * hand-rolled definition of the same question.
 *
 * ## Each tab fetches its own data, and only when it is showing
 *
 * A tab's body is a component, and the archetype places only the active one in the
 * tree -- so a Node page costs one request, not four. The cost of that is that a
 * tab's count cannot come from its own list; it comes from the Node, which carries
 * `driveCount` and `vmCount`. The Peers tab carries no count at all, for a reason
 * the tab label says: the Node knows how many machines it is (one, or none if it
 * never enrolled) and the tab shows the whole machine's enrolment, guests included.
 * A count that said "1" above four rows would be the first thing an operator
 * stopped believing on the page.
 */

import { Server } from "lucide-react";
import { useDriveList, useNodeView, usePeerList, useVMList } from "@sovren/client";
import type { Drive, Node, Peer, Vm } from "@sovren/client";

import { DetailPage } from "@/components/sovren/detail/detail-page";
import type { DetailTab } from "@/components/sovren/detail/tab-state";
import { DetailTable } from "@/components/sovren/detail/detail-table";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { ErrorState } from "@/components/sovren/error-state";
import { PropertiesTable } from "@/components/sovren/properties-table";
import { StateBadge } from "@/components/sovren/state-badge";
import type { ListColumn } from "@/components/sovren/list-page";
import { peerColumns } from "@/routes/fleet/peers/-list";
import { vmColumns } from "@/routes/fleet/vms/-list";
import { migrateRefusal } from "@/screens/nodes-list";
import { formatBytes, formatCount, formatDuration, formatNumber } from "@/lib/format";

/**
 * The drives tab's columns.
 *
 * `Drive` in the identity column's header, and nowhere on this tab is the word
 * `Disk`. The contrast with `Disk` -- VM storage, on a VM's own page -- is the
 * reason `Drive` is a separate noun in the first place, and a header that said
 * "Disk" over a list of physical disks would make the two indistinguishable to the
 * one reader who can resolve neither to a schema: the operator.
 */
const driveColumns: readonly ListColumn<Drive>[] = [
  {
    key: "name",
    header: "Drive",
    width: 190,
    identity: true,
    render: (drive) => drive.name,
  },
  {
    key: "type",
    header: "Type",
    width: 92,
    render: (drive) => <span className="font-mono text-[11px]">{drive.type}</span>,
  },
  {
    key: "size",
    header: "Size",
    width: 104,
    numeric: true,
    render: (drive) => formatBytes(drive.sizeBytes),
  },
  {
    key: "used",
    header: "Used",
    width: 104,
    numeric: true,
    // `usedBytes` is null on a drive nobody has measured -- `accra-server-01-sda`
    // is exactly that -- and a drive whose capacity is unmeasured is not a drive
    // with an empty one.
    render: (drive) => formatBytes(drive.usedBytes ?? null),
  },
  {
    key: "health",
    header: "Health",
    width: 108,
    render: (drive) => <StateBadge value={drive.health} />,
  },
  {
    key: "device",
    header: "Device",
    width: 148,
    render: (drive) => <span className="font-mono text-[11px]">{drive.pveDevice ?? ""}</span>,
  },
];

export interface NodeDetailProps {
  /**
   * The ref from the path: a name or an id, both of which the contract accepts
   * (R32). Passed to every hook on this page untouched, so a page reached by name
   * and a page reached by id ask the control plane the identical question -- which
   * is the whole of "the page is reachable by name and by id".
   */
  node: string;
  /** Set by a Site scope, so the breadcrumb returns to that lab's list. */
  site?: string;
}

export function NodeDetail({ node: ref, site }: NodeDetailProps) {
  const query = useNodeView(ref);
  const listPath = site === undefined ? "/fleet/nodes" : `/site/${site}/nodes`;

  return (
    <DetailPage<Node>
      query={query}
      icon={Server}
      breadcrumb={{ label: "Nodes", to: listPath }}
      label={(node) => node.name}
      error={(failure) => (
        <ErrorState
          error={failure}
          onRetry={() => {
            void query.refetch();
          }}
          busy={query.isFetching}
          actions={
            <a href={listPath} className="text-xs underline underline-offset-4">
              Back to the Nodes
            </a>
          }
        />
      )}
    >
      {(node) => ({
        title: node.name,
        description: (
          <span className="flex flex-wrap items-center gap-2">
            <StateBadge value={node.status} />
            <span className="font-mono">{node.site.name}</span>
            <span>
              {node.cpuModel} · {formatNumber(node.cores)} {node.cores === 1 ? "core" : "cores"}
            </span>
          </span>
        ),
        identity: { id: node.id, created: node.created, updated: node.updated },
        tabs: nodeTabs(node, ref),
        // R43: rendered, greyed, and labelled with the sovren code that refuses it.
        // The refusal is the same function the Nodes list uses, so a machine that
        // cannot be migrated says so in the same words in both places.
        actions: <DisabledActionButton action="migrate" refusal={migrateRefusal(node)} />,
      })}
    </DetailPage>
  );
}

/** The four tabs, in the order an operator reads them. */
const nodeTabs = (node: Node, ref: string): DetailTab[] => [
  { key: "overview", label: "Overview", content: <Overview node={node} /> },
  {
    key: "drives",
    label: "Drives",
    count: node.driveCount,
    description:
      "The storage attached to this machine. A Drive belongs to a Node and has no VM, ever.",
    content: <DrivesTab node={node} nodeRef={ref} />,
  },
  {
    key: "vms",
    label: "VMs",
    count: node.vmCount,
    description: "The guests running on this machine, as the VMs list filtered to it.",
    content: <VmsTab node={node} />,
  },
  {
    key: "peers",
    label: "Peers",
    // No count, and deliberately. `Node` carries no peer count, and the one it
    // could be derived from -- its own enrolment -- is a different number from the
    // rows below, because every guest on the machine is a peer too. See the file
    // header.
    description:
      "Everything enrolled on the overlay from this machine: the machine itself, and every guest running on it.",
    content: <PeersTab node={node} />,
  },
];

/**
 * The overview: what this machine has, as key and value.
 *
 * Two properties tables side by side -- the machine, and where it is on the
 * network -- because a detail page that is one long list of twelve properties is a
 * page nobody reads to the end, and grouping is what makes the second half visible.
 *
 * The CPU, the cores and the sockets are three separate properties rather than one
 * "2 cores / 4.0 GiB" line, and the reason is this ticket: a heterogeneous estate is
 * reported field by field, so the thing that differs between two machines shows up
 * as a differing value rather than disappearing inside a summary. `sockets` is
 * absent on a machine the estate does not describe it for, and absent is rendered
 * as its own state rather than as a one.
 */
function Overview({ node }: { node: Node }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">This machine</h2>
        <PropertiesTable
          label="Machine properties"
          items={[
            { label: "Name", value: node.name, mono: true },
            { label: "Site", value: node.site.name, mono: true },
            { label: "Status", value: <StateBadge value={node.status} /> },
            {
              // As this machine reports it. Not the fleet floor: a Node's CPU is
              // what it has, and the floor is a constraint on migration, reported
              // beside the CPU rather than substituted for it.
              label: "CPU model",
              value: node.cpuModel,
              mono: true,
              hint: "as this machine reports it, not the fleet floor",
            },
            {
              label: "Cores",
              value: formatNumber(node.cores),
              hint: socketHint(node.sockets),
            },
            {
              label: "Memory",
              value: `${formatBytes(node.memoryBytes)} of ${formatBytes(node.maxMemoryBytes)}`,
            },
            {
              // `Drive` again, and never `Disk`. The count is the number of physical
              // disks attached to this machine, and the hint says where VM storage
              // does live so an operator looking for a guest's storage is sent to
              // the right noun.
              label: "Drives",
              value:
                node.driveBytes === undefined
                  ? formatCount(node.driveCount, "Drive")
                  : `${formatCount(node.driveCount, "Drive")} · ${formatBytes(node.driveBytes)}`,
              hint: "physical storage on this machine; a VM's storage is a Disk on that VM",
            },
            { label: "VMs", value: formatCount(node.vmCount, "VM") },
            { label: "Proxmox", value: node.proxmoxVersion, mono: true },
            { label: "Uptime", value: formatDuration(node.uptimeSeconds) },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">On the network</h2>
        <OverlayPanel node={node} />

        <h2 className="mt-1 font-heading text-xs font-medium">Migration</h2>
        <PropertiesTable
          label="Migration properties"
          columns={1}
          items={[
            {
              label: "Offered",
              value: (
                <span data-migration={node.canMigrate ? "offered" : "refused"}>
                  <StateBadge
                    value={node.canMigrate ? "online" : "degraded"}
                    label={node.canMigrate ? "offered" : "refused"}
                  />
                </span>
              ),
              hint: node.canMigrate
                ? undefined
                : "Heterogeneous CPUs cannot offer live migration to one another, and a CPU below the floor cannot offer it at all.",
            },
            {
              label: "Code",
              value: <StateBadge value={migrateRefusal(node).reason} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

const socketHint = (sockets: number | undefined): string | undefined =>
  sockets === undefined || sockets <= 1 ? undefined : `${String(sockets)} sockets`;

/**
 * The overlay, or the fact that this machine is not on it.
 *
 * `null` is a state and gets its own words. A NAS in an annexe that never enrolled
 * is the machine an operator most needs to notice, and an empty cell in an
 * otherwise healthy table is the one rendering that would hide it.
 */
function OverlayPanel({ node }: { node: Node }) {
  if (node.overlay === null) {
    return (
      <div data-overlay="null" className="border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">not enrolled</p>
        <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/80">
          This machine has never joined the overlay, so it has no address and no resolvable name. It
          is reachable on the LAN only.
        </p>
      </div>
    );
  }
  return (
    <div data-overlay="enrolled">
      <PropertiesTable
        label="Overlay properties"
        columns={1}
        items={[
          { label: "Address", value: node.overlay.address, mono: true },
          { label: "Hostname", value: node.overlay.hostname, mono: true },
        ]}
      />
    </div>
  );
}

/** The physical disks on this machine. `DriveList` hangs off the Node, not the VM. */
function DrivesTab({ node, nodeRef }: { node: Node; nodeRef: string }) {
  const query = useDriveList(nodeRef);
  return (
    <DetailTable<Drive>
      caption={`Drives on ${node.name}`}
      query={query}
      columns={driveColumns}
      rowKey={(drive) => drive.id}
      empty={{
        title: `No Drive is attached to ${node.name}`,
        body: "A machine with no physical disk is a machine Proxmox has not enumerated storage for, which is a different thing from one whose drives have all failed.",
      }}
      // Drives are only ever listed under their Node in this contract, so there is
      // no estate-wide drive list to point at. The link is the Nodes list this page
      // was reached from, and it is here for the case where one machine has more
      // drives than a section shows.
      more={{ to: "/fleet/nodes", label: "The Nodes list" }}
    />
  );
}

function VmsTab({ node }: { node: Node }) {
  const query = useVMList({ node: node.id });
  return (
    <DetailTable<Vm>
      caption={`VMs on ${node.name}`}
      query={query}
      // The VMs list's own columns, imported rather than redrawn. A section that
      // drew its own would be a second rendering of the same list, and two
      // renderings of one question are how two screens come to disagree about its
      // answer. `--list` is exported by the screen, so the shared thing is shared
      // rather than copied.
      columns={vmColumns(false)}
      rowKey={(vm) => vm.id}
      empty={{
        title: `No VM runs on ${node.name}`,
        body: "A physical machine with no guest on it is a normal thing to own: the machine itself is the resource, and it needs no VM to be useful.",
      }}
      more={{ to: "/fleet/vms", label: "Every VM in the estate" }}
    />
  );
}

function PeersTab({ node }: { node: Node }) {
  const query = usePeerList({ node: node.id });
  return (
    <DetailTable<Peer>
      caption={`Peers on ${node.name}`}
      query={query}
      // The peers list's own columns, for the same reason the VMs tab uses the VMs
      // list's. The Site-scope variant is dropped: every peer on this tab is by
      // definition on this machine, so a Node column would repeat the header.
      columns={peerColumns(false)}
      rowKey={(peer) => peer.id}
      empty={{
        // A machine that never enrolled has no Peer, because a Peer is an
        // enrolment record -- not a Peer that has failed to check in. Saying so is
        // the difference between "fix the enrolment" and "look at the network".
        title:
          node.overlay === null
            ? `${node.name} has never enrolled, so it has no Peer`
            : `No Peer is enrolled from ${node.name}`,
        body:
          node.overlay === null
            ? "A Peer is the record of a machine having joined the overlay. This machine never joined, so there is nothing here to report as stale or disconnected."
            : "A Peer on this tab would be this machine or one of its guests. Nothing has enrolled from this machine.",
      }}
      more={{ to: "/fleet/peers", label: "Every Peer in the estate" }}
    />
  );
}
