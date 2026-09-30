/**
 * The form archetype: **a page of its own**.
 *
 * R38 fixes three archetypes and this is the third. R39 says what it is for: a
 * form is a page on its own route, so it is linkable, and *returning* to the list
 * restores the filters, sort and page the operator left. Both halves of that are
 * load-bearing, and the second one is the interesting one.
 *
 * ## It used to be a drawer, and why it is not one now
 *
 * The requirement this archetype was first built for was "do not lose my place",
 * and a side panel over the still-mounted list satisfied it by never unmounting
 * the list: the filters, the sort, the page token and the scroll position were
 * all still there because nothing had been taken away. The person using the
 * running console asked for edit views to be full pages, and R39 and the spec's
 * screen archetypes were amended to say so.
 *
 * So the drawer chrome -- a `role="dialog"`, a fixed right-hand rail, a close
 * cross, the `aside` role -- is gone, and with it the trick it relied on. **The
 * list unmounts, so its state has to be carried rather than retained.** That is
 * not a property the router hands over: a form is reached at an address, and
 * everything the operator was looking at has to be *in* that address, and has to
 * still be in the address the form's way out points at. Which is what
 * `returnTo` is, and why it is required.
 *
 * ## The way out is one address, and the archetype holds it
 *
 * The breadcrumb's first crumb and the Cancel control are the **same `href`**,
 * read from the same required prop. That is not tidiness: three ways out -- the
 * browser's back button, the crumb and Cancel -- have to agree, and the cheapest
 * way to make them agree is for two of them to be literally the same link. A
 * screen that could pass a breadcrumb href and a separate `onClose` callback
 * would be a screen that could put them on different lists, and the failure would
 * only show up to an operator who noticed.
 *
 * Cancel is an anchor rather than a button for the same reason, and for one more:
 * an operator who middle-clicks it opens the list they were on in a new tab, and
 * an operator who copies the link out of it sends a colleague to their own view of
 * the list rather than to page one of an unfiltered one.
 *
 * On a cold deep link there is no list behind the form, and the screen's `returnTo`
 * is a real list anyway -- so the form can always be left, which is the one thing
 * this archetype must never fail to render.
 *
 * ## The measure, and what stands beside it
 *
 * **A field is not allowed to be as wide as the window.** A drawer was 26rem; a
 * page that stretched eight fields to 1600px would be a worse form wearing a
 * bigger hat, because the label and the value would be at opposite ends of the
 * screen and the eye would have to travel to check one against the other. So the
 * field column is capped, and the rest of the width is for a second column the
 * screen supplies: the resource being edited, the Node a guest is being created
 * on, whatever is worth looking at *beside* the form rather than below it. An
 * archetype that capped the measure and offered nothing for the remainder would
 * be a form with a deliberately wasted half of the screen.
 *
 * ## What a screen supplies
 *
 *  - the **nouns' icon**, the title and one line of description.
 *  - **the fields**, and which of them carries which `details` entry.
 *  - the **return address**: the list, as this operator left it. Required.
 *  - the **submit control**, or nothing at all when the contract declares no
 *    operation to submit to (see the edit form, where the save is a
 *    `DisabledActionButton` and `submit` is absent).
 *  - the **failure** from the last attempt, which the page shows as a summary and
 *    the fields show in place.
 *  - anything **destructive**, which belongs in the action row beside Cancel
 *    rather than beside Cancel's opposite end.
 *  - the **second column**, when there is something beside the form worth having.
 *
 * What a screen does *not* supply, because these are the six ways four forms
 * would have differed: the page's own markup, the breadcrumb, the labelled
 * regions, the form element and its submit handling, where the focus goes when a
 * submission is refused, and the layout of the action row.
 *
 * ## Where the focus goes
 *
 * A refused submission moves focus to the first control that carries an error, and
 * to the failure itself when the error names no field. That is the whole reason
 * the fields are marked `aria-invalid` rather than merely coloured, and it is the
 * behaviour a keyboard operator would otherwise have to discover by tabbing
 * through eight fields to find out that one of them was refused.
 */

import { useEffect, useId, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ErrorResponse } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/sovren/link-button";
import { FormFailure } from "@/components/sovren/form/form-failure";

/**
 * The second column's content, and the name of the landmark it sits in.
 *
 * Named rather than anonymous because a landmark an assistive technology cannot
 * distinguish from the form beside it is not a landmark: "the Node this guest is
 * being created on" and "the fields that create it" are two different regions of
 * the page and an operator navigating by region should be able to say which is
 * which.
 */
export interface FormAside {
  label: string;
  content: ReactNode;
}

export interface FormPageProps {
  /** The noun's icon, so this page and the list it was reached from agree. */
  icon: LucideIcon;
  /** What this form is for, in the contract's nouns. A page's `h1`. */
  title: string;
  /** One line. Not a paragraph, and not a reason the form is disabled. */
  description?: ReactNode;
  /**
   * The way out, as a link.
   *
   * A path rather than a callback, and one prop rather than two, because the
   * breadcrumb and the Cancel control are the same anchor to it: an operator
   * leaving a form has to arrive at the list *they* were reading -- their filters,
   * their sort, their page -- and the only way to be sure of that is for the
   * console to hold one address and render it in both places. Making the field
   * required is how a form with no way back is prevented by the type rather than
   * by a review.
   */
  returnTo: { label: string; href: string };
  /**
   * Submit. Called by the submit control and by Enter in a text field.
   *
   * Required when `submit` is present and ignored when it is not, so a form with
   * no operation to submit to (the edit form, because the console has no save
   * wired to this resource) carries no submit control and no handler rather than
   * a dead one.
   */
  onSubmit?: () => void;
  /** The submit control. Omit it and the page has no primary action. */
  submit?: { label: string; busy?: boolean; disabled?: boolean };
  /**
   * The failure from the last attempt.
   *
   * Passed rather than held, so the screen decides when a failure has been
   * answered: retyping a field is not the console's judgement to make, and an
   * error that vanished because a component re-rendered would be an operator
   * being told their problem is gone while it is not.
   */
  failure?: ErrorResponse | undefined;
  /** Anything under the fields: a boundary the form holds to, a caveat. */
  note?: ReactNode;
  /** A destructive action, or anything else belonging in the action row. */
  actions?: ReactNode;
  /** What stands beside the fields on a screen wide enough for a second column. */
  aside?: FormAside;
  children: ReactNode;
}

export function FormPage({
  icon: Icon,
  title,
  description,
  returnTo,
  onSubmit,
  submit,
  failure,
  note,
  actions,
  aside,
  children,
}: FormPageProps) {
  const titleId = useId();
  const form = useRef<HTMLFormElement>(null);

  /**
   * Move the focus to whatever the refusal is about.
   *
   * Keyed on the `requestId`, so it happens once per refusal rather than on
   * every render: an operator correcting a field must not have the focus pulled
   * back to it while they are typing. The control is the *first* marked one in
   * reading order rather than the first one the control plane listed, because an
   * operator who pressed Enter is looking at the top of the form and a form that
   * focuses a field halfway down reads as the form having lost its place.
   */
  useEffect(() => {
    if (failure === undefined) return;
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? form.current?.querySelector<HTMLElement>('[data-form-failure="true"]'))?.focus();
  }, [failure?.requestId]);

  const busy = submit?.busy === true;

  return (
    <section aria-labelledby={titleId} data-page="form" className="flex min-w-0 flex-col gap-3">
      {/*
        The way out, above the fields rather than below them, and shaped like the
        detail archetype's breadcrumb rather than like a panel's close control:
        this is a page, so where it sits in the console is stated the way every
        other page states it. The crumb is the list as the operator left it, and
        Cancel below is the same href.
      */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Link
          to={returnTo.href as never}
          data-breadcrumb="list"
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
        >
          <ChevronLeft className="size-3" aria-hidden />
          {returnTo.label}
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span aria-current="page" className="font-mono text-foreground">
          {title}
        </span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center border border-border bg-muted">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 id={titleId} className="font-heading text-base leading-tight font-medium">
              {title}
            </h1>
            {description !== undefined && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </header>

      {/*
        The two columns. The field column is capped and the aside takes the rest,
        and the aside is not optional on a wide screen: a form that capped its
        measure and left the remainder empty would be telling the operator, with
        layout, that the second half of the window does not exist.
      */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <form
          ref={form}
          noValidate
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (busy || submit?.disabled === true) return;
            onSubmit?.();
          }}
          className="flex w-full min-w-0 flex-col gap-3 lg:max-w-[42rem]"
        >
          {/*
            `noValidate` above, deliberately. The document's constraints are the
            control plane's to enforce and its own words to name them with, and a
            browser's native bubble would stop the request before it was sent --
            which would put `atLeast1` and `nameTaken` permanently out of reach of
            both an operator and a test. See `field.tsx`.
          */}
          {failure !== undefined && <FormFailure error={failure} />}
          {children}
          {note !== undefined && (
            <p className="border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
              {note}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {actions}
            <span className="flex-1" />
            <LinkButton to={returnTo.href as never} variant="outline" size="sm">
              Cancel
            </LinkButton>
            {submit !== undefined && (
              <Button
                type="submit"
                size="sm"
                disabled={busy || submit.disabled === true}
                aria-busy={busy}
              >
                {submit.label}
                {busy && <span className="sr-only"> (working)</span>}
              </Button>
            )}
          </div>
        </form>

        {aside !== undefined && (
          <aside
            aria-label={aside.label}
            data-form-aside="true"
            className="flex w-full min-w-0 flex-col gap-3 lg:max-w-[30rem]"
          >
            {aside.content}
          </aside>
        )}
      </div>
    </section>
  );
}
