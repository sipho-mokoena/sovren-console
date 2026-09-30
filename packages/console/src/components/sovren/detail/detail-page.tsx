/**
 * The detail archetype: breadcrumb, header, identity block, tabs, content.
 *
 * R38 fixes three archetypes, and this is the second. It exists for the reason
 * the list archetype does: a console where a detail page is learned once is a
 * console where an operator can answer a new question without first learning a
 * new screen. So the things every detail page has -- where you came from, what
 * this is, when it was last true, what else there is to see, and the content --
 * are here, and a screen supplies only what is particular to it.
 *
 * ## What a screen supplies
 *
 *  - the **nouns' icon**, so this page and the list it was reached from agree.
 *  - the **identity triple** for the resource the response carried: `id`,
 *    `created`, `updated`, in the contract's own words. Not formatted, not
 *    renamed, not reordered -- see below.
 *  - the **tabs**, each a key, a label and a body. The tab set is the whole of
 *    what "related information lives in one place" (R47) means in code.
 *  - whatever is particular to it: a header action, a warning, the wording of an
 *    empty section.
 *
 * What a screen does *not* supply is the part that matters: no breadcrumb markup,
 * no tab bar, no identity block, no tab-in-URL mechanics, no unknown-tab
 * handling, no pending state, no narrowing of the response, no layout. Those are
 * the ways five detail pages would have differed, and the ways an operator would
 * have had to relearn the console five times.
 *
 * ## The archetype narrows, so no screen can forget to
 *
 * The generated client never throws (R35): a call resolves to a union
 * discriminated on `status`, and a component that reads `data.items` without
 * narrowing does not type-check. `ListPage` is the one place a *list* is narrowed.
 * This is the one place a *single resource* is narrowed, and it happens before
 * anything else renders, which is why a screen cannot ship a detail page that
 * renders `undefined.name` and a screen cannot ship one that quietly shows an
 * empty state where a failure should be.
 *
 * ## The identity block is here, and it is here once
 *
 * R40: every detail page opens with ID, created and updated. It is a property of
 * this archetype rather than a convention, because a convention is a thing a
 * screen can forget and R40 is a thing an operator relies on -- being able to say
 * "this is `nd_01hq2n0001`, and the control plane last touched it at this instant"
 * about anything on any page. A screen that put `created` before `id` would not be
 * a different page; it would be a page nobody could scan, because the eye learns
 * the order once.
 *
 * So `DetailPage` renders it, the same way for every resource, and the only thing a
 * screen contributes is the three values. The block itself is `IdentityBlock` from
 * `properties-table.tsx` -- the same component the Settings detail page already
 * uses, which is the point: "identical on every detail page" is only true if there
 * is only one of it.
 *
 * ## The breadcrumb carries the operator's place back
 *
 * The breadcrumb is not a link to the list. It is a link to *the list as this
 * operator left it*: the filters, the sort and the page token they had are still
 * in this page's URL, because a detail page owns exactly one search parameter
 * (`tab`) and preserves the rest (see `tab-state.ts`). A breadcrumb that dropped
 * them would send an operator back to page one of an unfiltered list, which is one
 * of the commonest ways a console loses somebody's place.
 *
 * ## Heterogeneity is reported, not normalised
 *
 * A screen on this archetype gets no help here and no hindrance: the properties
 * it renders are the ones the contract sent, and a field the estate did not report
 * arrives as `null` or absent and is rendered as its own state by
 * `PropertiesTable`. There is no place in this file where a value could be
 * replaced by a fleet-wide default, and that is what the archetype is responsible
 * for -- not the rendering, which is the properties table's.
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ErrorResponse } from "@sovren/client";

import {
  MockControlPanel,
  useMockControls,
  useSentinelShortcut,
} from "@/components/sovren/mock-controls";
import { IdentityBlock } from "@/components/sovren/properties-table";
import {
  DetailTabList,
  useDetailTab,
  useInheritedSearch,
  type DetailTab,
} from "@/components/sovren/detail/tab-state";
import { formatTimestamp } from "@/lib/format";
import { readOne } from "@/lib/sovren";
import { stringifySovrenSearch } from "@/lib/search-params";

export {
  DetailTabList,
  useDetailTab,
  DETAIL_TAB_PARAM,
} from "@/components/sovren/detail/tab-state";
export type { DetailTab, DetailTabState } from "@/components/sovren/detail/tab-state";

/**
 * The slice of a generated react-query hook's result that the archetype reads.
 *
 * The same shape `ListPage` takes, and for the same reason: structural, so
 * `useNodeView(...)`'s result satisfies it as it stands and a screen cannot hand
 * it a hand-written fetcher that skipped the generated hook. Declared here rather
 * than imported so neither archetype depends on the other's file.
 */
export interface DetailQuery {
  /** The response union the generated hook resolved to. `undefined` while pending. */
  readonly data: unknown;
  readonly isPending: boolean;
  /**
   * Re-run the request.
   *
   * Required rather than optional because the archetype refetches when the estate or
   * the sentinel changes, and a generated hook's result always has one. A detail page
   * that ignored those controls would leave an operator looking at the fleet estate
   * with a control reading `compact`.
   */
  readonly refetch: () => void;
}

/**
 * What the screen builds from the resource the response carried.
 *
 * A function rather than a node, because the resource is not known until the
 * response has been narrowed, and the narrowing is the archetype's job. The
 * function runs only once, on the success arm.
 */
export interface DetailView {
  /** The resource's name, or any short handle the header shows. */
  title: string;
  /** One clause about what this resource is, if the name does not say it. */
  description?: ReactNode;
  /** R40. The three values, as the contract sent them. */
  identity: { id: string; created: string; updated: string };
  /** The tabs, in the order they are read. The first is the default. */
  tabs: readonly DetailTab[];
  /** Actions beside the title. A disabled action explains itself here. */
  actions?: ReactNode;
  /** Anything the page needs to say above the tabs: a heterogeneity notice, a warning. */
  banner?: ReactNode;
}

export interface DetailPageProps<T> {
  /** The generated hook's result, untouched. */
  query: DetailQuery;
  /** The noun's icon, so this page and the list it was reached from agree. */
  icon: LucideIcon;
  /**
   * Where the operator came from.
   *
   * `to` is the list's path. The list's own parameters are *not* supplied: the
   * archetype reads them out of the URL this page was reached with and carries
   * them onto the crumb, so a screen cannot forget to and cannot get it wrong.
   */
  breadcrumb: { label: string; to: string };
  /** The header and the tabs, built from the resource. Runs on the success arm. */
  children: (resource: T) => DetailView;
  /** The failure, rendered in place of the whole page. */
  error?: (error: ErrorResponse) => ReactNode;
  /** The accessible name of the page's region. Defaults to the resource's title. */
  label?: (resource: T) => string;
}

/**
 * A detail page.
 *
 * The states are the four the list archetype has, and they are the same four
 * because they are the same question -- has anything arrived, and can it be
 * believed. A detail page that added a fifth ("the resource loaded but a section
 * did not") would be a page where the section's own error state is the only
 * honest thing on it, so a section carries its own and the page carries the
 * resource's.
 */
export function DetailPage<T>(props: DetailPageProps<T>) {
  const read = readOne<T>(props.query.data);

  /**
   * The success arm is a component, and that is a structural decision rather than
   * tidiness.
   *
   * The tab bar needs the resource -- the tab set is one of the things a screen
   * builds from it -- and it needs a hook to read the tab out of the URL. A hook
   * cannot be called after an early return, so a single component would have to
   * either call the hook with a tab set that does not exist yet or hoist the
   * narrowing above the hook. Splitting the arm is the version where neither is
   * true: the tab bar is mounted exactly when there is a resource for it, and the
   * hook is called with the real tab set every time.
   */
  if (read.kind === "pending") return <PendingDetail />;
  if (read.kind === "error") return props.error?.(read.error) ?? null;
  return <LoadedDetail {...props} resource={read.value} />;
}

function LoadedDetail<T>({
  query,
  icon: Icon,
  breadcrumb,
  children,
  label,
  resource,
}: DetailPageProps<T> & { resource: T }) {
  const view = children(resource);
  const state = useDetailTab(view.tabs);
  const active = view.tabs.find((tab) => tab.key === state.active) ?? view.tabs[0];

  /**
   * The mock backend's controls, and the shortcut that cycles the sentinel.
   *
   * The list archetype carries them, and a detail page that did not would be a page
   * an operator cannot reach a failure from: they would have to go back to a list,
   * remember the sentinel, come back, and lose the tab they were on. R56 asks for a
   * failure path the operator can reproduce, and a screen that cannot be sent to a
   * failing backend has taken that away for half the console.
   *
   * **Which is also why the estate control has to refetch.** The query key knows
   * nothing about which estate the backend is serving -- the generated hooks take
   * the parameters the document declares, and the document declares neither -- so
   * switching estate is a changed backend and the refetch is explicit, exactly as it
   * is on a list. Without it, choosing `compact` on a detail page would leave the
   * fleet estate's machines on screen with a control saying otherwise.
   */
  const controls = useMockControls();
  useSentinelShortcut(controls.cycleSentinel);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    query.refetch();
    // The controls are the trigger; the query is read fresh each render.
  }, [controls.estate, controls.sentinel, query.refetch]);

  return (
    <section
      aria-label={label?.(resource) ?? view.title}
      data-detail="true"
      className="flex min-w-0 flex-col gap-2"
    >
      <DetailBreadcrumb label={breadcrumb.label} to={breadcrumb.to} />

      {/**
       * The name, what can be done to it, and what this build is serving, on one
       * line. The mock controls used to be a row of their own under the identity
       * block, which is a full line of chrome separating the page's title from its
       * tabs for a control panel that only exists in the prototype.
       */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center border border-border bg-muted">
            <Icon className="size-3.5" aria-hidden />
          </span>
          <h1 className="font-heading text-base leading-tight font-medium">{view.title}</h1>
          {view.description !== undefined && (
            <p className="min-w-0 truncate text-xs text-muted-foreground">{view.description}</p>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {view.actions !== undefined && (
            <div className="flex items-center gap-2">{view.actions}</div>
          )}
          <MockControlPanel controls={controls} />
        </div>
      </header>

      {/* R40. Rendered here, once, for every detail page in the console. */}
      <IdentityBlock
        id={view.identity.id}
        created={formatTimestamp(view.identity.created)}
        updated={formatTimestamp(view.identity.updated)}
      />

      {view.banner}

      {state.unknown && (
        <p
          data-unknown-tab="true"
          className="border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
        >
          This address names a tab that is not on this page, so the first one is showing.
        </p>
      )}

      <DetailTabList tabs={view.tabs} state={state} label={`${view.title} tabs`} />

      <div data-tab-panel={active?.key ?? ""} className="flex min-w-0 flex-col gap-3">
        {active?.description !== undefined && (
          <p className="text-xs text-muted-foreground">{active.description}</p>
        )}
        {active?.content}
      </div>
    </section>
  );
}

/**
 * The way back, with the operator's filters, sort and page still on it.
 *
 * A composed path rather than one of the router's literal routes, because the
 * crumb has to carry the list's parameters and a literal route cannot. The
 * parameters are read from the current URL rather than passed in, so a screen has
 * nothing to forget: whatever the operator had on the list is in the address bar
 * of the detail page by the time they are reading it, because opening a row
 * navigated with them.
 *
 * The tab parameter is dropped, because the tab belongs to this page and not to
 * the list -- leaving it on would ask the list for a tab it does not have.
 */
function DetailBreadcrumb({ label, to }: { label: string; to: string }) {
  const state = useInheritedSearch();
  const search = stringifySovrenSearch(state);
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-[11px] text-muted-foreground"
    >
      <Link
        // Composed at runtime from a list's parameters, so it cannot be one of the
        // router's literal paths at compile time. The router resolves it at render,
        // so the crumb stays a client-side navigation.
        to={`${to}${search}` as never}
        data-breadcrumb="list"
        className="hover:underline"
      >
        {label}
      </Link>
      <ChevronRight className="size-3" aria-hidden />
      <span className="font-mono text-foreground">this resource</span>
    </nav>
  );
}

/** The default pending state: a resource's shape, held still. */
function PendingDetail() {
  return (
    <div data-loading="true" aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
      <div className="h-6 w-56 animate-pulse bg-muted" />
      <div className="h-6 w-full animate-pulse bg-muted/60" />
      <div className="h-24 w-full animate-pulse bg-muted/40" />
    </div>
  );
}
