/**
 * Fleet → Tasks: every run, and the state it reached.
 *
 * The list an operator scans when something is not working. R46's table, four
 * columns the question actually asks -- what kind of work, on what, in what
 * state, since when -- and the archetype doing everything else. R48 is why the
 * list exists at all: the control plane holds the state, so a run from last week
 * is still here to be found.
 *
 * ## Why the target is text and not a link
 *
 * `Task.target` is *recorded on the Task*, copied at creation, and the contract
 * says so in three places: "The target may since have been removed, and the Task
 * stays findable with the name it had." A run from last week whose VM has since
 * been deleted is one of the runs an operator most needs to find, and a column
 * that renders a dead link -- or, worse, a join that resolves the target at read
 * time and loses the row -- is how that run disappears. So the cell shows the
 * name the Task carries and the kind of resource it was, and the row's only link
 * is the row's own identity: the Task, which never goes anywhere.
 *
 * ## Why the reason is a column and not a tooltip
 *
 * "A failed Task shows its failure reason in the row" is an acceptance criterion,
 * and a tooltip is not in the row. So the reason is a column, and it is rendered
 * for the two states that carry one: `failed` shows `failureReason`, `cancelled`
 * shows `cancelledReason`. They mean different things to an operator -- a fault
 * wants attention, a cancellation is somebody's decision -- and a table that
 * rendered both as an empty cell would have thrown away the only difference
 * between them.
 *
 * **A `queued` Task has no start time, and that is a state rather than a gap.**
 * `startedAt` is null while a Task is queued, and "—" in a column of timestamps
 * reads as missing data; `not started` reads as what it is, which is a Task no
 * provisioner has claimed.
 */

import { useTaskList } from "@sovren/client";
import type { Task, TaskKind, TaskState } from "@sovren/client";
import { ListChecks, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListPage } from "@/components/sovren/list-page";
import type { ListColumn } from "@/components/sovren/list-page";
import { StateBadge } from "@/components/sovren/state-badge";
import { formatTimestamp } from "@/lib/format";
import { useListState, single } from "@/lib/list-state";
import { TaskCancel } from "./-task-cancel";

/** The search parameters this list owns. Everything else in the URL is left alone. */
const OWNED = ["state", "kind", "size", "page", "sort"] as const;

/** The columns that can be sorted, so an unknown key in a URL is ignored. */
const SORTABLE = ["name", "kind", "target", "state", "started"] as const;

/** One list's identity for the page-token back stack. */
const PAGE_HISTORY_KEY = "fleet/tasks";

/**
 * The fixed task vocabulary, from the contract's own enum.
 *
 * Written as the list the filter offers rather than derived from a string: the
 * vocabulary is closed, and a filter offering "stuck" would be offering a state
 * the control plane cannot hold -- R32's point about there being no state that
 * quietly persists.
 */
const TASK_STATES: readonly TaskState[] = ["queued", "running", "succeeded", "failed", "cancelled"];

const TASK_KINDS: readonly TaskKind[] = [
  "vm_create",
  "vm_snapshot",
  "vm_restore",
  "terraform_apply",
  "ansible_run",
  "connection_test",
];

/** Any value of a fixed vocabulary, or null. A URL can hold anything. */
const inVocabulary = <T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | null =>
  raw === undefined ? null : (allowed as readonly string[]).includes(raw) ? (raw as T) : null;

/** The states whose Task carries a reason, and which reason it is. */
const reasonFor = (task: Task): string | null => {
  if (task.state === "failed") return task.failureReason;
  if (task.state === "cancelled") return task.cancelledReason ?? null;
  return null;
};

/** What a target was, in the console's own words for the resource kinds. */
const RESOURCE_NOUN: Record<string, string> = {
  vm: "VM",
  node: "Node",
  site: "Site",
  connection: "Connection",
  peer: "Peer",
};

/**
 * The target, as the Task recorded it.
 *
 * Two lines because "grafana-canary" and "accra-lab" are both names and mean
 * entirely different things to an operator scanning a column: one is a guest, the
 * other a lab. A run against a Site is an Ansible apply over a room of machines,
 * and reading it as a single resource is how an operator misreads a fleet-wide
 * change as one machine's.
 */
function TargetCell({ task }: { task: Task }) {
  return (
    <span data-target={task.target.resource} className="flex flex-col leading-tight">
      <span className="truncate font-mono text-[11px]">{task.target.name}</span>
      <span className="truncate text-[10px] text-muted-foreground">
        {RESOURCE_NOUN[task.target.resource] ?? task.target.resource}
      </span>
    </span>
  );
}

/** The column set. Four columns of question, and the reason. */
export const taskColumns = (): readonly ListColumn<Task>[] => [
  {
    key: "name",
    header: "Task",
    width: 250,
    identity: true,
    sortable: true,
    sortValue: (task) => task.name,
    render: (task) => task.name,
  },
  {
    key: "kind",
    header: "Kind",
    width: 140,
    sortable: true,
    sortValue: (task) => task.kind,
    render: (task) => <span className="font-mono text-[11px]">{task.kind}</span>,
  },
  {
    key: "target",
    header: "Target",
    width: 190,
    sortable: true,
    sortValue: (task) => task.target.name,
    render: (task) => <TargetCell task={task} />,
  },
  {
    key: "state",
    header: "State",
    width: 110,
    sortable: true,
    sortValue: (task) => task.state,
    render: (task) => <StateBadge value={task.state} />,
  },
  {
    key: "started",
    header: "Started",
    width: 170,
    sortable: true,
    // A queued Task has no start, and it sorts before everything that has one:
    // the work an operator is waiting on is the work that has not started.
    sortValue: (task) => task.startedAt ?? "",
    render: (task) =>
      task.startedAt === null ? (
        <span data-started="never" className="text-[11px] text-muted-foreground">
          not started
        </span>
      ) : (
        <span className="font-mono text-[11px]">{formatTimestamp(task.startedAt)}</span>
      ),
  },
  {
    key: "reason",
    header: "Reason",
    // The widest column on the screen, and deliberately so: a truncated failure
    // reason is the thing an operator most needs to read, and the console has
    // nowhere else to put it. The full sentence stays in the cell either way, in
    // the `title` and in the text itself.
    width: 460,
    render: (task) => {
      const reason = reasonFor(task);
      if (reason === null) return null;
      return (
        <span data-reason={task.state} title={reason} className="block truncate text-[11px]">
          {reason}
        </span>
      );
    },
  },
];

export function TasksList() {
  const list = useListState({ key: PAGE_HISTORY_KEY, owned: OWNED, sortable: SORTABLE });

  /**
   * The filters, narrowed to the vocabularies the contract declares.
   *
   * A search parameter is a string the URL happened to contain, and
   * `state=stuck` is a string. Sending it to an operation that declares an enum
   * would be sending something the contract does not allow, so a value outside
   * the vocabulary narrows nothing -- and the control showing "all states" is
   * then the truth about what is being shown rather than a lie about the filter.
   */
  const state = inVocabulary(single(list.search, "state"), TASK_STATES);
  const kind = inVocabulary(single(list.search, "kind"), TASK_KINDS);

  const query = useTaskList({
    ...(state === null ? {} : { state }),
    ...(kind === null ? {} : { kind }),
    size: list.size,
    ...(list.token === null ? {} : { page: list.token }),
  });

  const filtering = state !== null || kind !== null;

  return (
    <ListPage<Task>
      title="Tasks"
      icon={ListChecks}
      query={query}
      list={list}
      columns={taskColumns()}
      // The id, not the name. A Task is never renamed, so its id is the only key
      // it answers to -- and `TaskLink` on a VM carries an id for the same reason.
      rowKey={(task) => task.id}
      rowHref={(task) => `/fleet/tasks/${task.id}`}
      filters={<TaskFilters list={list} state={state} kind={kind} />}
      rowActions={(task) => <TaskCancel task={task} />}
      create={
        <span className="font-mono text-[11px] text-muted-foreground">
          a run is started by an action — a create, an apply, a playbook
        </span>
      }
      empty={{
        title: filtering ? "No Task matches this filter" : "No Task has been run in this estate",
        body: filtering
          ? "The control plane narrows the list by state and by kind, and it holds the filter in the URL rather than in a store."
          : "A Task is the unit of asynchronous work: every VM create, every apply and every playbook run leaves one here.",
        action: filtering ? <ClearFilters list={list} /> : undefined,
      }}
    />
  );
}

/**
 * The two filters, as the contract's own vocabularies.
 *
 * Native selects rather than a popover: the list of options is five items drawn
 * from a fixed enum, and a control that needs a dialog to say "failed" is a
 * control with a keyboard trap in it. Each is a labelled form control writing
 * straight into the URL, so the view is a link the moment one is chosen.
 */
function TaskFilters({
  list,
  state,
  kind,
}: {
  list: ReturnType<typeof useListState>;
  state: TaskState | null;
  kind: TaskKind | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor="task-state-filter">
        Filter Tasks by state
      </label>
      <select
        id="task-state-filter"
        value={state ?? ""}
        onChange={(event) => {
          list.setParams({ state: event.target.value === "" ? null : event.target.value });
        }}
        className="h-7 rounded-none border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <option value="">All states</option>
        {TASK_STATES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="task-kind-filter">
        Filter Tasks by kind
      </label>
      <select
        id="task-kind-filter"
        value={kind ?? ""}
        onChange={(event) => {
          list.setParams({ kind: event.target.value === "" ? null : event.target.value });
        }}
        className="h-7 rounded-none border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <option value="">All kinds</option>
        {TASK_KINDS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      {(state !== null || kind !== null) && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear the Task filters"
          onClick={() => {
            list.setParams({ state: null, kind: null });
          }}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}

function ClearFilters({ list }: { list: ReturnType<typeof useListState> }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        list.setParams({ state: null, kind: null });
      }}
    >
      <X aria-hidden />
      Clear the filters
    </Button>
  );
}
