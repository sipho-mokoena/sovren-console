/**
 * Sentinels: a failure the operator triggers by typing a value.
 *
 * R56: error paths are driven by a value the user controls, not by request
 * interception. The distinction is not stylistic. Request interception -- a
 * `server.use` override in a test -- can only fire where a test already is, so
 * the failure is reproducible in the test suite and nowhere else. An operator
 * in the dev server, or someone handed a bug report, has no way to reach it.
 *
 * A sentinel inverts that. The value lives in the URL, which means the dev
 * server and a test take the identical code path with the identical input:
 *
 *     /nodes?sentinel=upstream_unavailable
 *     /nodes/does-not-exist            (an unknown name is a sentinel already)
 *     /vms?node=accra-desk-01&sentinel=conflict
 *
 * The mechanism is a reserved query parameter plus a reserved path value. Both
 * are *values the operator selects or types*, which is the whole requirement.
 * Nothing here inspects the test runner, the environment, or a header a
 * browser would not send.
 *
 * Two deliberate consequences:
 *
 *  - A sentinel is a **query parameter or a path segment**, never a header. A
 *    header is invisible in a screenshot and cannot be typed into a URL bar.
 *  - An unrecognised sentinel value is itself an `invalid_request`, not a
 *    silently ignored parameter. A typo in the one mechanism meant to
 *    reproduce a bug must not look like the bug did not happen.
 */

import type { ErrorCode } from "@sovren/client";

import { SOVREN_ERROR_CODES } from "./vocabulary";

/** The query parameter. One name, every operation, so it is worth memorising. */
export const SENTINEL_PARAM = "sentinel";

/** The prefix a sentinel takes in a path segment: `~<name>`. */
export const SENTINEL_PATH_PREFIX = "~";

/**
 * Every sentinel, and what it produces.
 *
 * One per code, plus the codes with no natural resource-level trigger. The
 * names are the codes, kebab-cased, so the mapping is legible from the URL
 * alone -- `?sentinel=not-found` says what will happen before it happens.
 */
export const SENTINELS = {
  "not-found": { code: "not_found", status: 404 },
  unauthorised: { code: "unauthorised", status: 401 },
  forbidden: { code: "forbidden", status: 403 },
  conflict: { code: "conflict", status: 409 },
  "invalid-request": { code: "invalid_request", status: 400 },
  "upstream-unavailable": { code: "upstream_unavailable", status: 503 },
  "upstream-unauthenticated": { code: "upstream_unauthenticated", status: 502 },
  "action-not-permitted": { code: "action_not_permitted", status: 422 },
  "task-failed": { code: "task_failed", status: 500 },
  internal: { code: "internal", status: 500 },
} as const satisfies Record<string, { code: ErrorCode; status: number }>;

/** Every sentinel name, for a help panel and for the console to offer. */
export const SENTINEL_NAMES = Object.keys(SENTINELS) as (keyof typeof SENTINELS)[];

/**
 * The status a sentinel serves with, checked against the code's own status.
 *
 * A sentinel that served `conflict` as a 404 would let the console's error
 * handling be tested against a status the real control plane never sends, and
 * the bug would only appear in production. The status is not written here; it
 * is read from the code, so there is nothing to disagree.
 */
export const statusForSentinel = (name: keyof typeof SENTINELS): number =>
  SOVREN_ERROR_CODES[SENTINELS[name].code].status;

export type SentinelName = keyof typeof SENTINELS;

const isSentinelName = (value: string): value is SentinelName => Object.hasOwn(SENTINELS, value);

/** What a sentinel in a request asked for. */
export interface SentinelDirective {
  name: SentinelName;
  code: ErrorCode;
}

export type SentinelLookup =
  | { readonly kind: "none" }
  | { readonly kind: "found"; readonly directive: SentinelDirective }
  /** Typed, but not one this build knows. An `invalid_request`, not a shrug. */
  | { readonly kind: "unknown"; readonly value: string };

/**
 * Read the sentinel out of a request URL.
 *
 * Two positions, and the path is checked first. A sentinel typed as a path
 * segment is an operator pointing at one specific resource, which is a more
 * specific statement than a query parameter carried across a whole screen; a
 * stray `?sentinel=` left in a URL from an earlier attempt should not override
 * the one they just typed.
 */
export const sentinelIn = (url: URL): SentinelLookup => {
  for (const segment of url.pathname.split("/")) {
    if (segment.startsWith(SENTINEL_PATH_PREFIX)) {
      return interpret(segment.slice(SENTINEL_PATH_PREFIX.length));
    }
  }

  const param = url.searchParams.get(SENTINEL_PARAM);
  if (param !== null) return interpret(param);

  return { kind: "none" };
};

const interpret = (value: string): SentinelLookup =>
  isSentinelName(value)
    ? { kind: "found", directive: { name: value, code: SENTINELS[value].code } }
    : { kind: "unknown", value };

/**
 * The message a sentinel's failure carries.
 *
 * Present tense and addressed to the operator, like every other message, and
 * deliberately saying that a sentinel caused it. An operator who typed
 * `?sentinel=conflict` should not then spend ten minutes wondering whether the
 * estate really has a name collision, and a test asserting the code should not
 * depend on which sentence came with it.
 */
export const sentinelMessage = (directive: SentinelDirective): string => {
  switch (directive.code) {
    case "not_found":
      return "Nothing answers to that name or id. The sentinel asked for this.";
    case "unauthorised":
      return "The console's session was rejected. The sentinel asked for this.";
    case "forbidden":
      return "A held credential is not permitted to do this. The sentinel asked for this.";
    case "conflict":
      return "The estate is already in a state that refuses this action. The sentinel asked for this.";
    case "invalid_request":
      return "That request could not be accepted as written. The sentinel asked for this.";
    case "upstream_unavailable":
      return "Proxmox, NetBird, or Dokploy is not answering. The sentinel asked for this.";
    case "upstream_unauthenticated":
      return "An upstream rejected sovren's credential. The sentinel asked for this.";
    case "action_not_permitted":
      return "This action is not permitted for this resource right now. The sentinel asked for this.";
    case "task_failed":
      return "The Task this depended on failed. The sentinel asked for this.";
    case "internal":
      return "The control plane failed in a way sovren has no code for. The sentinel asked for this.";
  }
};

/** The same message, keyed by code, for a failure that did not come from a sentinel. */
export const messageForSentinelCode = (code: ErrorCode): string =>
  sentinelMessage({ name: nameForCode(code), code });

const nameForCode = (code: ErrorCode): SentinelName => {
  const found = SENTINEL_NAMES.find((name) => SENTINELS[name].code === code);
  // Unreachable while every code has a sentinel, which the vocabulary asserts.
  if (found === undefined) throw new Error(`no sentinel declares the code ${code}`);
  return found;
};

/**
 * A one-line description of every sentinel, for the dev server's help panel.
 * The console agent needs this to render a picker, and an operator needs it to
 * know the mechanism exists at all.
 */
export const sentinelHelp: ReadonlyArray<{ query: string; yields: string }> = SENTINEL_NAMES.map(
  (name) => ({
    query: `?${SENTINEL_PARAM}=${name}`,
    yields: SOVREN_ERROR_CODES[SENTINELS[name].code].meaning,
  }),
);
