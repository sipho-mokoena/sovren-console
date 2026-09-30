/**
 * The error state: what a failure says, and what the operator can do about it.
 *
 * Three things are non-negotiable here, and they are the whole of ticket 04's
 * half of the console.
 *
 * **The code is rendered, not the message alone.** The console keys off
 * `ErrorCode`, and an operator reporting a problem reports the code because the
 * code is what appears in the audit log under the same `requestId` (R34). A
 * screen showing only a sentence produces a report nobody can trace.
 *
 * **The `requestId` is on screen.** It is the join between what the operator
 * sees and what the audit log holds, and a console that mints errors it cannot
 * show an id for has broken half of R34.
 *
 * **It offers a way to act.** Retry when retrying could work, and the Settings
 * connection test when the failure is one Settings can answer -- because an error
 * state that only reports is a dead end with a code on it.
 */

import { AlertTriangle, Copy, RefreshCw, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ErrorResponse } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/sovren/link-button";
import { StateBadge } from "@/components/sovren/state-badge";
import { CONNECTIONS_CAN_FIX, ERROR_MEANING, isRetryable } from "@/lib/sovren";

export interface ErrorStateProps {
  error: ErrorResponse;
  /** Called by the retry control. Omit it and no retry is offered. */
  onRetry?: () => void;
  /** A retry already in flight. */
  busy?: boolean;
  /** Anything else the screen can offer -- a link to the resource, a form. */
  actions?: ReactNode;
  /** For an error inside a panel rather than filling the page. */
  compact?: boolean;
}

export function ErrorState({
  error,
  onRetry,
  busy = false,
  actions,
  compact = false,
}: ErrorStateProps) {
  const [copied, setCopied] = useState(false);
  const retryable = isRetryable(error);
  const connectionsCanFix = CONNECTIONS_CAN_FIX.has(error.code);

  const copyRequestId = () => {
    void navigator.clipboard?.writeText(error.requestId).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div
      role="alert"
      data-error-code={error.code}
      className={
        compact
          ? "flex flex-col gap-2 border border-destructive/30 bg-destructive/5 p-3"
          : "flex flex-col items-start gap-3 border border-destructive/30 bg-destructive/5 p-4"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge value={error.code} label={error.code} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5" aria-hidden />
          {compact ? "Failed" : "This did not load"}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm text-foreground">{error.message}</p>
        <p className="text-xs text-muted-foreground">{ERROR_MEANING[error.code]}</p>
      </div>

      {error.details !== undefined && error.details.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {error.details.map((detail) => (
            <li key={`${detail.path}:${detail.constraint ?? ""}`} className="flex gap-2">
              <span className="font-mono text-foreground">{detail.path}</span>
              {detail.constraint !== null && detail.constraint !== undefined && (
                <span className="font-mono text-[11px]">{detail.constraint}</span>
              )}
              <span>{detail.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onRetry !== undefined && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={busy}
            // A refusal to retry is a sentence about the request, not a shrug:
            // an operator who pressed it deserves to know why nothing happened.
            {...(retryable ? {} : { title: ERROR_MEANING[error.code] })}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} aria-hidden />
            Try again
          </Button>
        )}
        {connectionsCanFix && (
          <LinkButton to="/settings/connections" variant="outline" size="sm">
            <Wrench aria-hidden />
            Test the connections
          </LinkButton>
        )}
        {actions}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>requestId</span>
        <code className="font-mono text-foreground">{error.requestId}</code>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={copyRequestId}
          aria-label={`Copy the requestId ${error.requestId}`}
        >
          <Copy aria-hidden />
        </Button>
        {copied && <span role="status">Copied</span>}
      </div>
    </div>
  );
}

/**
 * A failure beside data that is still on screen.
 *
 * The distinction the last-updated stamp exists to make (R46): a stale view and
 * a broken one look identical if the only signal is a banner that says
 * something went wrong. So the rows stay, the stamp keeps the time of the *last
 * good* fetch, and the failure is stated as a failure. A refresh that failed is
 * never presented as fresh, and the table is never blanked to prove a point.
 */
export function StaleNotice({
  error,
  updatedAtLabel,
  onRetry,
}: {
  error: ErrorResponse;
  updatedAtLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-stale="true"
      className="flex flex-wrap items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200"
    >
      <StateBadge value={error.code} label={error.code} />
      <span>The last refresh failed. These rows are from {updatedAtLabel}.</span>
      {onRetry !== undefined && (
        <Button variant="ghost" size="xs" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
