/**
 * A disabled action, and the code that refuses it.
 *
 * R43. The control is rendered, greyed, and beside it the fixed sovren code --
 * not a sentence the screen wrote. That distinction is the requirement: a greyed
 * control whose reason is prose is a control the console will contradict the
 * moment the server's reason differs, and an operator who has learned to read
 * the prose has learned nothing that transfers.
 *
 * The prose is still here, as the `title` and as the accessible description,
 * because an operator should not have to know the vocabulary to find out what to
 * do next. Code first, sentence as the courtesy.
 */

import type { DisabledAction } from "@sovren/client";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StateBadge } from "@/components/sovren/state-badge";
import { DISABLED_REASON_MEANING, actionLabel } from "@/lib/disabled-actions";

export interface DisabledActionButtonProps {
  /** The action the control would perform, as the contract names it. */
  action: string;
  /** The refusal, carrying the code that refuses it. */
  refusal: DisabledAction;
  /** The control's own label, when it is not just the action's name. */
  label?: string;
  variant?: "outline" | "ghost" | "destructive";
}

/**
 * A control that cannot be used, showing why in the contract's own code.
 *
 * `disabled` plus an accessible description, rather than a `title` alone: a title
 * is invisible to a keyboard user and to a screen reader, and this is exactly the
 * information that has to survive both.
 */
export function DisabledActionButton({
  action,
  refusal,
  label,
  variant = "outline",
}: DisabledActionButtonProps) {
  const explanation = refusal.explanation ?? DISABLED_REASON_MEANING[refusal.reason];
  return (
    <span className="inline-flex items-center gap-1.5" data-disabled-action={action}>
      <Button
        variant={variant}
        size="sm"
        disabled
        aria-describedby={`why-${action}`}
        title={explanation}
      >
        {label ?? actionLabel(action)}
      </Button>
      {/* The code is what the operator reads; the sentence is the courtesy, and
          it is available to a keyboard and a screen reader without costing a
          table cell the width of a paragraph. */}
      <span id={`why-${action}`} title={explanation}>
        <StateBadge value={refusal.reason} label={refusal.reason} />
        <span className="sr-only">
          {actionLabel(action)} is unavailable: {explanation}
        </span>
      </span>
    </span>
  );
}

/**
 * The same refusal, where there is no control to grey out.
 *
 * For a row that is unavailable as a whole -- a VM whose create Task is still
 * running, a peer that is not enrolled -- the reason is the row's state, and it
 * belongs in the row rather than on a button.
 */
export function DisabledActionNote({
  action,
  refusal,
}: {
  action: string;
  refusal: DisabledAction;
}) {
  const explanation = refusal.explanation ?? DISABLED_REASON_MEANING[refusal.reason];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Ban className="size-3" aria-hidden />
      <span>{actionLabel(action)} unavailable</span>
      <StateBadge value={refusal.reason} label={refusal.reason} />
      <span>{explanation}</span>
    </span>
  );
}
