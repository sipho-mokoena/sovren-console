/**
 * The failure a form could not attach to a control.
 *
 * `details` are the mutator's to carry and the fields' to render, but an error
 * with no field to point at still has to be shown somewhere: a `404` on the Node,
 * a `409` on a name the estate already uses, a `503` from an upstream that is not
 * answering. So this is the *summary*, and it deliberately does not replace the
 * field-level rendering -- a `400` shows here as a list of `path · constraint` and
 * on each control at once, because an operator scrolling a form reads the control
 * and an operator reporting a problem reads the list.
 *
 * It is not `ErrorState`, and the reason is worth stating: `ErrorState` is a page
 * state, and it offers a retry and a link to the connection test. A form that
 * offered "try again" on `invalid_request` would be teaching an operator that the
 * console is offering them a way to fix a request the control plane will refuse
 * again -- which is exactly the thing `isRetryable` exists to prevent.
 */

import type { ErrorResponse } from "@sovren/client";

import { StateBadge } from "@/components/sovren/state-badge";
import { ERROR_MEANING } from "@/lib/sovren";
import { problemsOf } from "@/components/sovren/form/field";

export interface FormFailureProps {
  error: ErrorResponse;
}

/** What the control plane refused, in its own code, with a traceable id. */
export function FormFailure({ error }: FormFailureProps) {
  const problems = problemsOf(error);
  return (
    <div
      role="alert"
      data-error-code={error.code}
      data-form-failure="true"
      className="flex flex-col gap-1.5 border border-destructive/30 bg-destructive/5 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge value={error.code} label={error.code} />
        <span className="text-xs font-medium text-destructive">{error.message}</span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{ERROR_MEANING[error.code]}</p>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          {problems.map((problem) => (
            <li
              key={`${problem.path}:${problem.constraint ?? ""}`}
              className="flex flex-wrap items-baseline gap-1.5"
            >
              <span className="font-mono text-foreground">{problem.path}</span>
              {problem.constraint !== null && problem.constraint !== undefined && (
                <span className="font-mono">{problem.constraint}</span>
              )}
              <span>{problem.message}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>requestId</span>
        <code className="font-mono text-foreground">{error.requestId}</code>
      </p>
    </div>
  );
}
