/**
 * Fleet → VMs → one VM: what this guest is and what is on it.
 *
 * Overview, Disks and Snapshots, on tabs, with the tab in the URL so the page and
 * the specific tab are both linkable (R47, R41). Serves R13, R27, R38, R40.
 *
 * ## `Disk`, on the tab that says so
 *
 * **`Drive` is a physical disk on a Node and `Disk` is VM storage, and this page
 * never crosses them.** The Disks tab lists `DiskList` at `/vms/{vm}/disks` --
 * storage belonging to this guest and to no machine -- and every heading, column
 * header, caption and empty state on that tab says `Disk`. The word `Drive` does
 * not occur on it. The contrast is the reason the two nouns exist: `Drive` is on
 * the Node detail page, where a physical disk belongs, and an operator looking
 * for a machine's storage should find it there and not here. So the Disks tab's
 * description says where the other word lives, which is the sentence that makes
 * the distinction deliberate rather than accidental.
 *
 * The columns are drawn here rather than imported, because the contract declares
 * no estate-wide `DiskList` and therefore no disk list screen to import from --
 * the same reason the Node detail page draws its own `Drive` columns. Where a
 * list *does* exist (`VMList`, `PeerList`), its columns are imported, so a
 * section and its list cannot answer one question two ways.
 *
 * ## A VM with no overlay address is not enrolled
 *
 * `overlay` is `null` on `golden-tpl` (a template that has never been started),
 * on `lab-build-02` (a create that was cancelled) and on `grafana-canary` (still
 * being built, so the guest agent has not run). Three different reasons, one
 * rendering: the word "not enrolled" in its own tone, with what it means. An
 * empty cell in an otherwise healthy properties table would be read as a healthy
 * VM with an unstated address, which is the one thing it is not.
 *
 * ## A failure, and a failure with no reason, are both stated
 *
 * `failureReason` is `string | null` and is non-null exactly when the run state is
 * `failed`, so the failed VM in this estate names what failed. The null arm is
 * rendered as itself too -- "no reason reported" -- because a properties row that
 * silently disappears is a screen telling the operator nothing went wrong. The
 * same rule holds for `transitionalTask`: a VM mid-create links to the `Task` so
 * the operator can watch the work (R51), and a transitional VM whose Task is
 * absent says so rather than implying that nothing is in flight.
 *
 * ## The snapshots tab declares no operation to take one
 *
 * `SnapshotList` exists and `SnapshotCreate` does not. The document declares no
 * way to create, restore or delete a Snapshot, so this page renders the create
 * control **greyed, with the reason** (R43) -- not omitted, because an operator
 * who cannot see that snapshots can be taken learns less than one who can see it
 * refused, and not live, because a control the contract cannot honour is a
 * control that would lie.
 */

import type { ReactNode } from "react";
import { ArrowRight, HardDrive, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useDiskList, useSnapshotList, useVMView } from "@sovren/client";
import type { DisabledAction, Disk, Snapshot, Vm, VMPurpose } from "@sovren/client";

import { DetailPage } from "@/components/sovren/detail/detail-page";
import { DetailTable } from "@/components/sovren/detail/detail-table";
import type { DetailTab } from "@/components/sovren/detail/tab-state";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { ErrorState } from "@/components/sovren/error-state";
import { LinkButton } from "@/components/sovren/link-button";
import { PropertiesTable } from "@/components/sovren/properties-table";
import { StateBadge } from "@/components/sovren/state-badge";
import type { ListColumn } from "@/components/sovren/list-page";
import { ABSENT, formatBytes, formatDuration, formatNumber, formatTimestamp } from "@/lib/format";
import { migrateRefusal, RunStateCell } from "./-list";
import { useVmsEditHref } from "./-vm-paths";

/**
 * The list these panels cover. The breadcrumb returns here with the operator's
 * filters, sort and page still on it.
 */
const VMS_LIST_PATH = "/fleet/vms";

/**
 * The Disks tab's columns.
 *
 * `Disk` in the identity column's header and nowhere `Drive`. The distinction is
 * not pedantry: an operator who cannot resolve either word to a schema reads them
 * from the console, and a page that used the wrong one for a physical disk would
 * make the two indistinguishable to exactly the reader who needs them distinct.
 */
const diskColumns: readonly ListColumn<Disk>[] = [
  {
    key: "name",
    header: "Disk",
    width: 210,
    identity: true,
    render: (disk) => disk.name,
  },
  {
    key: "size",
    header: "Size",
    width: 100,
    numeric: true,
    render: (disk) => formatBytes(disk.sizeBytes),
  },
  {
    key: "used",
    header: "Used",
    width: 128,
    // `usedBytes` is `number | null`: storage nobody has measured is absent, and
    // a Disk with no reported usage is not a Disk with an empty one.
    render: (disk) => formatBytes(disk.usedBytes ?? null),
  },
  {
    key: "storage",
    header: "Storage",
    width: 118,
    render: (disk) => <span className="font-mono text-[11px]">{disk.storage ?? ABSENT}</span>,
  },
  {
    key: "format",
    header: "Format",
    width: 96,
    render: (disk) => <span className="font-mono text-[11px]">{disk.format ?? ABSENT}</span>,
  },
  {
    key: "cloudInit",
    header: "Cloud-init",
    width: 108,
    // Absent on a Disk that is not the cloud-init drive, which is every Disk but
    // one on a VM -- so absent is read as "no", and the one that is gets the
    // warning R62 makes necessary: it must stay attached or boot hangs.
    render: (disk) =>
      disk.isCloudInit === true ? (
        <span className="text-[11px] text-amber-700 dark:text-amber-300">yes · stays attached</span>
      ) : (
        <span className="text-[11px] text-muted-foreground">no</span>
      ),
  },
];

/**
 * The Snapshots tab's columns.
 *
 * A Snapshot is a point-in-time disk copy, so its size is the thing an operator
 * is shopping for and `includesMemory` is the difference between a disk copy and
 * a restorable running state. The parent is rendered as the id the contract
 * carries, because `parentSnapshotId` is a reference and this page holds no index
 * to turn it into a name -- inventing one here would be a join the document did
 * not make.
 */
const snapshotColumns: readonly ListColumn<Snapshot>[] = [
  {
    key: "name",
    header: "Snapshot",
    width: 232,
    identity: true,
    render: (snapshot) => snapshot.name,
  },
  {
    key: "description",
    header: "Description",
    width: 300,
    render: (snapshot) => (
      <span className="truncate" title={snapshot.description ?? undefined}>
        {snapshot.description ?? ABSENT}
      </span>
    ),
  },
  {
    key: "parent",
    header: "Taken from",
    width: 148,
    render: (snapshot) => (
      <span className="font-mono text-[11px]">{snapshot.parentSnapshotId ?? ABSENT}</span>
    ),
  },
  {
    key: "size",
    header: "Size",
    width: 100,
    numeric: true,
    render: (snapshot) => formatBytes(snapshot.sizeBytes),
  },
  {
    key: "memory",
    header: "Memory",
    width: 116,
    render: (snapshot) =>
      snapshot.includesMemory === true ? (
        <span className="text-[11px]">captured</span>
      ) : (
        <span className="text-[11px] text-muted-foreground">not captured</span>
      ),
  },
  {
    key: "taken",
    header: "Taken",
    width: 168,
    render: (snapshot) => (
      <span className="font-mono text-[11px]">{formatTimestamp(snapshot.created)}</span>
    ),
  },
];

/**
 * What a `purpose` is for, in the three words the document uses.
 *
 * `infrastructure`, `service` and `workload` are not states, so they are not
 * badges -- the badge table answers "is this working" and a purpose does not
 * answer that. The sentence is what makes the field legible: it is the one
 * property on this page that tells an operator whether the machine is sovren's
 * own, a Dokploy host, or somebody's afternoon.
 */
const PURPOSE_MEANING: Readonly<Record<VMPurpose, string>> = {
  infrastructure: "backs sovren itself: the overlay, the control plane, a Dokploy host",
  service: "hosts a Dokploy Service",
  workload: "handed to an operator to experiment on",
};

/**
 * The refusal that a Snapshot cannot be taken, and nothing else.
 *
 * Declared in this file rather than derived from the VM, because it is not about
 * the VM: the document declares no operation that creates, restores or deletes a
 * Snapshot, for any VM in any state. One reason, one code, every row.
 */
const snapshotRefusal = (): DisabledAction => ({
  action: "snapshot",
  reason: "action_not_permitted",
  explanation:
    "The contract declares no operation that takes, restores or deletes a Snapshot, so this control cannot be honoured yet.",
});

export interface VmDetailProps {
  /**
   * The ref from the path: a name or an id, both of which the contract accepts
   * (R32). Passed to every hook on this page untouched, so a page reached by name
   * and a page reached by id ask the control plane the identical question.
   */
  vm: string;
}

export function VmDetail({ vm: ref }: VmDetailProps) {
  const query = useVMView(ref);

  return (
    <DetailPage<Vm>
      query={query}
      // The VMs list's own icon, so this page and the list it was reached from
      // agree about what a VM looks like. Written here rather than imported
      // because the list screen exports its columns and not its icon, and a
      // detail page that picked a different glyph would be the first place the
      // console showed two icons for one noun.
      icon={HardDrive}
      breadcrumb={{ label: "VMs", to: VMS_LIST_PATH }}
      label={(vm) => vm.name}
      error={(failure) => (
        <ErrorState
          error={failure}
          onRetry={() => {
            void query.refetch();
          }}
          busy={query.isFetching}
          actions={
            <a href={VMS_LIST_PATH} className="text-xs underline underline-offset-4">
              Back to the VMs
            </a>
          }
        />
      )}
    >
      {(vm) => ({
        title: vm.name,
        description: (
          <span className="flex flex-wrap items-center gap-2">
            <RunStateCell vm={vm} />
            <span className="font-mono">{vm.node.name}</span>
            <span className="font-mono">{vm.site.name}</span>
            <span className="font-mono" data-purpose={vm.purpose}>
              {vm.purpose}
            </span>
          </span>
        ),
        identity: { id: vm.id, created: vm.created, updated: vm.updated },
        tabs: vmTabs(vm, ref),
        banner: vmBanner(vm),
        actions: <VmActions vm={vm} />,
      })}
    </DetailPage>
  );
}

/**
 * The header actions.
 *
 * A component rather than markup, because the edit href is a hook: it reads the
 * operator's place out of the URL so the form opens over this page and returns
 * here. The `DetailView.children` callback runs inside the archetype's render, and
 * a hook called in there would be the archetype's hook.
 *
 * The edit control is a *link* to the existing form route (R49, R50). That route
 * belongs to the form work; this page links to it and does not touch it.
 */
function VmActions({ vm }: { vm: Vm }) {
  const href = useVmsEditHref(vm.name);
  return (
    <>
      <LinkButton to={href as never} variant="outline" size="sm" data-vm-action="edit">
        <Pencil aria-hidden />
        Edit
      </LinkButton>
      {/* R43, and the same refusal the VMs list's rows use -- imported rather than
          re-derived, so a VM that cannot be migrated says so in the same words in
          both places. */}
      <DisabledActionButton action="migrate" refusal={migrateRefusal(vm)} />
    </>
  );
}

/**
 * What the operator needs to know before they read anything else.
 *
 * Two states, and only two, because the archetype's `banner` is for a fact that
 * changes what an operator does next:
 *
 *  - **transitional** -- a create `Task` is in flight, and the control's work is
 *    the thing to watch (R51), so the banner names it and links to it. The
 *    console never asserts that a boot will finish.
 *  - **failed** -- a `Task` ended in failure, which is *not* the same as stopped.
 *    The banner carries the reason the control plane gave, and when the control
 *    plane gave none it says that, because "failed" with no reason is a
 *    different investigation from "failed" with one.
 */
function vmBanner(vm: Vm): ReactNode | undefined {
  if (vm.runState === "transitional") {
    return (
      <div
        data-banner="transitional"
        className="flex flex-wrap items-center gap-2 border border-sky-500/40 bg-sky-500/10 px-3 py-2"
      >
        <StateBadge value="transitional" />
        <span className="text-xs">in flight — this VM is not up and not broken yet</span>
        {vm.transitionalTask === null ? (
          <span
            data-task="absent"
            className="text-[11px] text-sky-800 dark:text-sky-200"
            title="The contract reports this VM as transitional but names no Task for it."
          >
            the control plane named no Task for the work
          </span>
        ) : (
          <Link
            to={`/fleet/tasks/${vm.transitionalTask.id}` as never}
            data-task={vm.transitionalTask.id}
            className="inline-flex items-center gap-1 text-[11px] text-sky-800 underline underline-offset-4 dark:text-sky-200"
          >
            <ArrowRight className="size-3" aria-hidden />
            watch the {vm.transitionalTask.kind} {vm.transitionalTask.id}
          </Link>
        )}
      </div>
    );
  }

  if (vm.runState === "failed") {
    return (
      <div
        data-banner="failed"
        className="flex flex-wrap items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2"
      >
        <StateBadge value="failed" />
        <span className="text-xs font-medium">this VM failed</span>
        {vm.failureReason === null ? (
          <span
            data-failure="absent"
            className="text-[11px] text-destructive"
            title="The control plane reported this VM as failed without saying why."
          >
            the control plane reported no reason
          </span>
        ) : (
          <span data-failure="reported" className="text-[11px] text-destructive">
            {vm.failureReason}
          </span>
        )}
      </div>
    );
  }

  return undefined;
}

/**
 * The three tabs, in the order an operator reads them.
 *
 * **No tab carries a count**, and that is a decision rather than an omission.
 * `Vm` declares `diskBytes` and no `diskCount`, and no snapshot count at all, so
 * a number beside either label would be the console's own arithmetic -- and a
 * count that said "2" over four rows would be the first thing an operator
 * stopped believing on this page. The Node detail page's Peers tab is the same
 * decision for the same reason.
 */
const vmTabs = (vm: Vm, ref: string): DetailTab[] => [
  { key: "overview", label: "Overview", content: <Overview vm={vm} /> },
  {
    key: "disks",
    label: "Disks",
    description:
      "Storage attached to this guest, from DiskList. A Disk belongs to a VM and has no Node; a physical disk is a Drive, and it lives on that machine's own page.",
    content: <DisksTab vm={vm} vmRef={ref} />,
  },
  {
    key: "snapshots",
    label: "Snapshots",
    description:
      "Point-in-time disk copies of this guest, from SnapshotList. The contract declares no operation that takes one, so the control below is greyed with the reason rather than offered.",
    content: <SnapshotsTab vm={vm} vmRef={ref} />,
  },
];

/**
 * The overview: what this guest is, as key and value.
 *
 * Two tables side by side -- the machine, and where it is on the network --
 * because a detail page that is one long list of twelve properties is a page
 * nobody reads to the end, and grouping is what makes the second half visible.
 *
 * The `State` property renders the *list's own* run-state cell, imported from
 * `-list.tsx`. That is the point of importing it: the badge, the in-flight Task
 * and the failure reason are then literally the same component here and on the
 * row the operator clicked, so the two can never disagree about what a state is
 * carrying.
 */
function Overview({ vm }: { vm: Vm }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">This guest</h2>
        <PropertiesTable
          label="VM properties"
          items={[
            { label: "Name", value: vm.name, mono: true },
            { label: "Node", value: vm.node.name, mono: true },
            { label: "Site", value: vm.site.name, mono: true },
            {
              // The contract's own three values, and the sentence that makes them
              // legible. Not a badge: a purpose is not a state.
              label: "Purpose",
              value: <span data-purpose={vm.purpose}>{vm.purpose}</span>,
              hint: PURPOSE_MEANING[vm.purpose],
            },
            {
              // The floor, not the host. Every VM runs the lowest common
              // denominator across the fleet (R63), so reporting the host's CPU
              // here would be a fiction about a machine that could move.
              label: "CPU model",
              value: vm.cpuModel,
              mono: true,
              hint: "the fleet floor, not the host's",
            },
            {
              label: "Cores",
              value: formatNumber(vm.cores),
              hint: "as the VM has been given them, not as the Node has them",
            },
            { label: "Memory", value: formatBytes(vm.memoryBytes) },
            {
              // `diskBytes` is optional and absent on a VM the estate has not
              // measured. Absent renders as absent, and the hint points at the
              // Disks tab, which is where the truth is.
              label: "Storage",
              value: formatBytes(vm.diskBytes),
              hint: "declared; the Disks tab is the per-Disk record",
            },
            {
              label: "State",
              value: <RunStateCell vm={vm} />,
              hint: "the VMs list's own run-state cell, unchanged",
            },
            {
              // Both arms rendered. A VM that is not transitional has no Task in
              // flight, and saying "none" is different from rendering nothing.
              label: "Task in flight",
              value:
                vm.transitionalTask === null ? (
                  <span data-task="none" className="text-muted-foreground">
                    none
                  </span>
                ) : (
                  <Link
                    to={`/fleet/tasks/${vm.transitionalTask.id}` as never}
                    data-task={vm.transitionalTask.id}
                    className="font-mono text-[11px] underline underline-offset-4"
                  >
                    {vm.transitionalTask.id}
                  </Link>
                ),
              hint: vm.transitionalTask === null ? undefined : vm.transitionalTask.kind,
            },
            {
              label: "Failure reason",
              value:
                vm.failureReason === null ? (
                  <span data-failure="none" className="text-muted-foreground">
                    none reported
                  </span>
                ) : (
                  <span data-failure="reported" className="break-words">
                    {vm.failureReason}
                  </span>
                ),
              hint: "non-null exactly when the state is failed; a failure is never a stop",
            },
            {
              label: "Template",
              value:
                vm.isTemplate === undefined ? (
                  <span data-template="unreported" className="text-muted-foreground">
                    not reported
                  </span>
                ) : vm.isTemplate ? (
                  <span data-template="true">yes — every later VM is a clone of it</span>
                ) : (
                  <span data-template="false">no</span>
                ),
            },
            {
              label: "Tags",
              value:
                vm.tags === undefined || vm.tags.length === 0 ? (
                  <span data-tags="none" className="text-muted-foreground">
                    none
                  </span>
                ) : (
                  <span data-tags={String(vm.tags.length)} className="flex flex-wrap gap-1">
                    {vm.tags.map((tag) => (
                      <span
                        key={tag}
                        data-tag={tag}
                        className="inline-flex h-4.5 items-center border border-border bg-muted px-1.5 font-mono text-[10px] leading-none text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                ),
            },
            { label: "Uptime", value: formatDuration(vm.uptimeSeconds) },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">On the network</h2>
        <OverlayPanel vm={vm} />

        <h2 className="mt-1 font-heading text-xs font-medium">Migration</h2>
        <PropertiesTable
          label="Migration properties"
          columns={1}
          items={[
            {
              label: "Offered",
              value: (
                <span data-migration={vm.canMigrate ? "offered" : "refused"}>
                  <StateBadge
                    value={vm.canMigrate ? "online" : "degraded"}
                    label={vm.canMigrate ? "offered" : "refused"}
                  />
                </span>
              ),
              hint: vm.canMigrate
                ? undefined
                : "This VM's CPU model is below the fleet floor, so it cannot offer migration to anything else in the estate.",
            },
            {
              // The same function the VMs list's rows use, so the code beside a
              // greyed control and the code a request would carry are one code.
              label: "Code",
              value: <StateBadge value={migrateRefusal(vm).reason} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * The overlay, or the fact that this guest is not on it.
 *
 * `null` is a state and gets its own words, for the same reason the Nodes list
 * gives an unenrolled machine its own: a template nobody has started, a create
 * that was cancelled and a boot still in flight all arrive here as `null`, and an
 * empty cell in a healthy-looking table hides the one of them an operator most
 * needs to notice.
 */
function OverlayPanel({ vm }: { vm: Vm }) {
  if (vm.overlay === null) {
    return (
      <div data-overlay="null" className="border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">not enrolled</p>
        <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/80">
          This VM has no overlay address, so it has no resolvable name on the mesh and no Peer in
          the estate. It is reachable on its Node&rsquo;s LAN only.
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
          { label: "Address", value: vm.overlay.address, mono: true },
          { label: "Hostname", value: vm.overlay.hostname, mono: true },
        ]}
      />
    </div>
  );
}

/**
 * The Disks tab. `DiskList` hangs off the VM, not off a Node.
 *
 * The ref goes to the hook untouched, so a page reached by name and a page
 * reached by id ask for the same storage.
 */
function DisksTab({ vm, vmRef }: { vm: Vm; vmRef: string }) {
  const query = useDiskList(vmRef);
  return (
    <DetailTable<Disk>
      caption={`Disks on ${vm.name}`}
      query={query}
      columns={diskColumns}
      rowKey={(disk) => disk.id}
      empty={{
        title: `${vm.name} has no Disk`,
        body: "A guest with no storage attached is a guest Proxmox has not finished building, or one whose storage has been detached. It is not the same as a guest whose Disks report no usage — see the Used column.",
      }}
      // DiskList is declared under a VM and nowhere else, so there is no
      // estate-wide disk list to link out to. The link is the VMs list this page
      // was reached from, and it is here for the case where one guest has more
      // Disks than a section shows.
      more={{ to: VMS_LIST_PATH, label: "The VMs list" }}
    />
  );
}

/**
 * The Snapshots tab, with the create control it cannot honour.
 *
 * Rendered, greyed, and labelled with the sovren code that refuses it (R43). The
 * alternative -- omitting the control -- would leave an operator who knows
 * Proxmox to wonder whether sovren takes snapshots at all, and a live control
 * would be a promise the document does not keep.
 */
function SnapshotsTab({ vm, vmRef }: { vm: Vm; vmRef: string }) {
  const query = useSnapshotList(vmRef);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <DisabledActionButton action="snapshot" refusal={snapshotRefusal()} />
        <span className="font-mono text-[11px] text-muted-foreground">
          SnapshotList only — the contract declares no operation that takes one
        </span>
      </div>
      <DetailTable<Snapshot>
        caption={`Snapshots on ${vm.name}`}
        query={query}
        columns={snapshotColumns}
        rowKey={(snapshot) => snapshot.id}
        empty={{
          title: `${vm.name} has no Snapshot`,
          body: "A Snapshot is a point-in-time disk copy, and it is what makes an experiment reversible. Nothing has been taken of this guest, and the control above is the reason it cannot be taken from here yet.",
        }}
        more={{ to: VMS_LIST_PATH, label: "The VMs list" }}
      />
    </div>
  );
}
