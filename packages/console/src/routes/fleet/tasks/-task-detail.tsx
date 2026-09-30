/**
 * Fleet → Tasks → one Task: the work, watched while it happens.
 *
 * R62, and the requirement behind it is the one none of the three upstreams can
 * meet: a VM boot takes four minutes, nothing in the control plane's contract can
 * hold a request open for four minutes, and all three upstreams answer "how is
 * it going" by making the operator ask again. So the Task's log is *pushed* to
 * this page, and the page is the only place in the console where anything
 * arrives without being asked for.
 *
 * ## The rule this page is built around
 *
 * **The console never claims an outcome it has not observed** (R44, R35). There
 * are exactly two observations of an outcome on this screen, and both are things
 * that crossed the wire:
 *
 *   - a `result` event on the log stream, carrying the state it finished in; or
 *   - the `terminalState` on the `Task` the control plane returned.
 *
 * Nothing else may produce one. Not a timer, not "the log looks finished", not
 * the number of lines held, not the age of the Task. A screen that inferred
 * `succeeded` from a quiet stream would tell an operator that a four-minute boot
 * worked about ninety seconds in, and there is no way to take that back.
 *
 * **So the outcome strip is rendered from those two and from nothing else**, and
 * it says which of the two it used. A running Task shows no outcome strip at all
 * -- not an empty one, not a greyed one, none -- because an empty strip is a
 * claim that the work finished and the console had nothing to report.
 *
 * ## A cancelled Task is not a failed one
 *
 * They are different answers to different questions, and both the badge and the
 * reason column say which is which. A failure is a fault and wants a human; a
 * cancellation is a decision, and its reason is a person rather than a fault.
 * Rendering them identically is how an operator learns to ignore one of them.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { ChevronRight, ListChecks, RefreshCw, Terminal } from "lucide-react";
import { useTaskView } from "@sovren/client";
import type { Task, TaskLogEvent } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton } from "@/components/sovren/empty-state";
import { ErrorState } from "@/components/sovren/error-state";
import { IdentityBlock, PropertiesTable } from "@/components/sovren/properties-table";
import { StateBadge } from "@/components/sovren/state-badge";
import { formatTimestamp } from "@/lib/format";
import { readOne } from "@/lib/sovren";
import { TaskCancel } from "./-task-cancel";
import { useTaskLogStream, type LogEntry, type StreamStatus } from "./-task-log-stream";

/** The two sections, and the parameter that says which one is on screen. */
const TAB_PARAM = "tab";
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "log", label: "Log" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const readTab = (raw: unknown): TabId => (raw === "log" || raw === "overview" ? raw : "overview");

/** The resource kinds a target can be, in the console's own nouns. */
const RESOURCE_NOUN: Record<string, string> = {
  vm: "VM",
  node: "Node",
  site: "Site",
  connection: "Connection",
  peer: "Peer",
};

const LEVEL_CLASS: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "",
  warn: "text-amber-700 dark:text-amber-300",
  error: "text-destructive",
};

export interface TaskDetailProps {
  /**
   * The ref from the path.
   *
   * Passed to the generated hook untouched. A `Task` is the one deliberate
   * exception to name-or-id: it is never renamed, so `Task.name` is a label like
   * "create web-01" rather than a key, and the contract accepts an id or the
   * `id:target` form an operator would remember instead.
   */
  task: string;
}

export function TaskDetail({ task: ref }: TaskDetailProps) {
  const query = useTaskView(ref);
  const read = readOne<Task>(query.data);

  if (read.kind === "pending") return <ListSkeleton rows={6} columns={2} />;

  if (read.kind === "error") {
    return (
      <ErrorState
        error={read.error}
        onRetry={() => {
          void query.refetch();
        }}
        busy={query.isFetching}
        actions={
          <Link to="/fleet/tasks" className="text-xs underline underline-offset-4">
            Back to the tasks
          </Link>
        }
      />
    );
  }

  if (read.kind !== "value") return null;

  return <TaskDetailBody ref={ref} task={read.value} query={query} />;
}

/**
 * Everything below the query, so the stream's hooks run in one place.
 *
 * A detail body that took the resolved `Task` is what lets the stream's hooks be
 * called unconditionally: a component that returned early on `pending` and then
 * called a hook once the data arrived would change its own hook count between
 * renders, which is the one thing React cannot recover from.
 */
function TaskDetailBody({
  ref,
  task: fetched,
  query,
}: {
  ref: string;
  task: Task;
  query: { refetch: () => void; isFetching: boolean; dataUpdatedAt: number };
}) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const tab = readTab(search[TAB_PARAM]);

  /**
   * The newest observation of this Task, and when it arrived.
   *
   * A cancel returns the Task it was asked to cancel, and that body is newer than
   * anything this page has fetched -- so it is held here, and preferred, but only
   * until a *later* read disagrees with it. "Newest observation wins" is the rule
   * everywhere else on this screen, and a special case that outlived a fresh read
   * would be a control that cannot be argued with. A control plane does not
   * un-cancel a Task, so in practice the two never conflict; if they ever did, the
   * control plane's own latest answer is the one an operator needs to see.
   */
  const [observed, setObserved] = useState<{ readonly task: Task; readonly at: number } | null>(
    null,
  );
  const task = observed !== null && observed.at > query.dataUpdatedAt ? observed.task : fetched;

  const stream = useTaskLogStream({
    ref,
    logCount: task.logCount,
    lastSeq: task.lastSeq ?? null,
  });

  return (
    <section aria-label={task.name} className="flex min-w-0 flex-col gap-3">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Link to="/fleet/tasks" className="hover:underline">
          Tasks
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="font-mono text-foreground">{task.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center border border-border bg-muted">
              <ListChecks className="size-4" aria-hidden />
            </span>
            <h1 className="font-heading text-base leading-tight font-medium">{task.name}</h1>
            <StateBadge value={task.state} />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{task.kind}</span> on{" "}
            <span className="font-mono">{task.target.name}</span> (
            {RESOURCE_NOUN[task.target.resource] ?? task.target.resource})
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <TaskCancel
            task={task}
            onAccepted={(accepted) => {
              // Stop the stream and keep every line already held: the work is no
              // longer in flight, so nothing more will arrive, and the lines the
              // operator was watching are the record of what it did.
              stream.stop();
              setObserved({ task: accepted, at: Date.now() });
            }}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} aria-hidden />
            Refresh
          </Button>
        </div>
      </header>

      <IdentityBlock
        id={task.id}
        created={formatTimestamp(task.created)}
        updated={formatTimestamp(task.updated)}
      />

      <Outcome task={task} result={stream.result} />

      {/*
       * R41: the section on screen is a URL parameter, not local state, so "the
       * log of the Task that is stuck" is a link rather than a place an operator
       * has to remember how to get back to.
       */}
      <nav aria-label="Task sections" className="flex items-center gap-1 border-b border-border">
        {TABS.map((entry) => (
          <Link
            key={entry.id}
            to="."
            // An updater, not an object: a plain object *replaces* the whole search
            // object, which would drop `estate` and `sentinel` -- the only two
            // handles on reproducing a failure in the dev server (R56). The same
            // reason the list reads its search loosely.
            search={(previous: Record<string, unknown>) => ({
              ...previous,
              [TAB_PARAM]: entry.id,
            })}
            aria-current={tab === entry.id ? "page" : undefined}
            className={
              tab === entry.id
                ? "-mb-px border-b-2 border-foreground px-2.5 py-1.5 text-xs font-medium"
                : "px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview task={task} /> : <TaskLog task={task} stream={stream} />}
    </section>
  );
}

/**
 * The outcome, or the absence of one.
 *
 * Rendered from a `result` event if one has arrived, otherwise from the `Task`'s
 * own `terminalState`. Nothing else may render here, and when neither has been
 * observed the strip is not rendered at all -- see the file header for why an
 * empty strip would be the worse choice.
 */
function Outcome({ task, result }: { task: Task; result: TaskLogEvent | null }) {
  const observedState = result?.state ?? task.terminalState;
  if (observedState === null || observedState === undefined) return null;

  const reason =
    observedState === "failed"
      ? (result?.error?.message ?? task.failureReason)
      : observedState === "cancelled"
        ? task.cancelledReason
        : (result?.message ?? null);

  return (
    <div
      data-outcome={observedState}
      className="flex flex-col gap-1 border border-border bg-muted/40 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge value={observedState} />
        <span className="text-xs font-medium">
          {observedState === "failed"
            ? "This Task failed"
            : observedState === "cancelled"
              ? "This Task was cancelled"
              : "This Task succeeded"}
        </span>
      </div>
      {reason !== null && reason !== undefined && (
        <p data-outcome-reason="true" className="text-xs">
          {reason}
        </p>
      )}
      {result?.error !== null && result?.error !== undefined && (
        <p className="flex items-center gap-1.5">
          <StateBadge value={result.error.code} label={result.error.code} />
          <code className="font-mono text-[11px] text-muted-foreground">
            {result.error.requestId}
          </code>
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {result === null
          ? "observed: the terminal state on the Task, reported by the control plane."
          : "observed: the result event on the log stream."}
      </p>
    </div>
  );
}

/** The properties a Task is, as a table. The identity block above is the header. */
function Overview({ task }: { task: Task }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-heading text-xs font-medium">The run</h2>
      <PropertiesTable
        label="Task properties"
        items={[
          { label: "Kind", value: task.kind, mono: true },
          {
            label: "Target",
            value: (
              <span className="flex flex-col">
                <span className="font-mono text-[11px]">{task.target.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {RESOURCE_NOUN[task.target.resource] ?? task.target.resource} · {task.target.id}
                </span>
              </span>
            ),
          },
          { label: "State", value: <StateBadge value={task.state} /> },
          {
            label: "Terminal state",
            // A `—` here is a real state, not missing data: the work has not
            // finished, and the console has observed nothing that says it has.
            value:
              task.terminalState === null ? (
                <span data-terminal="none" className="text-[11px] text-muted-foreground">
                  not yet observed
                </span>
              ) : (
                <StateBadge value={task.terminalState} />
              ),
          },
          {
            label: "Failure reason",
            value: task.failureReason ?? null,
            hint: "What failed, named. Non-null exactly when the Task failed.",
          },
          {
            label: "Cancellation reason",
            value: task.cancelledReason ?? null,
            hint: "A cancellation is a person, not a fault, and says so here.",
          },
          { label: "Started", value: formatTimestamp(task.startedAt), mono: true },
          { label: "Finished", value: formatTimestamp(task.finishedAt), mono: true },
          {
            label: "Log",
            value: `${String(task.logCount)} events`,
            mono: true,
            ...(task.lastSeq === null || task.lastSeq === undefined
              ? {}
              : { hint: `last seq ${String(task.lastSeq)} · the Last-Event-ID a resume sends` }),
          },
        ]}
      />
    </div>
  );
}

/**
 * The log, as it arrives.
 *
 * A transcript, not a search result: lines are in the order they came off the
 * wire, which is the order the provisioner wrote them, and a log reordered by
 * timestamp would be a log that could hide an out-of-order line.
 */
function TaskLog({ task, stream }: { task: Task; stream: ReturnType<typeof useTaskLogStream> }) {
  const held = stream.entries.filter((entry) => entry.kind === "event").length;
  const faults = stream.entries.filter((entry) => entry.kind === "fault").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-xs font-medium">Log</h2>
        <span data-lines="held" className="font-mono text-[11px] text-muted-foreground">
          {held} of {String(task.logCount)} events held
        </span>
        <span data-stream={stream.status} className="font-mono text-[11px] text-muted-foreground">
          {streamStatusLabel(stream.status, stream.attempts)}
        </span>
        {stream.resumedFrom !== null && (
          <span
            data-resumed-from={String(stream.resumedFrom)}
            className="font-mono text-[11px] text-muted-foreground"
          >
            resumed from #{String(stream.resumedFrom)}
          </span>
        )}
        {faults > 0 && (
          <span data-faults={String(faults)} className="font-mono text-[11px] text-destructive">
            {faults} unreadable {faults === 1 ? "line" : "lines"}
          </span>
        )}
        <Button
          variant="outline"
          size="xs"
          className="ml-auto"
          onClick={stream.reopen}
          disabled={stream.status === "live" || stream.status === "connecting"}
        >
          <RefreshCw aria-hidden />
          Reconnect
        </Button>
      </div>

      {stream.entries.length === 0 ? (
        <EmptyState
          compact
          title={
            stream.status === "idle"
              ? "This Task has emitted nothing yet"
              : "Waiting for the first line"
          }
          body={
            stream.status === "idle"
              ? "A queued Task has not been claimed by a provisioner, so there is no log to replay. The stream opens on its own once the work starts."
              : "The stream is open and nothing has arrived on it yet."
          }
        />
      ) : (
        <ol
          data-log="true"
          className="flex flex-col divide-y divide-border border border-border font-mono text-[11px]"
        >
          {logRows(stream.entries)}
        </ol>
      )}
    </div>
  );
}

/** What the connection is doing, in words an operator can act on. */
const streamStatusLabel = (status: StreamStatus, attempts: number): string => {
  switch (status) {
    case "idle":
      return "no stream yet";
    case "connecting":
      return "opening the stream";
    case "live":
      return "live";
    case "reconnecting":
      return `reconnecting — attempt ${String(attempts)}`;
    case "refused":
      return "the control plane refused this stream";
    case "closed":
      return "stream closed";
  }
};

/**
 * The transcript, with a step transition rendered as a transition.
 *
 * A `step` is not a line of output -- it is a boundary the work moved across, and
 * a run's shape is mostly that: plan, apply, boot, cloud-init. The provisioner
 * tags most lines `log` and carries the step on them, so a transition is where the
 * step *changes*; a line explicitly tagged `step` is a boundary in its own right
 * and renders as one either way. A step marker is drawn before the first line of
 * that step, so the marker is not displaced by the lines that follow it.
 */
const logRows = (entries: readonly LogEntry[]): ReactNode[] => {
  const rows: ReactNode[] = [];
  let step: string | null = null;

  for (const entry of entries) {
    if (entry.kind === "fault") {
      rows.push(
        <li
          key={entry.fault.key}
          data-log-fault="true"
          data-why={entry.fault.why}
          className="flex flex-col gap-0.5 bg-destructive/5 px-2 py-1 text-destructive"
        >
          <span className="font-sans text-[11px] font-medium">
            a line arrived that the contract does not describe
          </span>
          <span data-fault-why="true">{entry.fault.why}</span>
          <span className="break-words opacity-80">{entry.fault.raw}</span>
        </li>,
      );
      continue;
    }

    const event = entry.event;
    if (
      event.tag === "step" ||
      (event.step !== null && event.step !== undefined && event.step !== step)
    ) {
      if (event.step !== null && event.step !== undefined) step = event.step;
      rows.push(
        <li
          key={`step-${String(event.seq)}`}
          data-log-step={event.step ?? "step"}
          className="bg-muted/60 px-2 py-1 font-sans text-[11px] font-medium text-muted-foreground"
        >
          ── step: {event.step ?? "unnamed"} ──
        </li>,
      );
    }

    rows.push(<LogLine key={`event-${String(event.seq)}`} event={event} />);
  }

  return rows;
};

/** One line: when it was written, which step it belongs to, and what it said. */
function LogLine({ event }: { event: TaskLogEvent }) {
  const level = event.level ?? "info";
  return (
    <li
      data-log-event={event.tag}
      data-seq={String(event.seq)}
      className={`flex items-baseline gap-2 px-2 py-1 ${LEVEL_CLASS[level]}`}
    >
      <span className="shrink-0 text-muted-foreground">#{String(event.seq)}</span>
      <span className="shrink-0 text-muted-foreground">{formatTimestamp(event.at)}</span>
      {event.tag === "result" ? (
        <span className="flex shrink-0 items-center gap-1">
          <Terminal className="size-3" aria-hidden />
          {event.state !== null && event.state !== undefined && <StateBadge value={event.state} />}
        </span>
      ) : (
        <span className="shrink-0 text-muted-foreground">{event.tag}</span>
      )}
      {event.step !== null && event.step !== undefined && (
        <span data-step="true" className="shrink-0 text-muted-foreground">
          [{event.step}]
        </span>
      )}
      <span className="min-w-0 break-words font-sans text-[11px]">{event.message}</span>
    </li>
  );
}
