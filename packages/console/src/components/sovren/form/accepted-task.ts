/**
 * The narrow for every long action, and the wording that goes with it.
 *
 * ## Why this file exists at all
 *
 * A create answers **`202`**, not `200`, and its body is a `Task`. `readOne` --
 * the console's narrow for a single resource -- reads `200` as the success arm,
 * so handing a create to it reports a `Task` body as an error. The tasks agent
 * hit exactly this with `TaskCancel`, and the fix is the same here: the arm that
 * carries a `Task` is the arm the document says carries one, and every other arm
 * is a sovren error with a code and a `requestId` in it.
 *
 * So the narrow is written **once, against the status every long action
 * declares**, and both mutations in the console go through it. A screen that
 * narrowed its own way could get it wrong on one operation and right on the
 * other, and the symptom would be a create that reported a failure the control
 * plane had not sent.
 *
 * ## Why the toast says what it says
 *
 * R44: the console never claims completion it has not observed. A `202` with a
 * `queued` Task means exactly one thing -- the request was accepted and the work
 * has not finished -- so the title is a present participle ("Creating web-07",
 * "Deleting postgres-main") and the detail carries the four facts that crossed
 * the wire: the status, the `kind`, the `state` and the `id`. Nothing here says
 * what the Task will reach, because the browser cannot know that. A title
 * containing "created" or "deleted" is a completion claim, and `claimsCompletion`
 * is what the console's own toast provider checks it against.
 */

import type { ErrorResponse, Task } from "@sovren/client";

/** The two things a long action's answer can be. */
export type AcceptedTask =
  | { readonly kind: "accepted"; readonly task: Task }
  | { readonly kind: "refused"; readonly error: ErrorResponse };

/**
 * A generated response, as far as this narrow is concerned.
 *
 * Structural, so `vMCreateResponse` and `vMDeleteResponse` satisfy it as they
 * stand -- no cast at the call site, and the discriminant is still the document's
 * own `status`.
 */
export interface StatusResponse {
  readonly status: number;
  readonly data: unknown;
}

/** The status every operation that starts long work answers with. */
export const ACCEPTED = 202;

/**
 * Narrow a long action's answer.
 *
 * `202` carries the `Task`. Everything else is a refusal, read from the same
 * body the client already translated into sovren's own error vocabulary, so the
 * code and the `requestId` on a form are the ones in the audit log.
 */
export const readAcceptedTask = (response: StatusResponse): AcceptedTask => {
  if (response.status === ACCEPTED) return { kind: "accepted", task: response.data as Task };
  return { kind: "refused", error: response.data as ErrorResponse };
};

/** The four facts a `202` carried, in the order an operator reads them. */
export const acceptedTaskDetail = (task: Task): string =>
  `${ACCEPTED} · ${task.kind} · ${task.state} · ${task.id}`;

export interface ActionToast {
  readonly tone: "ok" | "error";
  readonly title: string;
  readonly detail: string;
}

/**
 * The toast for an accepted long action.
 *
 * `verb` is a present participle supplied by the screen -- "Creating",
 * "Deleting" -- so the message is about *this* resource and never about a
 * category of outcome. The title names the resource, the detail carries the
 * Task. Nothing in either asserts that the work finished.
 */
export const acceptedToast = (verb: string, name: string, task: Task): ActionToast => ({
  tone: "ok",
  title: `${verb} ${name}`,
  detail: acceptedTaskDetail(task),
});

/**
 * The toast for a refusal.
 *
 * `verb` is the **bare** verb -- "create", "delete" -- rather than the participle
 * `acceptedToast` takes, because the two are used in different grammatical slots:
 * "Creating web-07" is what is happening and "the control plane will not create
 * web-07" is what did not happen. "Will not deleting web-07" is neither, and it is
 * the kind of sentence a console should not be capable of producing.
 *
 * "The control plane will not …" rather than a past-tense failure, because the
 * request is what failed and the work never started. The detail carries the code
 * and the `requestId`, which are the two things an operator can quote and a
 * reader can trace.
 */
export const refusedToast = (verb: string, name: string, error: ErrorResponse): ActionToast => ({
  tone: "error",
  title: `The control plane will not ${verb} ${name}`,
  detail: `${error.code} · ${error.requestId}`,
});
