/**
 * The VMs list: one row per guest, joined to the machine that hosts it.
 *
 * R13, R27, R63, R64, and the same archetype the Nodes and Peers lists are built
 * on. No fetch, no `await`, no `try` in this file: the client never throws, and
 * the archetype is the one place a response union is narrowed.
 *
 * ## The join is a column, not a query
 *
 * `VMList` returns each VM with its `node` inline, and `vM.node.name` is what the
 * Node column renders. Nothing here correlates two lists, and nothing could
 * disagree with a hand-performed join, because there is no second list to
 * disagree with. That is a property of the document, and this screen is the
 * reason it is worth having.
 *
 * ## The four states this screen exists to keep apart
 *
 * A `VM.runState` is `transitional | running | stopped | paused | suspended |
 * failed`, and the three that are easy to confuse are kept apart on purpose. The
 * console holds no rule of its own about which is which -- it renders the state
 * the contract gave and says what that state is carrying:
 *
 *  - **transitional** -- a create `Task` is running and the outcome has not been
 *    observed yet. Neither up nor broken, and the cell names the Task so the
 *    operator can watch the work rather than guess at it (R51).
 *  - **failed** -- a `Task` ended in failure, which is *not* the same as stopped.
 *    The cell carries `failureReason`, and renders the case where there is none
 *    as its own state rather than as an empty line that reads like a VM with
 *    nothing to report. A failure is never mistaken for intent.
 *  - **running / stopped** -- the two ordinary states, and neither of them ever
 *    appears with a reason attached.
 *
 * The three have three different tones out of the one badge table, so they are
 * distinguishable by eye before any text is read: sky for in flight, emerald for
 * up, muted for stopped, destructive for failed.
 *
 * ## Two views of one list, told apart by the heading
 *
 * An operator either runs the estate or uses a box, and one table of every guest
 * put a Dokploy host beside the machine somebody was handed last week. The
 * console's answer is two questions rather than two tables: `Infrastructure` is
 * `purpose=infrastructure&purpose=service`, `Workloads` is `purpose=workload`,
 * and they are the same screen with a different `purpose` and a different name.
 *
 * **The filter is only ever what the URL says.** `/fleet/vms` with nothing on it
 * returns every VM in the estate and says `VMs`, because a console that quietly
 * narrowed a bare address would be answering a question nobody asked. The view
 * switch, the heading, the sidebar and the URL all name the same view, so there
 * is no way to be in one without it being visible.
 *
 * ## The CPU model is the floor, and migration is refused rather than offered
 *
 * Every VM runs `kvm64`, the lowest common denominator across the fleet (R63),
 * and the column says so: a VM cannot be more capable than the weakest machine
 * it might land on, and reporting its host's CPU here would be a fiction. R64
 * forbids live migration across mixed or heterogeneous CPUs, and the document
 * declares no `migrate` operation at all -- so no VM is offered one. The control
 * is rendered, greyed, and labelled with the sovren code that refuses it, and on
 * a VM below the floor the sentence beside the code names the reason.
 *
 * **The explanation of that floor is not on this page.** It used to be a sentence
 * above the table, and it was read zero times: a screen's name, its columns and
 * its rows already say what the screen is, and a fact about every VM in the
 * estate is a fact for a VM's own detail page, where somebody goes looking for
 * it.
 */

import { useState } from "react";
import { HardDrive, Plus, Search, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { VMPurpose, VMRunState, useVMList } from "@sovren/client";
import type { DisabledAction, Vm } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInheritedSearch } from "@/components/sovren/detail/tab-state";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { LinkButton } from "@/components/sovren/link-button";
import { ListPage } from "@/components/sovren/list-page";
import type { ListColumn } from "@/components/sovren/list-page";
import { StateBadge } from "@/components/sovren/state-badge";
import {
  disabledActionFor,
  disabledActionsOf,
  derivedDisabledAction,
} from "@/lib/disabled-actions";
import { formatBytes, formatNumber } from "@/lib/format";
import { useListState, single } from "@/lib/list-state";
import { stringifySovrenSearch } from "@/lib/search-params";
import { useVmsCreateHref, useVmsEditHref } from "./-vm-paths";

/** The search parameters this list owns. Everything else in the URL is left alone. */
const OWNED = ["q", "purpose", "runState", "size", "page", "sort"] as const;

/** The columns that can be sorted, so an unknown key in a URL is ignored. */
const SORTABLE = ["name", "node", "runState", "purpose", "cpu", "memory"] as const;

/** One list's identity for the page-token back stack. */
const pageHistoryKey = (scope: string): string => `vms:${scope}`;

type ListState = ReturnType<typeof useListState>;

/**
 * A URL value as one of the contract's own values, or nothing.
 *
 * Search parameters arrive as strings and the document's filters are closed
 * vocabularies, so `?purpose=servicey` has to become *no filter* rather than a
 * request no backend can answer. The generated enums are the vocabularies, so a
 * state the document adds is accepted the moment the client is regenerated.
 */
const oneOf = <T extends string>(
  vocabulary: Readonly<Record<string, T>>,
  value: string | undefined,
): T | undefined =>
  value === undefined ? undefined : Object.values(vocabulary).find((entry) => entry === value);

/**
 * The same, for a filter that may be repeated in the URL.
 *
 * `purpose=infrastructure&purpose=service` is one question with two answers, and
 * a filter that took only the last value would show an operator a list of Dokploy
 * hosts and call it the estate's own machines -- which is the confusion the split
 * exists to remove. A value outside the vocabulary is dropped rather than fatal,
 * so a stale bookmark narrows less than it used to and says nothing false.
 */
const manyOf = <T extends string>(
  vocabulary: Readonly<Record<string, T>>,
  value: string | string[] | undefined,
): T[] | undefined => {
  if (value === undefined) return undefined;
  const asked = (Array.isArray(value) ? value : [value]).filter((entry) => entry !== "");
  const accepted = asked.filter((entry) =>
    Object.values(vocabulary).some((candidate) => candidate === entry),
  );
  return accepted.length === 0 ? undefined : (accepted as T[]);
};

/**
 * A refusal to migrate, and where it came from.
 *
 * Three sources, in descending order of authority, and the same three the Nodes
 * list uses -- which is the point of putting it in this shape. A refusal the
 * control plane declared is the truth about the control plane, including on a VM
 * this screen's own rule would have got wrong. Below that, `canMigrate: false` is
 * a fact the row already carries and the code is the one the request would carry.
 * Below that, the contract declares no operation that migrates a VM at all, which
 * is the honest reason to grey the control out on one that could otherwise be
 * migrated.
 */
export const migrateRefusal = (vm: Vm): DisabledAction => {
  const declared = disabledActionFor(disabledActionsOf(vm.disabledActions), "migrate");
  if (declared !== undefined) return declared;
  if (!vm.canMigrate) {
    return derivedDisabledAction(
      "migrate",
      "action_not_permitted",
      "This VM's CPU model is below the fleet floor, so it cannot offer migration to anything else in the estate.",
    );
  }
  return derivedDisabledAction(
    "migrate",
    "action_not_permitted",
    "The contract declares no operation that migrates a VM.",
  );
};

/**
 * The run state, and whatever the state is carrying.
 *
 * The badge is the state. The second line is the fact that makes the state
 * actionable, and it is rendered for exactly two states -- the one with a Task in
 * flight and the one with a reason -- because those are the two an operator cannot
 * do anything about from the word alone.
 *
 * The null cases are rendered as themselves. A transitional VM whose Task link is
 * absent and a failed VM whose `failureReason` is null both say so, because
 * `transitionalTask` and `failureReason` are `| null` in the contract, and a
 * silently missing line in a table is a screen telling the operator that nothing
 * is in flight and nothing went wrong.
 *
 * Exported because the two null branches are the only thing here the estate does
 * not currently exercise: no VM it seeds is transitional-without-a-Task, or
 * failed-without-a-reason, and a screen that rendered both as an absent line would
 * pass every other test on this page.
 */
export function RunStateCell({ vm }: { vm: Vm }) {
  return (
    <span data-run-state={vm.runState} className="flex flex-col items-start leading-tight">
      <StateBadge value={vm.runState} />
      {vm.runState === "transitional" && <TransitionalLine vm={vm} />}
      {vm.runState === "failed" && <FailedLine vm={vm} />}
    </span>
  );
}

/** The create Task in flight, by the work's own name. */
function TransitionalLine({ vm }: { vm: Vm }) {
  if (vm.transitionalTask === null) {
    return (
      <span
        data-task="absent"
        className="truncate text-[10px] text-muted-foreground"
        title="The contract reports this VM as transitional but names no Task for it."
      >
        in flight, no Task named
      </span>
    );
  }
  return (
    <span
      data-task={vm.transitionalTask.id}
      className="truncate font-mono text-[10px] text-sky-700 dark:text-sky-300"
      title={`${vm.transitionalTask.kind} · ${vm.transitionalTask.state}`}
    >
      {vm.transitionalTask.id}
    </span>
  );
}

/**
 * Why this VM failed, in the words the control plane gave.
 *
 * A sentence, in the sentence's own face, and truncated because a table row is one
 * line tall -- with the whole of it on the `title`, so clipping the reason is not
 * the same as hiding it. The reason is the part an operator acts on, so it is the
 * one thing on this row that is worth a hover.
 */
function FailedLine({ vm }: { vm: Vm }) {
  if (vm.failureReason === null) {
    return (
      <span
        data-failure="absent"
        className="truncate text-[10px] text-destructive"
        title="The control plane reported this VM as failed without saying why."
      >
        no reason reported
      </span>
    );
  }
  return (
    <span data-failure="reported" className="truncate text-[10px] text-destructive">
      <span title={vm.failureReason}>{vm.failureReason}</span>
    </span>
  );
}

/**
 * The overlay address, or the fact that there isn't one yet.
 *
 * `overlay` is null for a guest that has not enrolled -- a VM still being built,
 * a template that has never been started, a create that was cancelled -- and that
 * is a real state. It renders in its own tone with the word "not enrolled",
 * exactly as the Nodes list renders an unenrolled machine, so one word means one
 * thing across the console. An empty cell would be the failure here: a
 * nine-column table is read as healthy until something in it says otherwise.
 */
function OverlayCell({ vm }: { vm: Vm }) {
  if (vm.overlay === null) {
    return (
      <span data-overlay="null" className="text-[11px] text-amber-700 dark:text-amber-300">
        not enrolled
      </span>
    );
  }
  return (
    <span data-overlay="enrolled" className="flex flex-col leading-tight">
      <span className="font-mono text-[11px]">{vm.overlay.address}</span>
      <span className="truncate text-[11px] text-muted-foreground">{vm.overlay.hostname}</span>
    </span>
  );
}

/**
 * What the VM is for, in the contract's own three words.
 *
 * Not a `StateBadge`: that table exists to say whether something is *working*,
 * and `infrastructure`, `service` and `workload` are not answers to that. It is
 * the cell that lets an operator tell a Service host from a machine somebody is
 * experimenting on, which is the difference between a row that matters and a row
 * that is somebody's afternoon.
 */
function PurposeCell({ vm }: { vm: Vm }) {
  return (
    <span data-purpose={vm.purpose} className="font-mono text-[11px]">
      {vm.purpose}
    </span>
  );
}

/** The column set. `withSite` is the only difference between the two scopes. */
export const vmColumns = (withSite: boolean): readonly ListColumn<Vm>[] => {
  const columns: ListColumn<Vm>[] = [
    {
      key: "name",
      header: "VM",
      width: 210,
      identity: true,
      sortable: true,
      sortValue: (vm) => vm.name,
      render: (vm) => vm.name,
    },
    {
      key: "node",
      header: "Node",
      width: 180,
      sortable: true,
      // The join the document already made. Nothing here correlates two lists.
      sortValue: (vm) => vm.node.name,
      render: (vm) => <span className="font-mono text-[11px]">{vm.node.name}</span>,
    },
    {
      key: "runState",
      header: "State",
      width: 300,
      sortable: true,
      sortValue: (vm) => vm.runState,
      render: (vm) => <RunStateCell vm={vm} />,
    },
    {
      key: "purpose",
      header: "Purpose",
      width: 110,
      sortable: true,
      sortValue: (vm) => vm.purpose,
      render: (vm) => <PurposeCell vm={vm} />,
    },
    {
      key: "cpu",
      header: "CPU model",
      width: 175,
      sortable: true,
      sortValue: (vm) => vm.cpuModel,
      render: (vm) => (
        <span className="flex flex-col items-start leading-tight">
          <span className="font-mono text-[11px]">{vm.cpuModel}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatNumber(vm.cores)} {vm.cores === 1 ? "core" : "cores"}
          </span>
        </span>
      ),
    },
    {
      key: "memory",
      header: "Memory",
      width: 100,
      numeric: true,
      sortable: true,
      sortValue: (vm) => vm.memoryBytes,
      render: (vm) => formatBytes(vm.memoryBytes),
    },
    {
      key: "overlay",
      header: "Overlay",
      width: 195,
      render: (vm) => <OverlayCell vm={vm} />,
    },
  ];

  if (withSite) {
    columns.push({
      key: "site",
      header: "Site",
      width: 150,
      sortable: true,
      sortValue: (vm) => vm.site.name,
      render: (vm) => vm.site.name,
    });
  }

  return columns;
};

/**
 * One row's edit link.
 *
 * A component rather than a `LinkButton` built inside `rowActions`, and the
 * distinction is a bug this file shipped once: `rowActions` is *invoked* during
 * `DataTable`'s render, so a hook called in there is `DataTable`'s hook, and a
 * table whose row count changes renders a different number of them -- which React
 * reports as "rendered fewer hooks than expected" and which takes the whole screen
 * down the first time a filter narrows the list. The link carries the list's own
 * search, so the panel opens over this view and closing it returns here.
 */
function EditVmLink({ vm }: { vm: Vm }) {
  const href = useVmsEditHref(vm.name);
  return (
    <LinkButton
      to={href as never}
      variant="outline"
      size="xs"
      className="mr-1.5"
      data-vm-action="edit"
    >
      Edit
    </LinkButton>
  );
}

export interface VmsListProps {
  /** Set by a Site scope. Absent in Fleet, which is every Site at once. */
  site?: string;
  /**
   * What this list is a list of, in the operator's terms.
   *
   * Accepted and deliberately not rendered. It was the tail of a sentence above
   * the table, and the sentence explained the CPU floor -- which is a fact about
   * the estate, not about this page, and belongs on a VM's own detail screen.
   */
  scopeLabel: string;
}

/**
 * Which of the two questions about guests is on screen.
 *
 * An operator either **runs the estate** or **uses a box**, and one table put a
 * Dokploy host beside the machine somebody was handed last week. The two are the
 * same operation with a different `purpose`, so they are the same screen -- but
 * the *heading* is not shared, because a heading that said `VMs` on both would
 * leave the two views distinguished only by which filter happened to be pressed,
 * which is a refinement and not a question.
 *
 * Three values rather than two, and the third is the honest one: a `purpose` that
 * is `workload` *and* something else is neither question, so the heading goes
 * back to `VMs` and the list says so rather than claiming to be one of the two
 * things it is a mixture of.
 */
type VmView = "all" | "infrastructure" | "workload";

const viewFor = (purpose: readonly VMPurpose[] | undefined): VmView => {
  if (purpose === undefined || purpose.length === 0) return "all";
  const only = purpose.length === 1 ? purpose[0] : undefined;
  if (only === "workload") return "workload";
  if (purpose.includes("workload")) return "all";
  return "infrastructure";
};

const VIEW_TITLE: Record<VmView, string> = {
  all: "VMs",
  infrastructure: "Infrastructure",
  workload: "Workloads",
};

/**
 * What the switch calls each view.
 *
 * `All VMs` rather than `VMs`, because the switch is a set of three *choices* and
 * a choice that reads the same as the page's own heading is one an operator has
 * to work out. The heading says what the page is; the switch says what picking it
 * would do.
 */
const VIEW_LABEL: Record<VmView, string> = {
  all: "All VMs",
  infrastructure: "Infrastructure",
  workload: "Workloads",
};

/** The purposes each view asks the control plane for. `null` is every VM. */
const VIEW_PURPOSE: Record<VmView, readonly VMPurpose[] | null> = {
  all: null,
  infrastructure: ["infrastructure", "service"],
  workload: ["workload"],
};

/**
 * The VMs list.
 *
 * `useVMList` is called with exactly the parameters the document declares for
 * `VMList` -- `q`, `purpose`, `runState`, `site`, `size` and the opaque `page`
 * token, and nothing else, because the document declares nothing else. Its result
 * reaches the archetype untouched.
 *
 * The create action and the row's edit link are the two places this screen hands
 * over to the form archetype, and both are *links* carrying the list's own search
 * (R50): the panel opens over this list without unmounting it, and closing it
 * returns the operator to the filters, the sort and the page they were reading.
 */
export function VmsList({ site }: VmsListProps) {
  const list = useListState({
    key: pageHistoryKey(site ?? "fleet"),
    owned: OWNED,
    sortable: SORTABLE,
  });
  /**
   * The Fleet create route, carrying this list's own search.
   *
   * One href for both scopes, deliberately: a create is an estate-wide act rather
   * than a per-lab one, so a Site's list sends the operator to the Fleet form and
   * the panel's way back returns them to the Site's own view, filters intact. If a
   * Site ever gets a create route of its own, this is the line that changes.
   */
  const fleetCreateHref = useVmsCreateHref();

  // Read once, narrowed once. The request, the filter rail and the empty state
  // then decide from the same three values, so they cannot disagree about what is
  // being filtered.
  const q = single(list.search, "q");
  const purpose = manyOf(VMPurpose, list.search["purpose"] as string | string[] | undefined);
  const runState = oneOf(VMRunState, single(list.search, "runState"));

  const query = useVMList({
    ...(q === undefined ? {} : { q }),
    ...(purpose === undefined ? {} : { purpose }),
    ...(runState === undefined ? {} : { runState }),
    ...(site === undefined ? {} : { site }),
    size: list.size,
    ...(list.token === null ? {} : { page: list.token }),
  });

  const filtering = q !== undefined || purpose !== undefined || runState !== undefined;
  const view = viewFor(purpose);

  /**
   * The console's own parameters, for the view switch to carry.
   *
   * `?estate=` and `?sentinel=` are in nobody's `OWNED` list, and a view switch
   * that dropped them would move an operator off the estate they were reading --
   * and off the sentinel they had chosen to reproduce a failure with. `purpose`
   * is a filter rather than a parameter, and the switch is what sets it.
   */
  const inherited = useInheritedSearch();

  /**
   * The same search with the list's own values on top, repeated keys and all.
   *
   * `useInheritedSearch` reads a flat search, so a `purpose` the operator asked
   * for twice arrives as a list rather than a string and does not survive. That is
   * right for the view switch -- which is setting `purpose` -- and wrong for a
   * row link, because a row that dropped the repeated `purpose` would open a VM's
   * detail page whose breadcrumb returns to an unfiltered list rather than to the
   * view the row was read in.
   */
  const rowSearch: Record<string, string | readonly string[]> = { ...inherited, ...list.search };

  return (
    <ListPage<Vm>
      title={VIEW_TITLE[view]}
      icon={HardDrive}
      query={query}
      list={list}
      columns={vmColumns(site === undefined)}
      rowKey={(vm) => vm.id}
      // A row opens its VM's detail page, and the ref in the URL is the VM's own
      // name: the contract accepts a name or an id in every path parameter (R32),
      // so this is the ref an operator would have typed and the one a shared link
      // can carry. The list's own search rides along, which is the other half of
      // the return trip -- a row that dropped the query string would arrive at a
      // detail page with no memory of the view it was opened from, and its
      // breadcrumb would send the operator back to page one of an unfiltered
      // list. `inherited` rather than the list's own keys, so `?estate=` and
      // `?sentinel=` survive too and a failure stays reproducible by link (R56).
      rowHref={(vm) =>
        `/fleet/vms/${encodeURIComponent(vm.name)}${stringifySovrenSearch(rowSearch)}`
      }
      filters={
        <>
          <PurposeViewSwitch
            base={site === undefined ? "/fleet/vms" : `/site/${site}/vms`}
            current={view}
            inherited={inherited}
          />
          <VmSearch list={list} filtering={filtering} />
          <PurposeFilter list={list} selected={purpose} />
          <RunStateFilter list={list} selected={runState} />
        </>
      }
      // Wide enough for the edit link, the control and the code that refuses it.
      actionsWidth={300}
      rowActions={(vm) => (
        <>
          <EditVmLink vm={vm} />
          <DisabledActionButton action="migrate" refusal={migrateRefusal(vm)} />
        </>
      )}
      create={
        <LinkButton
          to={fleetCreateHref as never}
          variant="default"
          size="sm"
          data-vm-action="create"
        >
          <Plus aria-hidden />
          Create VM
        </LinkButton>
      }
      empty={{
        title: vmEmptyTitle({ q, purpose, runState }),
        body: vmEmptyBody({ q, purpose, runState }),
        action: filtering ? <ClearVmFilters list={list} /> : undefined,
      }}
    />
  );
}

/** The three filters this list owns, already read out of the URL. */
interface VmFilters {
  readonly q: string | undefined;
  readonly purpose: readonly VMPurpose[] | undefined;
  readonly runState: VMRunState | undefined;
}

/**
 * Moving between the two questions, from the page.
 *
 * The sidebar has the same two entries, and a page that could only be left for
 * the other one by walking back to the sidebar is a page with two names. So the
 * three views are here as links, in the header, before the filter rail -- and
 * they are links because each one is a *view*, which is a thing an operator can
 * be sent to by a colleague, bookmarked, and come back to with the browser's back
 * button.
 *
 * **It is not a filter, and it is drawn not like one.** The purpose rail further
 * along refines the list within a view: it can ask for `service` alone, or for
 * `workload` and `service` together, which is neither view. This switch asks the
 * other question -- *which kind of machine am I looking at* -- and it answers with
 * the heading, the URL and the sidebar at once. The two controls write the same
 * parameter and mean different things by it, which is why they are separate
 * controls and why only this one is a `nav`.
 *
 * `All VMs` is on the switch rather than being the absence of a view, because a
 * bare `/fleet/vms` has to be able to say it is showing every VM rather than
 * looking like a filter rail that happened to be unpressed.
 */
function PurposeViewSwitch({
  base,
  current,
  inherited,
}: {
  base: string;
  current: VmView;
  inherited: Record<string, string>;
}) {
  return (
    <nav
      aria-label="VM view"
      data-view-switch="true"
      className="flex items-center gap-0.5 border-r border-border pr-2"
    >
      {(Object.keys(VIEW_LABEL) as VmView[]).map((view) => {
        // The page token belongs to the list the operator was reading, not to the
        // one they are moving to, so it is dropped; everything else rides along.
        const { page: _page, ...kept } = inherited;
        const purposes = VIEW_PURPOSE[view];
        const href = `${base}${stringifySovrenSearch({
          ...kept,
          ...(purposes === null ? {} : { purpose: purposes }),
        })}`;
        const active = view === current;
        return (
          <Link
            key={view}
            to={href as never}
            data-view={view}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-sm px-2 py-1 text-xs",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {VIEW_LABEL[view]}
          </Link>
        );
      })}
    </nav>
  );
}

const vmEmptyTitle = ({ q, purpose, runState }: VmFilters): string => {
  if (runState !== undefined) return `No VM is ${runState}`;
  if (purpose !== undefined) return `No VM is ${purpose.map((p) => `“${p}”`).join(" or ")}`;
  if (q !== undefined) return `No VM matches “${q}”`;
  return "No VM in this estate";
};

const vmEmptyBody = ({ q, purpose, runState }: VmFilters): string => {
  if (runState !== undefined) {
    return "The estate holds VMs in every state it uses. An empty answer means none of them is in that state right now.";
  }
  if (purpose !== undefined) {
    return "A purpose is what a VM is for: infrastructure backs sovren itself, service hosts a Service, and workload is handed to an operator. The control plane matches it exactly.";
  }
  if (q !== undefined) {
    return "The filter is a substring match on the name, applied by the control plane.";
  }
  return "Nothing has been created in this estate. A VM arrives from a create Task, and shows as transitional until that Task reaches a state nobody has to guess at.";
};

/** The name filter. Submits, rather than navigating on every keystroke. */
function VmSearch({ list, filtering }: { list: ListState; filtering: boolean }) {
  const [value, setValue] = useState(single(list.search, "q") ?? "");

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        list.setParams({ q: value.trim() === "" ? null : value.trim() });
      }}
    >
      <label className="sr-only" htmlFor="vm-search">
        Filter VMs by name
      </label>
      <Input
        id="vm-search"
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
          aria-label="Clear every VM filter"
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
 * The purpose filter, as the document's own three values.
 *
 * The choices come from the generated `VMPurpose` rather than from a list written
 * out here, so a purpose the document adds is a filter the moment the client is
 * regenerated. Each button is a URL state, not a client-side predicate, which is
 * what keeps the estate's own count behind the filter honest.
 */
function PurposeFilter({
  list,
  selected,
}: {
  list: ListState;
  selected: readonly VMPurpose[] | undefined;
}) {
  // Multi-select, because `purpose=infrastructure&purpose=service` is one question
  // with two answers: the machines that are sovren's own. A single-valued toggle
  // could not ask for that, and the Fleet sidebar's Infrastructure entry does.
  const chosen = selected ?? [];
  return (
    <div role="group" aria-label="Filter VMs by purpose" className="flex items-center gap-1">
      {Object.values(VMPurpose).map((purpose) => {
        const active = chosen.includes(purpose);
        return (
          <Button
            key={purpose}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={active}
            onClick={() => {
              const next = active ? chosen.filter((v) => v !== purpose) : [...chosen, purpose];
              list.setParams({ purpose: next.length === 0 ? null : next });
            }}
          >
            {purpose}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The run-state filter, as the document's own six values.
 *
 * Including `transitional` and `failed` is the point: those are the states an
 * operator most often wants to look at, and a filter that could only ask for
 * "running" would not be able to ask for either.
 */
function RunStateFilter({ list, selected }: { list: ListState; selected: VMRunState | undefined }) {
  return (
    <ValueFilter
      label="Filter VMs by run state"
      values={Object.values(VMRunState)}
      selected={selected}
      onSelect={(runState) => {
        list.setParams({ runState });
      }}
    />
  );
}

/**
 * One closed vocabulary, as toggles that live in the URL.
 *
 * `aria-pressed` rather than a `Select`: these are three and six values from a
 * generated enum, and a control an operator can read the whole of at once is
 * faster than one they have to open. Pressing the pressed value clears it, so the
 * way back to "no filter" is the control they just used.
 */
function ValueFilter<T extends string>({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly T[];
  selected: T | undefined;
  onSelect: (value: T | null) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {values.map((value) => {
        const active = selected === value;
        return (
          <Button
            key={value}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={active}
            onClick={() => {
              onSelect(active ? null : value);
            }}
          >
            {value}
          </Button>
        );
      })}
    </div>
  );
}

function ClearVmFilters({ list }: { list: ListState }) {
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
