/**
 * Actions the control plane will refuse, and the codes that refuse them.
 *
 * R43: a disabled action explains itself rather than disappearing. An operator
 * who cannot see that migration exists learns less than one who can see it greyed
 * out with a reason, and an operator who sees a greyed button with no reason
 * learns that the console is broken.
 *
 * **The reason is a code, not a sentence.** `DisabledAction.reason` is an
 * `ErrorCode` from the fixed vocabulary, which is what lets a greyed control and
 * the request that would have failed speak one language. The sentence is the
 * console's, rendered beside the code as a courtesy, and a screen that had to
 * invent one would be a screen that would later contradict the server.
 */

import type { DisabledAction, ErrorCode } from "@sovren/client";

/** The sovren code, and the console's own wording for it. */
export const DISABLED_REASON_MEANING: Record<ErrorCode, string> = {
  not_found: "Nothing here answers to that name or id.",
  unauthorised: "The console's session was rejected.",
  forbidden: "A credential sovren holds is not permitted to do this.",
  conflict: "The estate is already in a state that refuses this action.",
  invalid_request: "That request could not be accepted as written.",
  upstream_unavailable: "Proxmox, NetBird, or Dokploy is not answering.",
  upstream_unauthenticated: "An upstream rejected the credential sovren holds.",
  action_not_permitted: "The control plane will not permit this right now.",
  task_failed: "The Task this depended on failed.",
  internal: "The control plane failed in a way sovren has no code for.",
};

/** A resource's declared refusals, as a lookup by action. */
export type DisabledActions = Readonly<Record<string, DisabledAction>>;

/** Index a resource's `disabledActions[]` by action, if it declared any. */
export const disabledActionsOf = (
  declared: readonly DisabledAction[] | undefined,
): DisabledActions => {
  const index: Record<string, DisabledAction> = {};
  for (const entry of declared ?? []) index[entry.action] = entry;
  return index;
};

/** The refusal for one action, or `undefined` when the action is available. */
export const disabledActionFor = (
  index: DisabledActions,
  action: string,
): DisabledAction | undefined => index[action];

/** Whether an action is available. The only question a caller really has. */
export const isAvailable = (index: DisabledActions, action: string): boolean =>
  index[action] === undefined;

/**
 * A refusal the console knows about but the resource did not declare.
 *
 * Some refusals are decidable from the row the console already holds -- a `Node`
 * with `canMigrate: false` cannot be migrated, and the control plane would say
 * `action_not_permitted` if asked. Deriving it means a row that is visibly
 * unavailable never renders as an action that silently does nothing, and the
 * code the operator reads is the code the request would carry.
 *
 * **The declared refusal always wins.** If the server sent one, it is the
 * truth about the server, including on a resource the console's own rule would
 * have got wrong.
 */
export const derivedDisabledAction = (
  action: string,
  reason: ErrorCode,
  explanation: string,
): DisabledAction => ({ action, reason, explanation });

/** One sentence for an action name, for a control that has no refusal to show. */
export const actionLabel = (action: string): string =>
  action.charAt(0).toUpperCase() + action.slice(1);
