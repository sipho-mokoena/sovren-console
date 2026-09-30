/**
 * The sovren error vocabulary, and the translation into it.
 *
 * R34: every error carries a fixed sovren code and a `requestId`, and that same
 * `requestId` appears in the audit log. R35: the client never throws, so
 * failure is something a call site has to deal with rather than something it
 * can forget.
 *
 * **This is the mock side of the boundary, and the client already has the other
 * half.** `packages/client/src/safe-fetch.ts` exports `translateError`, which
 * turns any status and body into a sovren error at the client boundary, and
 * that is the single place that mapping lives. Duplicating a status-to-code
 * table here would be the one thing that could make the two halves disagree, so
 * this module does not have one. What it does have is the part the client
 * cannot have:
 *
 *  - the messages, which are addressed to an operator and belong to the server
 *    that produced the failure, not to a client that only sees a status;
 *  - `details`, the field-level constraints that make an `invalid_request`
 *    actionable instead of merely true;
 *  - the `requestId` minting and the audit write, which have to happen on the
 *    side that knows what the request was;
 *  - a fixed meaning per code, asserted rather than assumed.
 *
 * The case `safe-fetch.ts` does not cover, and this module therefore does, is
 * an *unknown upstream* error: a body that is neither a sovren error nor a shape
 * anything here recognises. The client maps that to `internal` on a status it
 * has no entry for. The mock has to choose a code deliberately, and the honest
 * choice for "the control plane itself broke" is `internal` -- not a code
 * borrowed from the upstream that happened to fail.
 */

import type { ErrorCode, ErrorResponse } from "@sovren/client";

/**
 * Every code the console can key off, with the meaning pinned here.
 *
 * The set is the document's, unchanged: adding a code is a contract change, not
 * a mock change, which is what stops the vocabulary drifting toward whatever
 * the fakes happen to need. `satisfies` below fails the build if the generated
 * union and this record ever disagree in either direction -- a code here that
 * the document does not declare, or one the document declares that nothing here
 * can produce.
 */
export const SOVREN_ERROR_CODES = {
  /**
   * Nothing in the estate answers to that name or id. The name is mutable and
   * the id is not, so this is what a stale link and a typo both look like.
   */
  not_found: {
    status: 404,
    retryable: false,
    meaning: "No resource in the estate answers to that name or id.",
  },
  /**
   * The operator's own session was rejected. Distinct from `forbidden`: this is
   * "who are you", the next one is "you are known and may not do this".
   */
  unauthorised: {
    status: 401,
    retryable: false,
    meaning: "The console's sovereign session was rejected or has expired.",
  },
  /**
   * A credential sovren holds was accepted for identity but not for this
   * action -- a Proxmox token without Sys.Audit, say. A misconfiguration the
   * operator can fix in Settings, which is why it is not `unauthorised`.
   */
  forbidden: {
    status: 403,
    retryable: false,
    meaning: "A held credential is not permitted to perform this action.",
  },
  /**
   * The request is well formed and the action is allowed, but the estate is
   * already in a state that refuses it: a name taken, a Task already terminal.
   */
  conflict: {
    status: 409,
    retryable: false,
    meaning: "The estate is already in a state that refuses this action.",
  },
  /**
   * The request could not be read as written: a missing field, a value outside
   * its constraint. Carries `details` naming the field, because an operator
   * cannot fix what is not pointed at.
   */
  invalid_request: {
    status: 400,
    retryable: false,
    meaning: "The request could not be accepted as written.",
  },
  /**
   * Proxmox, NetBird, or Dokploy is not answering. The only broadly retryable
   * code: waiting is a rational response, so the console may offer to retry.
   */
  upstream_unavailable: {
    status: 503,
    retryable: true,
    meaning: "An upstream sovren integrates with is not answering.",
  },
  /**
   * An upstream answered and rejected sovren's credential. Distinct from
   * `forbidden` because the fix is in Settings, not in the operator's session,
   * and from `upstream_unavailable` because retrying unchanged will not help.
   */
  upstream_unauthenticated: {
    status: 502,
    retryable: false,
    meaning: "An upstream rejected the credential sovren holds for it.",
  },
  /**
   * The action is not offered for this resource in this state -- migrating
   * across a heterogeneous CPU, cancelling a Task that already finished. This is
   * the code a *disabled* control carries, so the console can explain a greyed
   * button with the same vocabulary it uses for a failure.
   */
  action_not_permitted: {
    status: 422,
    retryable: false,
    meaning: "This action is not permitted for this resource in its current state.",
  },
  /**
   * A Task reached `failed` and the request depended on it succeeding. The
   * Task's own record carries the detail; this says the dependency failed.
   */
  task_failed: {
    status: 500,
    retryable: false,
    meaning: "A Task this request depended on reached the failed state.",
  },
  /**
   * A fault in sovren itself. The honest residual: something failed that no
   * code above describes, and pretending otherwise would be the failure mode
   * this whole vocabulary exists to prevent.
   */
  internal: {
    status: 500,
    retryable: false,
    meaning: "The control plane failed in a way sovren does not have a code for.",
  },
} as const satisfies Record<ErrorCode, { status: number; retryable: boolean; meaning: string }>;

/** Every code, in the document's declared order. */
export const ALL_ERROR_CODES = Object.keys(SOVREN_ERROR_CODES) as ErrorCode[];

/** Whether waiting and trying again could plausibly succeed. */
export const isRetryable = (code: ErrorCode): boolean => SOVREN_ERROR_CODES[code].retryable;

/** The HTTP status this code is served with. One per code, so it cannot drift. */
export const statusForCode = (code: ErrorCode): number => SOVREN_ERROR_CODES[code].status;

/** One field-level constraint, for the codes that have something to point at. */
export type SovrenErrorDetail = NonNullable<ErrorResponse["details"]>[number];

export interface SovrenErrorInit {
  code: ErrorCode;
  message: string;
  requestId: string;
  retryable?: boolean;
  details?: SovrenErrorDetail[];
}

/**
 * A failure, as it is served and as the console receives it.
 *
 * The status is derived from the code and never passed in, so a handler cannot
 * serve `action_not_permitted` as a 404 and teach the console something false
 * about its own vocabulary.
 */
export class SovrenFailure {
  readonly status: number;
  readonly body: ErrorResponse;

  constructor(init: SovrenErrorInit) {
    const { retryable } = SOVREN_ERROR_CODES[init.code];
    this.status = statusForCode(init.code);
    this.body = {
      code: init.code,
      message: init.message,
      requestId: init.requestId,
      retryable: init.retryable ?? retryable,
      ...(init.details && init.details.length > 0 ? { details: init.details } : {}),
    };
  }

  get code(): ErrorCode {
    return this.body.code;
  }

  get requestId(): string {
    return this.body.requestId;
  }
}

/**
 * A requestId, minted the way the control plane mints one.
 *
 * The shape is checked by the consistency suite, because a requestId that
 * reaches the console as an empty string is traceable to nothing: the operator
 * reports it, and there is nothing to search the audit log for.
 */
let requestIdCounter = 0;

export const mintRequestId = (): string => {
  requestIdCounter += 1;
  const stamp = Date.now().toString(36);
  const seq = requestIdCounter.toString(36).padStart(4, "0");
  const noise = Math.random().toString(36).slice(2, 8);
  return `req_${stamp}${seq}${noise}`;
};

/** Test-only. A counter that carries across suites makes failures unreproducible. */
export const resetRequestIds = (): void => {
  requestIdCounter = 0;
};

/** Shorthand for the codes that carry no field-level detail. */
export const fail = (
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: SovrenErrorDetail[],
): SovrenFailure =>
  new SovrenFailure({ code, message, requestId, ...(details ? { details } : {}) });

/**
 * Anything that is not already a sovren error becomes one.
 *
 * A body that already carries a sovren `code` and `message` is passed through
 * with its `requestId` intact -- that is the mock answering a mock, and
 * rewriting it would lose the very `requestId` the audit entry is keyed on. A
 * body that does not is upstream data: a Proxmox `{"errors": "..."}`, a
 * NetBird message string, an HTML error page from a reverse proxy. None of
 * those is a shape the console should ever see, so they are classified here.
 *
 * **What `safe-fetch.ts` already covers, and is not repeated:** a body with a
 * `code` and a `message` is adopted as-is, and a status maps to a code through
 * that module's table. This function is the server-side equivalent and exists
 * because the server must choose the code at the moment it mints the
 * `requestId`; the client's table is a fallback for a server that failed to,
 * not a second authority. The two agree by construction here: a code that
 * crosses this boundary is always a declared `ErrorCode`, so the client's
 * pass-through branch is the one that fires and its status table is never
 * consulted for a body this module produced.
 *
 * @param body whatever the upstream or an unhandled path produced
 * @param fallback the code to use when the body says nothing usable
 */
export const translate = (body: unknown, fallback: ErrorCode, requestId: string): ErrorResponse => {
  if (isSovrenError(body)) {
    return { ...body, requestId: body.requestId ?? requestId };
  }
  return fail(fallback, messageFor(fallback), requestId).body;
};

const isSovrenError = (value: unknown): value is ErrorResponse =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  "message" in value &&
  typeof (value as { code: unknown }).code === "string" &&
  typeof (value as { message: unknown }).message === "string";

/**
 * A default message per code, in the present tense and addressed to the
 * operator. R44: the console never asserts a state it has not observed, and
 * that discipline starts with the words.
 */
export const messageFor = (code: ErrorCode): string => {
  switch (code) {
    case "not_found":
      return "Nothing in the estate answers to that name or id.";
    case "unauthorised":
      return "The console's session was rejected. Sign in again.";
    case "forbidden":
      return "A credential sovren holds is not permitted to do this. Check Settings.";
    case "conflict":
      return "The estate is already in a state that refuses this action.";
    case "invalid_request":
      return "That request could not be accepted as written.";
    case "upstream_unavailable":
      return "Proxmox, NetBird, or Dokploy is not answering.";
    case "upstream_unauthenticated":
      return "An upstream rejected the credential sovren holds. Check Settings.";
    case "action_not_permitted":
      return "This action is not permitted for this resource right now.";
    case "task_failed":
      return "The Task this depended on failed. Open the Task for the reason.";
    case "internal":
      return "The control plane failed in a way sovren has no code for.";
  }
};
