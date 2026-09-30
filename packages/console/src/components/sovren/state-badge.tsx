/**
 * The state badge: one component for every state sovren renders as a word.
 *
 * A `NodeStatus`, a `VMRunState`, a `TaskState`, a `PeerStatus` and a
 * `ConnectionState` are five vocabularies with one job -- say whether this thing
 * is working -- and an operator should not have to learn a new colour for each.
 * So the tone is looked up from one table rather than decided per screen, and the
 * word is the upstream's word, never a synonym.
 *
 * The table is a literal. It is not derived from the string, because a derivation
 * is a guess: `paused` and `queued` are both "not running" and neither is
 * degraded, and a screen that guessed would paint a paused VM amber and teach
 * the operator to distrust amber.
 */

import type { ReactNode } from "react";
import { cn } from "cn";

export type BadgeTone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Every state the console renders, and how it reads.
 *
 * Covers the five state vocabularies the contract declares and the error
 * vocabulary, so a disabled action and a failed request are the same badge and an
 * operator reads them with one eye.
 */
export const STATE_TONE: Readonly<Record<string, BadgeTone>> = {
  /* Node status. Heterogeneity is the normal case, and offline is a normal
     Tuesday on retired desktops -- which is why it is `bad` and not `unknown`. */
  online: "ok",
  offline: "bad",
  degraded: "warn",
  unknown: "neutral",

  /* VM run state. Transitional is its own tone: a create Task is running, and
     the machine is neither up nor broken yet. */
  transitional: "info",
  running: "ok",
  stopped: "neutral",
  paused: "warn",
  suspended: "neutral",
  failed: "bad",

  /* Task state. Cancelled is neutral rather than bad: a human asked for it. */
  queued: "neutral",
  succeeded: "ok",
  cancelled: "neutral",

  /* Peer status. */
  connected: "ok",
  stale: "warn",
  disconnected: "bad",

  /* Connection state. `unconfigured` is a warning rather than a failure: the
     integration is not wired up yet, which is a state Settings is designed for. */
  tested: "ok",
  unconfigured: "warn",
  unset: "neutral",

  /* The error vocabulary, for a disabled action and a failed request. */
  not_found: "neutral",
  unauthorised: "bad",
  forbidden: "bad",
  conflict: "warn",
  invalid_request: "warn",
  upstream_unavailable: "bad",
  upstream_unauthenticated: "bad",
  action_not_permitted: "warn",
  task_failed: "bad",
  internal: "bad",
};

/** The tone for a value, or `neutral` for a state this build has not seen. */
export const toneFor = (value: string): BadgeTone => STATE_TONE[value] ?? "neutral";

export interface StateBadgeProps {
  /** The state as the contract spells it. */
  value: string;
  /** Overrides the lookup, for a state whose tone depends on more than the word. */
  tone?: BadgeTone;
  /** What to show instead of the raw value, when the raw value is not the word. */
  label?: ReactNode;
  className?: string;
}

export function StateBadge({ value, tone, label, className }: StateBadgeProps) {
  return (
    <span
      data-state={value}
      data-tone={tone ?? toneFor(value)}
      className={cn(
        "inline-flex h-4.5 w-fit shrink-0 items-center rounded-none px-1.5 font-mono text-[11px] leading-none whitespace-nowrap",
        TONE_CLASS[tone ?? toneFor(value)],
        className,
      )}
    >
      {label ?? value}
    </span>
  );
}

/**
 * A held or missing credential.
 *
 * A credential is never a returned value -- there is no field for one -- so the
 * most this can honestly say is that sovren holds one. It says exactly that, and
 * the *kind* alongside it, so an operator can see that Proxmox needs two and has
 * one without the console ever being able to read either.
 */
export function HeldBadge({ held, label }: { held: boolean; label: string }) {
  return (
    <span
      data-held={held}
      className={cn(
        "inline-flex h-4.5 w-fit items-center gap-1 rounded-none border px-1.5 font-mono text-[11px] leading-none whitespace-nowrap",
        held
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {label}
      <span className="font-sans">{held ? "held" : "not held"}</span>
    </span>
  );
}
