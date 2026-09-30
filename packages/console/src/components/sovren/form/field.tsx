/**
 * The form archetype's fields, and how a field is told what it got wrong.
 *
 * R38 fixes three archetypes and this is the third, so it exists for the reason
 * the other two do: the parts every form has are written once. What is *not* here
 * is worth as much as what is -- no `<form>` tag, no error banner, no submit
 * button, no mutation, no toast, no navigation. Those are in `form-page.tsx` and
 * in the screen, and the reason is that each of them is a decision a screen makes
 * rather than a fact about forms.
 *
 * ## The one rule in this file
 *
 * **A validation error goes on the control that caused it, and it names the
 * constraint.** The contract sends a `400 invalid_request` carrying
 * `details: [{path, constraint, message}]`, `path` is a dotted path to the field,
 * and `constraint` is a closed vocabulary -- `atLeast1`, `nameTaken`,
 * `unsupportedCpuModel` -- rather than a sentence. So:
 *
 *  - `problemFor(error, "cores")` finds the one detail addressed to `cores`. The
 *    screen asks for it by field name and hands it to the field; nothing
 *    re-derives it, so the control that shows the error and the control the
 *    operator typed into cannot disagree about which one it was.
 *  - the field renders the `constraint` in its own right, in monospace, next to
 *    the control, and puts both in the control's accessible description. A
 *    sentence alone is a courtesy; a sentence with no code is a form that cannot
 *    be matched to a log line, and a code alone is a form nobody can act on.
 *  - `aria-invalid` goes on the control and `aria-describedby` points at the
 *    problem text, so the error reaches a keyboard user and a screen reader
 *    without either of them having to see the colour.
 *
 * **The alternative is the failure this file exists to prevent**: dropping
 * `details` and painting the whole form red, which tells an operator that
 * something is wrong and nothing about what to change.
 *
 * ## Why a field does not pre-empt the control plane
 *
 * No `min`, no `required`, no pattern attribute on the controls. The document's
 * constraints are the control plane's to enforce and its own words to describe
 * them with, and a browser's native bubble would stop the request from ever
 * being sent -- which would make `atLeast1`, `atLeast536870912`, `pattern` and
 * `nameTaken` four constraints no operator could ever see named, and four that a
 * test could not reach. So the controls are marked `aria-required` (which is
 * information) and are otherwise permissive, and the 400 comes back and lands
 * where it belongs.
 */

import { useId } from "react";
import type { ReactNode } from "react";
import type { ErrorDetail, ErrorResponse } from "@sovren/client";
import { cn } from "cn";

import { Input } from "@/components/ui/input";

/**
 * One violated constraint, addressed to a field.
 *
 * The contract's own `ErrorDetail`, not a shape invented here. A field that
 * accepted a console-specific problem would need a conversion at every call site,
 * and the conversion is where a `constraint` gets dropped.
 */
export type FieldProblem = ErrorDetail;

/** Every field-level detail an error carries, or none. */
export const problemsOf = (error: ErrorResponse | undefined | null): readonly FieldProblem[] =>
  error?.details ?? [];

/**
 * Whether a detail's `path` addresses a field.
 *
 * Exact first, then the tail of a dotted path. The mock backend sends `"cores"`;
 * a control plane that names the request body would send `"body.cores"`, and both
 * are the same control as far as an operator is concerned. A path is never
 * compared case-insensitively: the field names in a form are the document's own
 * spelling, and a near-miss is a bug worth seeing rather than smoothing over.
 */
const addresses = (path: string, field: string): boolean =>
  path === field || path.endsWith(`.${field}`);

/** The one detail addressed to `field`, or `undefined` when there is none. */
export const problemFor = (
  error: ErrorResponse | undefined | null,
  field: string,
): FieldProblem | undefined => problemsOf(error).find((detail) => addresses(detail.path, field));

/** Whether an error carries a detail for any of these fields. */
export const hasProblemFor = (
  error: ErrorResponse | undefined | null,
  fields: readonly string[],
): boolean => fields.some((field) => problemFor(error, field) !== undefined);

/**
 * What a field hands to its control.
 *
 * A render function rather than a child node, because a field cannot put
 * `aria-invalid` on a control it did not create: it does not know whether the
 * control is an `input`, a `select` or something with a role on it, and cloning an
 * arbitrary child to inject attributes is how a form ends up with two `id`s. The
 * field mints the id and the wiring, and the control decides what to do with them.
 */
export interface FieldControl {
  readonly id: string;
  readonly "aria-describedby": string | undefined;
  readonly "aria-invalid": true | undefined;
  readonly "aria-required": true | undefined;
}

export interface FormFieldProps {
  /** The field's name, in the document's own words. */
  label: string;
  /** One line saying what the control wants. Not a paragraph. */
  hint?: ReactNode;
  /** Marks the control required for assistive technology. See the file's note. */
  required?: boolean;
  /** The detail addressed to this field, from `problemFor`. */
  problem?: FieldProblem | undefined;
  /** The control, given the wiring this field owns. */
  children: (control: FieldControl) => ReactNode;
}

/** A labelled control, and the one error that belongs to it. */
export function FormField({ label, hint, required = false, problem, children }: FormFieldProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const hintId = hint === undefined ? undefined : `${base}-hint`;
  const problemId = problem === undefined ? undefined : `${base}-problem`;
  const describedBy =
    [hintId, problemId].filter((entry): entry is string => entry !== undefined).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1" data-field={label}>
      <label htmlFor={controlId} className="text-xs font-medium">
        {label}
        {/* A visible marker, and nothing more: `aria-required` on the control is
            what a screen reader announces, so a second "required" in the label
            text would be the same word twice. */}
        {required && (
          <span aria-hidden className="text-destructive">
            {" "}
            *
          </span>
        )}
      </label>
      {children({
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": problem === undefined ? undefined : true,
        "aria-required": required ? true : undefined,
      })}
      {hint !== undefined && (
        <p id={hintId} className="text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
      {problem !== undefined && <FieldProblemNote id={problemId as string} problem={problem} />}
    </div>
  );
}

/**
 * The constraint, then the sentence.
 *
 * Code first because it is the part that transfers: `atLeast1` is the same word
 * in the audit log, in a `400` on the wire and here, whereas the sentence is the
 * control plane being helpful in one place. Both are rendered because an operator
 * acting on the second usually needs the first, and an operator reporting a
 * problem can only quote the first.
 */
function FieldProblemNote({ id, problem }: { id: string; problem: FieldProblem }) {
  return (
    <p
      id={id}
      data-field-error={problem.path}
      data-constraint={problem.constraint ?? ""}
      className="flex flex-wrap items-baseline gap-1.5 text-[11px] leading-snug text-destructive"
    >
      {problem.constraint !== null &&
        problem.constraint !== undefined &&
        problem.constraint !== "" && <span className="font-mono">{problem.constraint}</span>}
      <span>{problem.message}</span>
    </p>
  );
}

/** The styling a native `<select>` shares with `Input`, kept in one place. */
const CONTROL_CLASS =
  "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  required?: boolean;
  problem?: FieldProblem | undefined;
  placeholder?: string;
  type?: "text" | "number";
  /** A unit shown inside the control's right edge, e.g. `MiB`. Never implicit. */
  unit?: string;
  disabled?: boolean;
  /** Passed to the control, for anything the archetype does not name. */
  autoComplete?: string;
}

/** A labelled text or number control. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  required = false,
  problem,
  placeholder,
  type = "text",
  unit,
  disabled = false,
  autoComplete,
}: TextFieldProps) {
  return (
    <FormField
      label={label}
      {...(hint === undefined ? {} : { hint })}
      required={required}
      {...(problem === undefined ? {} : { problem })}
    >
      {(control) => (
        <div className={cn("relative", unit !== undefined && "flex items-center gap-1.5")}>
          <Input
            {...control}
            type={type}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            {...(autoComplete === undefined ? {} : { autoComplete })}
            className={cn(unit !== undefined && "pr-12")}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          {unit !== undefined && (
            <span className="pointer-events-none absolute right-2 font-mono text-[11px] text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      )}
    </FormField>
  );
}

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T | "";
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  hint?: ReactNode;
  required?: boolean;
  problem?: FieldProblem | undefined;
  /** The prompt shown while nothing is chosen. Required, for a required field. */
  placeholder: string;
  disabled?: boolean;
}

/**
 * A labelled choice from a closed vocabulary.
 *
 * A native `<select>` rather than a design-system one, for a reason that is about
 * the contract rather than about taste: every choice here comes from a generated
 * enum, and a native select is a single control an operator can open and read the
 * whole of at once. The bare-VM boundary means a create form has eight fields, not
 * eighty, and a listbox with a search field would be a control for a list of
 * three.
 */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  required = false,
  problem,
  placeholder,
  disabled = false,
}: SelectFieldProps<T>) {
  return (
    <FormField
      label={label}
      {...(hint === undefined ? {} : { hint })}
      required={required}
      {...(problem === undefined ? {} : { problem })}
    >
      {(control) => (
        <select
          {...control}
          className={CONTROL_CLASS}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value as T);
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
