/**
 * Toasts, in the present tense.
 *
 * R44: the console never claims completion it has not observed. That rules out
 * the whole family of messages a console reaches for by default -- "VM created",
 * "Task finished", "Node rebooted" -- because each of those asserts an outcome
 * the browser has no way to know about. A create returns a `Task`; the console
 * has observed that a Task was queued and nothing more, so the toast says that.
 *
 * **The check is a warning, not a type.** English is not a type system and a
 * regex cannot decide what a sentence claims. What it can do is catch the
 * specific failure this requirement is about: a past-tense completion claim in a
 * toast title, which is the shape every one of those bad messages takes. So the
 * vocabulary is written out, the title is checked against it, and a message that
 * trips it is still shown -- an operator mid-task is not served a console that
 * swallowed their feedback -- but it is logged loudly enough that nobody ships it
 * believing the console had approved the wording.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "cn";

export type ToastTone = "ok" | "error" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  /** The observed fact behind the title: a latency, a code, a requestId. */
  detail?: string;
}

export interface ToastApi {
  /** Show a toast. `title` must be something that has been observed. */
  report: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Claims of completion, in the past tense.
 *
 * Deliberately a list rather than a pattern, and deliberately short. An
 * over-broad pattern ("ed$") would fire on `queued`, `stopped` and `suspended`,
 * which are all present-tense states sovren is required to say out loud -- and a
 * check that fires on them would push a screen towards silence rather than
 * towards accuracy.
 *
 * So every word here is one whose only sensible use in a toast is a claim that
 * something finished. `stopped` and `cancelled` are deliberately absent: a Task
 * that an operator cancelled *is* in that state, and the console is supposed to
 * be able to say so.
 */
const COMPLETION_CLAIMS = [
  "created",
  "deleted",
  "removed",
  "updated",
  "saved",
  "completed",
  "finished",
  "succeeded",
  "failed",
  "restarted",
  "rebooted",
  "provisioned",
  "connected",
  "uploaded",
  "applied",
  "destroyed",
] as const;

/** Whether a toast title claims an outcome rather than reporting one. */
export const claimsCompletion = (title: string): boolean => {
  const words = title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word !== "");
  return words.some((word) => (COMPLETION_CLAIMS as readonly string[]).includes(word));
};

const TONE_ICON: Record<ToastTone, ReactNode> = {
  ok: <Check className="size-3.5" aria-hidden />,
  error: <AlertTriangle className="size-3.5" aria-hidden />,
  info: <Info className="size-3.5" aria-hidden />,
};

const TONE_CLASS: Record<ToastTone, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-border bg-popover text-foreground",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const report = useCallback(({ tone, title, detail }: Omit<Toast, "id">) => {
    if (claimsCompletion(title)) {
      console.warn(
        `sovren: the toast "${title}" claims a completed outcome. Report what was ` +
          "observed -- a Task that was queued, a test that answered -- rather than a " +
          "result nobody has seen yet.",
      );
    }
    nextId.current += 1;
    const id = `t${String(nextId.current)}`;
    setToasts((current) => [
      ...current,
      { id, tone, title, ...(detail === undefined ? {} : { detail }) },
    ]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ report, dismiss }), [dismiss, report]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        data-testid="toasts"
        className="pointer-events-none fixed right-3 bottom-3 z-60 flex w-80 flex-col gap-1.5"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            data-toast={toast.tone}
            className={cn(
              "pointer-events-auto flex items-start gap-2 border px-3 py-2 text-xs shadow-sm",
              TONE_CLASS[toast.tone],
            )}
          >
            <span className="mt-0.5 shrink-0">{TONE_ICON[toast.tone]}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{toast.title}</span>
              {toast.detail !== undefined && (
                <span className="font-mono text-[11px] opacity-80">{toast.detail}</span>
              )}
            </span>
            <button
              type="button"
              aria-label={`Dismiss: ${toast.title}`}
              onClick={() => {
                dismiss(toast.id);
              }}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** The console's toasts. `null` outside a provider, so a screen cannot crash. */
export const useToast = (): ToastApi =>
  useContext(ToastContext) ?? { report: () => "", dismiss: () => undefined };
