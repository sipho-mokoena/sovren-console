/**
 * Cancelling a running Task.
 *
 * R50, and the requirement is about time rather than capability: a mistake costs
 * seconds instead of minutes. So the control is on the row and on the detail
 * page, and it is the same control in both -- one mutation, one wording, one set
 * of rules about when it is offered.
 *
 * ## What the console says, and when
 *
 * The endpoint answers `202` with the Task, and its state is `cancelled` once the
 * process is actually gone. So the console says *"Cancellation requested"* and
 * nothing more: the request was made and accepted, and the state it reached is a
 * separate fact that the control plane has not finished reporting. A toast that
 * said "cancelled" would be R44's exact failure -- a completion the browser has
 * not observed -- dressed as a convenience. The row then re-reads the Task, and
 * it is the control plane's own answer that moves the badge, not the toast.
 *
 * ## Why a disabled cancel carries a code
 *
 * A Task that has finished has no process to signal, and the contract says so
 * with `action_not_permitted`. So the control is rendered greyed with that code
 * rather than removed: an operator who cannot see that cancelling exists learns
 * less from the console than from one who can see it is unavailable, and learns
 * nothing that transfers (R43).
 *
 * **A `queued` Task offers the control**, because the contract's cancel accepts
 * `queued` as well as `running` and the console has no way to know which
 * provisioner has already claimed it. When the control plane refuses, the refusal
 * comes back with the code and the sentence *it* would have used, and the screen
 * shows that rather than the one this file would have guessed.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTaskListQueryKey, useTaskCancel } from "@sovren/client";
import type { DisabledAction, Task } from "@sovren/client";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { useToast } from "@/components/sovren/toast";
import { derivedDisabledAction } from "@/lib/disabled-actions";

/** The states whose Task still has a process to signal. */
const CANCELLABLE: readonly Task["state"][] = ["queued", "running"];

/** Whether the contract lets this Task be cancelled at all. */
export const canCancel = (task: Task): boolean => CANCELLABLE.includes(task.state);

/**
 * The refusal for a Task that has already finished.
 *
 * Derived rather than declared, because `Task` carries no `disabledActions[]` the
 * way a `Node` does -- the contract does not declare one, so the console derives
 * the same code the request would have carried. The sentence says what the
 * control plane's own would have said: there is no process to signal.
 */
export const cancelRefusal = (task: Task): DisabledAction =>
  derivedDisabledAction(
    "cancel",
    "action_not_permitted",
    `The Task is ${task.state}, so there is no process to signal.`,
  );

/**
 * The outcome of a cancel, handed to whoever asked for it.
 *
 * A list row uses it to keep its own state until the control plane's next answer
 * arrives; the detail page uses it to show the Task it was actually given. It is
 * `null` for a refusal, which is the case that must not be mistaken for one.
 */
export type CancelOutcome = (task: Task) => void;

export interface TaskCancelProps {
  task: Task;
  /**
   * What to do with the Task the control plane returned.
   *
   * Called only when the request was accepted, and only with a `202` body. A
   * refusal produces an error toast and no call, because there is no newer truth
   * to hold.
   */
  onAccepted?: CancelOutcome;
}

export function TaskCancel({ task, onAccepted }: TaskCancelProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cancel = useTaskCancel();
  const [busy, setBusy] = useState(false);

  if (!canCancel(task)) {
    return <DisabledActionButton action="cancel" refusal={cancelRefusal(task)} />;
  }

  return (
    <Button
      variant="outline"
      size="xs"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        cancel.mutate(
          { task: task.id },
          {
            onSuccess: (response) => {
              /**
               * Narrowed on the status this operation declares, not on a body.
               *
               * `readOne` reads a `200` as the success arm, and a cancel answers
               * `202` -- the work is accepted and has not finished, which is the
               * whole meaning of the code. So the arm that carries a `Task` is the
               * one the document says carries one, and every other arm is a sovren
               * error with a code and a `requestId` in it.
               */
              if (response.status !== 202) {
                const refused = response.data;
                toast.report({
                  tone: "error",
                  title: `The control plane will not cancel ${task.name}`,
                  detail: `${refused.code} · ${refused.requestId}`,
                });
                return;
              }
              // What was observed: the request was accepted, and this is the Task
              // the control plane says it is now. Not "cancelled" -- the state it
              // reached is a separate, later observation, and the row re-reads it.
              toast.report({
                tone: "ok",
                title: `Cancellation requested for ${task.name}`,
                detail: `202 · ${response.data.id}`,
              });
              onAccepted?.(response.data);
            },
            onSettled: () => {
              setBusy(false);
              // A real control plane records the cancellation, so the list is
              // re-read rather than assumed. The detail page already holds the
              // Task it was handed, so it does not need a second round trip.
              void queryClient.invalidateQueries({ queryKey: getTaskListQueryKey() });
            },
          },
        );
      }}
    >
      <Ban aria-hidden />
      Cancel
    </Button>
  );
}
