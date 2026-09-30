/**
 * The tab, in the URL.
 *
 * R47 asks for a detail page with tabs, and R41 asks for state to live in routes
 * and URL parameters rather than in a store. Together they mean one thing the
 * operator can rely on: **the page and the specific tab are both linkable.** A
 * colleague can be sent to "the peers tab of that node" and arrive on the peers
 * tab of that node, rather than on the overview having to click once.
 *
 * So the tab is a search parameter, and this is the only module in the console
 * that reads or writes it. Two readers of one parameter cannot disagree, which is
 * the property that matters: the tab bar marks what is showing, the sections
 * decide what to render, and both are reading the same string.
 *
 * ## The detail page owns exactly one parameter
 *
 * **`tab`, and nothing else.** Everything else in a detail page's URL belongs to
 * the list the operator arrived from, and the breadcrumb carries it back
 * verbatim. That is a deliberate and load-bearing boundary, and it is why a
 * section inside a tab cannot own `?q=`, `?sort=` or `?page=`:
 *
 *  - if the tab's own table wrote `page`, switching tabs would carry one list's
 *    opaque token to a different list, and the token names a row in a list that
 *    no longer exists;
 *  - if the tab's own table wrote `q`, it would overwrite the filter the operator
 *    applied on the list they came from, and the breadcrumb would return them to
 *    a different view than the one they left.
 *
 * So a tab renders what the backend returns for the document's default page size,
 * and when the backend says there is more, `DetailTable` says so in words and
 * links to the full list. A section that wants a filter wants its own route.
 *
 * ## An unknown tab is the first tab, and it says so
 *
 * A URL naming a tab this page does not have is a link that has drifted -- the
 * page changed, or the link was written by hand. It resolves to the first tab and
 * reports itself as unknown, so a screen can put a line in front of the operator
 * rather than leaving a tab bar with nothing marked current. Silently showing the
 * overview would be a screen failing quietly, which is the one behaviour this
 * console is not willing to ship.
 */

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useSearch } from "@tanstack/react-router";

import { stringifySovrenSearch } from "@/lib/search-params";

/** The one search parameter a detail page owns. */
export const DETAIL_TAB_PARAM = "tab";

export interface DetailTab {
  /**
   * The value written to the URL.
   *
   * Stable, and never derived from the label: renaming a tab must not break the
   * links to it, exactly as renaming a resource must not break its id (R32).
   */
  key: string;
  /** The noun, in the contract's own words. */
  label: string;
  /** One line saying what this tab answers. Not a paragraph. */
  description?: ReactNode;
  /** How many rows the tab holds, when the screen already knows it. */
  count?: number;
  /**
   * The tab's body.
   *
   * A node rather than a render function, so a section's hooks only run when the
   * section is actually placed in the tree. A page that fetched the peers of
   * every node an operator ever opened would be paying for tabs nobody looked at,
   * and a page that renders a hidden section's markup is a page whose tab count
   * and tab content can disagree.
   */
  content: ReactNode;
}

export interface DetailTabState {
  /**
   * The tab in the URL, resolved to one this page has.
   *
   * Always a key from the tab set, so a caller can index with it and cannot be
   * handed a string that is not there.
   */
  readonly active: string;
  /** The URL named a tab this page does not have, and the first one is showing. */
  readonly unknown: boolean;
  /**
   * The address of one tab, with every other parameter preserved.
   *
   * A path rather than a navigate callback, so a tab is an anchor: middle-click,
   * open in a new tab and the browser's back button all work on it, and a test
   * can assert the URL without driving a click. The tab bar is built from this
   * and from nothing else.
   */
  readonly hrefFor: (key: string) => string;
}

/**
 * The current search, as strings.
 *
 * Read loosely, for the same reason `useListState` does: nothing in this module
 * filters, so the console's own `?estate=` and `?sentinel=` survive every
 * navigation between a list and a detail page -- which is what makes a failure
 * reproducible by link rather than by memory (R56).
 */
const searchOf = (raw: Record<string, unknown>): Record<string, string> => {
  const search: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") search[name] = value;
  }
  return search;
};

/** Where a detail page is, and which tab of it is showing. */
export const useDetailTab = (tabs: readonly DetailTab[]): DetailTabState => {
  const location = useLocation();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;

  const search = useMemo(() => searchOf(raw), [raw]);
  const requested = search[DETAIL_TAB_PARAM];

  /**
   * The current search without the tab.
   *
   * The breadcrumb's payload: the list the operator arrived from is identified by
   * its own parameters, and this is the set of them. A crumb that has to be handed
   * this by the screen is a crumb a screen can forget.
   */
  const inherited = useMemo(() => {
    const { [DETAIL_TAB_PARAM]: _tab, ...everything } = search;
    return everything;
  }, [search]);

  const known = tabs.find((tab) => tab.key === requested);
  const active = known ?? tabs[0];

  const hrefFor = useCallback(
    (key: string) =>
      `${location.pathname}${stringifySovrenSearch({ ...inherited, [DETAIL_TAB_PARAM]: key })}`,
    [inherited, location.pathname],
  );

  return {
    active: active?.key ?? "",
    unknown: requested !== undefined && known === undefined,
    hrefFor,
  };
};

/**
 * The parameters this page was reached with, minus the tab.
 *
 * Exported because a list needs the same set for the *other* direction: a row's
 * identity cell has to carry the operator's filters, sort and page onto the detail
 * page, or the breadcrumb arrives with nothing to carry back. Reading it in one
 * place is what makes the round trip symmetric -- a list that sent `q` and a crumb
 * that dropped it would be a detail page that could not be returned from intact.
 */
export const useInheritedSearch = (): Record<string, string> => {
  // `strict: false` because a route validator would replace the search object with
  // what it returned, and the console's own `?estate=` and `?sentinel=` are in no
  // validator. Reading loosely is what lets an operator reproduce a failure by link
  // (R56), and what lets a row carry the list's `q`, `sort` and `page` with it.
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const search: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (name === DETAIL_TAB_PARAM) continue;
    if (typeof value === "string" && value !== "") search[name] = value;
  }
  return search;
};

export interface DetailTabListProps {
  tabs: readonly DetailTab[];
  /** From `useDetailTab`. */
  state: DetailTabState;
  /** The noun, for the navigation's accessible name: "Node tabs". */
  label: string;
  /** What each tab holds is already known; the number belongs beside the noun. */
  showCounts?: boolean;
}

/**
 * The tab bar.
 *
 * A `nav` of links rather than a row of buttons, for the reason `hrefFor` returns
 * a path: a tab the operator can copy out of the address bar is a tab the console
 * can be asked about. `aria-current` marks the one showing, which is what a screen
 * reader announces and what a test asserts -- so "the tab is in the URL" is checked
 * by the same markup that makes it navigable.
 */
export function DetailTabList({ tabs, state, label, showCounts = true }: DetailTabListProps) {
  return (
    <nav
      aria-label={label}
      data-tabs="true"
      className="flex flex-wrap items-center gap-1 border-b border-border"
    >
      {tabs.map((tab) => {
        const current = tab.key === state.active;
        return (
          // The href is composed at runtime from a tab key the screen supplies, so
          // it cannot be one of the router's literal paths at compile time. The
          // router still resolves it at render, which is what keeps a tab a
          // client-side navigation rather than a page load -- a full reload would
          // throw away the query cache and flash the whole console.
          <Link
            key={tab.key}
            to={state.hrefFor(tab.key) as never}
            data-tab={tab.key}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "-mb-px border-b-2 border-foreground px-2.5 py-1.5 text-xs font-medium text-foreground"
                : "-mb-px border-b-2 border-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            {tab.label}
            {showCounts && tab.count !== undefined && (
              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
