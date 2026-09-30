/**
 * Reading a generated response.
 *
 * The generated client never throws (R35), so a failure is not an exception to
 * catch -- it is a value. Every call resolves to a union discriminated on
 * `status`, and the success arm's `data` and the failure arm's `data` have
 * nothing in common, which is the point: a component that renders `data.items`
 * without narrowing does not type-check.
 *
 * This module is the one place that narrow happens for lists, so a screen never
 * has to reach into a response's shape, and so a list page and its empty state
 * cannot disagree about what a failure looks like.
 *
 * ## What "narrowing" costs
 *
 * The generated union discriminates on `status`, and `NodePage` and `Error` are
 * structurally unrelated, so a `status !== 200` check is the natural narrow.
 * It is written here once, against a runtime test for the error body, because
 * the runtime test is the one that also survives a control plane that answers
 * `200` with an error-shaped body -- a shape the mutator in `packages/client`
 * already normalises. Keying off the *body* means the console reads the same
 * thing the client's own error vocabulary says, rather than a status it has to
 * map again.
 */

import type { ErrorCode, ErrorResponse } from "@sovren/client";

/**
 * The envelope every list in sovren returns, restated.
 *
 * A test against the document pins that every `List` operation returns this
 * shape flat, so every page type in the generated models is assignable to it.
 * Restating it here is what lets the archetype be instantiated with a page type
 * it has never seen -- `NodePage` today, `PeerPage` and `VmPage` tomorrow --
 * without a cast at the call site.
 */
export interface SovrenPage<TRow> {
  items: TRow[];
  /**
   * The opaque token for the next page, or null at the end of the list. Never an
   * offset (R33): a token names the row the next page starts after, so a row
   * inserted or removed elsewhere in the list cannot shift the page under the
   * operator.
   */
  nextPage: string | null;
}

/**
 * Whether a value is a sovren error rather than a resource.
 *
 * **Not the narrow the console uses.** Read `readList` and `readOne` for that;
 * they narrow on the response's `status`, which is the contract's own
 * discriminant. This predicate is here for a body that is known to be one of the
 * two, and it is worth knowing why it is not sufficient on its own:
 * `ConnectionTestResult` carries a `code` and a `requestId` too. A console that
 * told a failed connection test apart by its body would report "the test did not
 * run" for a test that ran and came back `ok: false` -- which is the one thing
 * R44 exists to prevent, arrived at from the other direction.
 */
export const isSovrenError = (value: unknown): value is ErrorResponse =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  typeof (value as { code: unknown }).code === "string" &&
  "requestId" in value;

/** A list response, read. The three outcomes a list page can be in. */
export type ListRead<TRow> =
  | { readonly kind: "pending" }
  | { readonly kind: "error"; readonly error: ErrorResponse }
  | { readonly kind: "page"; readonly page: SovrenPage<TRow> };

/** A single-resource response, read. */
export type OneRead<T> =
  | { readonly kind: "pending" }
  | { readonly kind: "error"; readonly error: ErrorResponse }
  | { readonly kind: "value"; readonly value: T };

/** The one place a generated response union is narrowed, for a read of one thing. */
export const readOne = <T>(data: unknown): OneRead<T> => {
  if (data === undefined || data === null) return { kind: "pending" };
  const response = data as { status: number; data: unknown };
  if (response.status !== 200) return { kind: "error", error: response.data as ErrorResponse };
  return { kind: "value", value: response.data as T };
};

/**
 * The one place a generated response union is narrowed, for a page of rows.
 *
 * The narrow is on `status`, which is the discriminant the document declares and
 * the generator emits. `data` is a page on the 200 arm and an `Error` on every
 * other arm, and the two have nothing in common -- which is what makes
 * `response.data.items` unreachable without narrowing, and that is the intended
 * behaviour rather than an obstacle to route around.
 */
export const readList = <TRow>(data: unknown): ListRead<TRow> => {
  if (data === undefined || data === null) return { kind: "pending" };
  const response = data as { status: number; data: unknown };
  if (response.status !== 200) return { kind: "error", error: response.data as ErrorResponse };
  return { kind: "page", page: response.data as SovrenPage<TRow> };
};

/**
 * What each code means for the operator, in the console's own words.
 *
 * The code is the contract and the message is the courtesy, and this table is
 * where the courtesy lives. A screen never invents a sentence for a code it has
 * not seen here, which is what stops two screens from describing the same
 * failure differently.
 */
export const ERROR_MEANING: Record<ErrorCode, string> = {
  not_found: "Nothing here answers to that name or id.",
  unauthorised: "The console's session was rejected.",
  forbidden: "A credential sovren holds is not permitted to do this.",
  conflict: "The estate is already in a state that refuses this action.",
  invalid_request: "That request could not be accepted as written.",
  upstream_unavailable: "Proxmox, NetBird, or Dokploy is not answering.",
  upstream_unauthenticated: "An upstream rejected the credential sovren holds.",
  action_not_permitted: "This action is not permitted for this resource right now.",
  task_failed: "The Task this depended on failed.",
  internal: "The control plane failed in a way sovren has no code for.",
};

/**
 * Whether trying the same request again could plausibly work.
 *
 * A screen offers a retry on this and not otherwise, because a retry button on
 * `invalid_request` teaches an operator that the console is offering them a way
 * to fix a request the control plane will refuse again.
 */
export const isRetryable = (error: ErrorResponse): boolean =>
  error.retryable === true || error.code === "upstream_unavailable" || error.code === "internal";

/**
 * The failure codes that Settings can act on, so the error state can offer the
 * one place that fixes them.
 *
 * An error state that only reports is a dead end: the operator reads a code and
 * has nowhere to go. These three are all about the three upstream connections,
 * and the connection test in Settings is the thing that answers them.
 */
export const CONNECTIONS_CAN_FIX: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "upstream_unavailable",
  "upstream_unauthenticated",
  "forbidden",
  "unauthorised",
]);
