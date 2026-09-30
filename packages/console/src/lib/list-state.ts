/**
 * A list's state, in the URL.
 *
 * R41: state lives in routes and URL parameters, not in a global store. So a
 * filtered, sorted, paginated view is a link, survives a reload, and the back
 * button returns to the previous view -- which is not a convenience, it is the
 * only way an operator can hand a colleague "the page I am looking at".
 *
 * ## Why the search is read loosely
 *
 * `useSearch({ strict: false })` rather than a per-route `validateSearch`. A
 * route validator is also a *filter*: TanStack Router replaces the search object
 * with what the validator returned, so a list that validated `q` and `size`
 * would drop the console's own `estate` and `sentinel` from the URL the first
 * time anyone clicked a filter -- and those two are the only way to reproduce a
 * failure in the dev server (R56). Reading and writing the search loosely keeps
 * every key the list does not own, and this hook is the only place that reads
 * the list's own keys, so they still have one meaning per screen.
 *
 * ## Why the page token needs a memory the URL does not hold
 *
 * `nextPage` is opaque on purpose (R33). The console cannot construct one, and
 * it cannot invert one, so "the previous page" is not derivable from the current
 * URL -- it is a thing the operator did. The back stack below is that memory:
 * it records the tokens the operator passed *through*, keyed by the filters they
 * were passed through with, and it is deliberately not part of the view state.
 * A shared link is a link to one page, which is what a link should be.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

/** The document's default, mirrored so the console never has to guess it. */
export const DEFAULT_PAGE_SIZE = 25;

/** The document's maximum, and the ceiling of the size control. */
export const MAX_PAGE_SIZE = 200;

/** A sort written in the URL as `key` for ascending and `-key` for descending. */
export interface ListSort {
  readonly key: string;
  readonly direction: "asc" | "desc";
}

export interface ListState {
  /** The list's own search parameters, as strings. Empty means unset. */
  /**
   * The filters this list owns, as the URL carries them.
   *
   * A value is `string[]` when the key is repeated, which is how a question with
   * more than one answer is asked: `?purpose=infrastructure&purpose=service` is
   * the estate's own machines. Flattening a repeated key to its last value would
   * make that question unaskable and quietly answer a different one.
   */
  readonly search: Readonly<Record<string, string | readonly string[]>>;
  /** The opaque token for the page on screen. `null` on the first page. */
  readonly token: string | null;
  readonly size: number;
  readonly sort: ListSort | null;
  /**
   * The page number, or `null` when the console cannot know it.
   *
   * A deep link to the middle of a list carries one token and no history, and an
   * opaque token cannot be counted. Rendering "Page 1" there would be a lie the
   * operator can check, so the bar says nothing instead.
   */
  readonly pageNumber: number | null;
  readonly canGoBack: boolean;
  readonly isFirstPage: boolean;
  /** Set or clear search parameters. An empty value removes the key. */
  readonly setParams: (
    changes: Readonly<Record<string, string | readonly string[] | null>>,
  ) => void;
  /** Remove every parameter this list owns, keeping the rest of the URL. */
  readonly clearParams: () => void;
  /** Sort by a key, flip an existing sort, or clear it on a third press. */
  readonly toggleSort: (key: string) => void;
  /** Back to the first page, through the same filters. */
  readonly goFirst: () => void;
  /** Forward to the token the server just handed out. */
  readonly goNext: (nextToken: string) => void;
  /** Back to the token this list was on before the last `goNext`. */
  readonly goBack: () => void;
}

export interface ListStateOptions {
  /**
   * Identifies the list, so two lists in one scope keep separate page memories.
   * Include everything that is not a search parameter -- the route, and the Site
   * a Site scope is looking at.
   */
  readonly key: string;
  /** The search parameters this list owns. Everything else in the URL is left alone. */
  readonly owned: readonly string[];
  /** The sort keys a screen can offer, so an unknown key in a URL is ignored. */
  readonly sortable: readonly string[];
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * A filter value as the URL carries it: one value, or several.
 *
 * A repeated key is a list of answers to one question, not a last-wins race.
 * `?purpose=infrastructure&purpose=service` means both, and a console that kept
 * only the second would show an operator a list of Dokploy hosts and call it the
 * estate's own machines.
 *
 * Order is normalised on read, so `a,b` and `b,a` are the same filter and hash to
 * the same history key -- otherwise pressing back after re-ordering a filter would
 * land on a page the operator believes they have already seen.
 */
const oneOrMany = (value: unknown): string | readonly string[] | undefined => {
  if (Array.isArray(value)) {
    const many = value.filter(
      (entry): entry is string => typeof entry === "string" && entry !== "",
    );
    if (many.length === 0) return undefined;
    return [...new Set(many)].sort();
  }
  return str(value);
};

const int = (value: unknown, fallback: number, max: number): number => {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const readSort = (raw: string | undefined, sortable: readonly string[]): ListSort | null => {
  if (raw === undefined) return null;
  const descending = raw.startsWith("-");
  const key = descending ? raw.slice(1) : raw;
  if (!sortable.includes(key)) return null;
  return { key, direction: descending ? "desc" : "asc" };
};

/** Where the back stack for one list and one set of filters is remembered. */
const HISTORY_PREFIX = "sovren:page-history";

interface History {
  /** The token the operator is on, so a stale memory can be told from a live one. */
  readonly token: string;
  /** Tokens already passed through, oldest first. `""` is the first page. */
  readonly back: readonly string[];
}

const historyKey = (
  key: string,
  filters: Readonly<Record<string, string | readonly string[]>>,
): string => `${HISTORY_PREFIX}:${key}:${JSON.stringify(filters)}`;

const readHistory = (storageKey: string, token: string): History => {
  try {
    const raw = globalThis.sessionStorage?.getItem(storageKey);
    if (raw === null || raw === undefined) return { token, back: [] };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { token, back: [] };
    const { token: seen, back } = parsed as { token?: unknown; back?: unknown };
    if (seen !== token || !Array.isArray(back)) return { token, back: [] };
    return { token, back: back.filter((entry): entry is string => typeof entry === "string") };
  } catch {
    // A browser with storage disabled, or a value another version wrote. Either
    // way the operator loses the back button, not the page.
    return { token, back: [] };
  }
};

const writeHistory = (storageKey: string, history: History): void => {
  try {
    globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(history));
  } catch {
    // As above: no storage means no back stack, and nothing else changes.
  }
};

/**
 * The URL state of one list.
 *
 * The screen owns the mapping from these values to its generated hook's
 * parameters -- five lines, and the generated parameter type is what catches a
 * filter the operation does not declare. This hook owns the mechanics, so that
 * four lists cannot each invent their own idea of what "back" means.
 */
export const useListState = ({ key, owned, sortable }: ListStateOptions): ListState => {
  const navigate = useNavigate();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;

  const search: Record<string, string | readonly string[]> = {};
  for (const name of owned) {
    const value = oneOrMany(raw[name]);
    if (value !== undefined) search[name] = value;
  }

  const token = str(search["page"]) ?? null;
  const size = int(search["size"], DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const sortRaw = str(search["sort"]);
  const sort = readSort(sortRaw, sortable);

  /**
   * The filters a page token belongs to.
   *
   * `page` and `sort` are excluded: the token moves the window, and the sort
   * reorders what is inside it, so neither changes *which list* the token is a
   * position in. Two views of the same list share a back stack, which is what an
   * operator expects after re-sorting a page and pressing back.
   */
  const filters: Record<string, string | readonly string[]> = {};
  for (const [name, value] of Object.entries(search)) {
    if (name === "page" || name === "sort") continue;
    filters[name] = value;
  }

  const storageKey = historyKey(key, filters);
  const history = useMemo(() => readHistory(storageKey, token ?? ""), [storageKey, token]);
  const pageNumber = history.back.length > 0 ? history.back.length + 1 : null;

  const write = useCallback(
    (changes: Readonly<Record<string, string | readonly string[] | null>>) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous };
          for (const [name, value] of Object.entries(changes)) {
            if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
              delete next[name];
            } else {
              next[name] = value;
            }
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setParams = useCallback(
    (changes: Readonly<Record<string, string | readonly string[] | null>>) => {
      // Any change of filter invalidates the window: a token names a row in a
      // list that no longer exists, and the backend refuses such a token rather
      // than silently showing the wrong page.
      write({ ...changes, page: null });
    },
    [write],
  );

  const clearParams = useCallback(() => {
    const cleared: Record<string, string | null> = {};
    for (const name of owned) cleared[name] = null;
    write(cleared);
  }, [owned, write]);

  const toggleSort = useCallback(
    (sortKey: string) => {
      const current = readSort(sortRaw, sortable);
      if (current === null || current.key !== sortKey) write({ sort: sortKey, page: null });
      else if (current.direction === "asc") write({ sort: `-${sortKey}`, page: null });
      else write({ sort: null, page: null });
    },
    [sortRaw, sortable, write],
  );

  const goFirst = useCallback(() => {
    writeHistory(storageKey, { token: "", back: [] });
    write({ page: null });
  }, [storageKey, write]);

  const goNext = useCallback(
    (nextToken: string) => {
      writeHistory(storageKey, { token: nextToken, back: [...history.back, token ?? ""] });
      write({ page: nextToken });
    },
    [history.back, storageKey, token, write],
  );

  const goBack = useCallback(() => {
    const back = [...history.back];
    const previous = back.pop() ?? "";
    writeHistory(storageKey, { token: previous, back });
    write({ page: previous === "" ? null : previous });
  }, [history.back, storageKey, write]);

  return {
    search,
    token,
    size,
    sort,
    pageNumber,
    canGoBack: history.back.length > 0,
    isFirstPage: token === null,
    setParams,
    clearParams,
    toggleSort,
    goFirst,
    goNext,
    goBack,
  };
};

/**
 * Apply a list's sort to the rows it is showing.
 *
 * A copy is returned rather than the array being sorted in place, because the
 * rows come out of the query cache and a component that mutates its cache is a
 * bug that appears on the *next* screen.
 *
 * `localeCompare` with numeric collation because a dense table of names is
 * compared by eye, and `desk-10` sorting before `desk-9` is a sort nobody
 * accepts.
 */
export const sortRows = <TRow>(
  rows: readonly TRow[],
  sort: ListSort | null,
  value: (row: TRow) => string | number,
): TRow[] => {
  if (sort === null) return [...rows];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
    return String(a).localeCompare(String(b), "en", { numeric: true }) * factor;
  });
};

/**
 * One filter value, when the question has one answer.
 *
 * `ListState.search` admits a repeated key because some questions have more than
 * one answer. A screen whose filter is single-valued should not have to
 * re-narrow at every use, and should not be able to render `[object Object]` if it
 * forgets. A repeated key read as a single value takes the first, which is the
 * only honest choice: a filter rail that allows one selection at a time cannot
 * have produced two.
 */
export const single = (
  search: Readonly<Record<string, string | readonly string[]>>,
  name: string,
): string | undefined => {
  const value = search[name];
  if (value === undefined) return undefined;
  // `readonly string[]` narrows to `readonly string[]` under Array.isArray in
  // some lib combinations; the index is read through a local so the element type
  // is a plain string either way.
  return Array.isArray(value) ? [...(value as readonly string[])][0] : (value as string);
};
