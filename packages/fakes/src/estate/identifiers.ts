/**
 * The shape of a sovren identifier, and the one place it is defined.
 *
 * R32: `id` is an immutable system key and `name` is a mutable human key, and
 * both work in any path parameter. That only holds if the two are visibly
 * different kinds of string, so they are: an id is a two-letter resource prefix,
 * an underscore, and ten Crockford base32 characters -- the same shape the
 * client's own fixture uses (`nd_01hq2v7xk3`). A name is a DNS label, because
 * a name is also a hostname on the overlay and NetBird resolves it as one.
 *
 * The prefixes are the resource, not an accident of ordering, and the
 * consistency check enforces the pairing. An id written with the wrong prefix
 * is a real bug rather than a style complaint: it says the author believed a
 * VM was a Node, and the type system will not catch it because both are
 * strings.
 */

import type { ErrorCode } from "@sovren/client";

/** Every resource sovren owns an id for, and the two letters that open it. */
export const ID_PREFIXES = {
  site: "st",
  node: "nd",
  drive: "dr",
  peer: "pr",
  group: "gp",
  vm: "vm",
  disk: "ds",
  snapshot: "sn",
  task: "tk",
  connection: "cn",
} as const;

export type ResourceKind = keyof typeof ID_PREFIXES;

export const RESOURCE_KINDS = Object.keys(ID_PREFIXES) as ResourceKind[];

/**
 * Crockford base32 without the letters that are easy to misread aloud or
 * retype: no i, l, o, u. Lowercase, because these appear in URLs and in log
 * lines where a case-insensitive reader is a hazard rather than a convenience.
 */
const SUFFIX = "[0-9a-hjkmnp-tv-z]{10}";

/** The full pattern, anchored, for an id of any resource. */
export const ID_PATTERN = new RegExp(`^(${Object.values(ID_PREFIXES).join("|")})_${SUFFIX}$`);

/** The full pattern for one resource, which is the check worth writing. */
export const idPattern = (kind: ResourceKind): RegExp =>
  new RegExp(`^${ID_PREFIXES[kind]}_${SUFFIX}$`);

/**
 * A name is a DNS label: lowercase, no leading or trailing hyphen, 63
 * characters at most. It becomes a hostname inside the guest's cloud-init, so a
 * name with a space in it is a name that fails four minutes into a boot.
 */
export const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** A requestId is opaque. This is the shape the fake mints and nothing else. */
export const REQUEST_ID_PATTERN = /^req_[0-9a-z]{10,32}$/;

/** An opaque page token. Deliberately not an offset, and visibly not one. */
export const PAGE_TOKEN_PATTERN = /^pt_[A-Za-z0-9_-]{8,}$/;

export const isValidId = (value: string, kind: ResourceKind): boolean =>
  idPattern(kind).test(value);

export const isValidName = (value: string): boolean => NAME_PATTERN.test(value);

/**
 * The estate's fixed vocabulary of failure reasons, as opposed to a message.
 *
 * A reason is one of these codes, never prose. R43 asks a disabled action to
 * explain itself, and an explanation keyed off free text is an explanation the
 * console cannot render, test, or localise -- it can only print it. Keyed off a
 * code, the console can say why, offer the remedy, and assert the reason in a
 * test without matching a sentence.
 */
export const DISABLED_ACTION_REASONS = [
  "action_not_permitted",
  "conflict",
  "invalid_request",
  "not_found",
  "upstream_unavailable",
  "upstream_unauthenticated",
] as const satisfies readonly ErrorCode[];

export type DisabledActionReason = (typeof DISABLED_ACTION_REASONS)[number];
