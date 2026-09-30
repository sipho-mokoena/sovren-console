/**
 * Where the VM form routes point, and how the list's state survives the trip.
 *
 * ## The problem this file exists to solve
 *
 * R39: a form is a page of its own, and **returning** to the list restores the
 * filters, sort and page the operator left. The list is a *page* now, so it is
 * unmounted while a form is open, and nothing about it survives except its
 * address. So the whole of "do not lose my place" is the question of what is in
 * the form's URL, and there are exactly two things that have to be true:
 *
 *  1. the list's own parameters are **carried in** when the operator navigates to
 *     a form, and
 *  2. the form's way out points **back at the list with those same parameters**.
 *
 * The second is the one that gets forgotten. Three ways out exist -- the
 * browser's back button, the breadcrumb and Cancel -- and the first is free
 * because the navigation happened, while the other two are hrefs this file
 * writes. They are built from one function so they cannot disagree.
 *
 * ## A repeated key has to survive the trip
 *
 * `?purpose=infrastructure&purpose=service` is one question with two answers --
 * the estate's own machines, and the Fleet sidebar asks exactly that -- so a
 * search that flattened a repeated key to its last value would carry half the
 * question and answer a different one. `stringifySovrenSearch` writes an array
 * back as a repeated key, which is what makes this a non-issue **provided the
 * array is not flattened on the way in**. It is not flattened here: the search is
 * read loosely and passed through as it arrives.
 *
 * The console's own `?estate=` and `?sentinel=` ride out on the same pass, so a
 * create form reached from a reproducible failure keeps that failure
 * reproducible, or the mock backend's reason for existing is lost halfway through
 * a workflow (R56).
 *
 * ## `from`, and only when it is not the default
 *
 * A create is an estate-wide act, so a Site's list sends the operator to the
 * Fleet form -- and without this the way back from that form is the *Fleet*
 * list, which loses the Site they were working in. So the link records which
 * list it was opened from, in `from`, and the form's return address is built from
 * it.
 *
 * It is written **only when the answer is not the default**, for the same reason
 * the console does not write `?q=` when nothing is filtered: an address that
 * says where it is going when the answer is "the list" is an address nobody reads
 * properly. On the Fleet list the parameter is absent and the form returns to the
 * Fleet list, which is the same thing said less loudly.
 *
 * The value is checked against the two list paths this console has before it is
 * followed. It is a return address, and a return address is an address somebody
 * might paste into a chat; a hand-written `from` that pointed at a screen this
 * console does not have would be a link out of the form and into nothing.
 */

import { useLocation, useSearch } from "@tanstack/react-router";

import { stringifySovrenSearch } from "@/lib/search-params";

/** The search parameter naming the list a form was opened from. */
export const FORM_ORIGIN_PARAM = "from";

/** The list these pages are made of, in the Fleet scope. */
export const VMS_LIST_PATH = "/fleet/vms";

/** The two lists a VM form can be opened from: the Fleet one, and a Site's. */
const isVmsListPath = (path: string): boolean =>
  path === VMS_LIST_PATH || /^\/site\/[^/]+\/vms$/.test(path);

/**
 * The list this form was opened from, and the search it was opened with.
 *
 * `from` is read back out of the search and dropped from what the *list* will
 * see, because it is about how the form was reached and a list has no use for it:
 * leaving it on would put this form's breadcrumb into a link the operator copies
 * out of the list.
 */
const useFormOrigin = (): {
  readonly path: string;
  readonly search: Record<string, string | string[]>;
} => {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const carried: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(raw)) {
    // A detail page's own parameter. A form is not a tab, and asking the list for
    // `?tab=` would be the same mistake a tab inside a list makes.
    if (name === "tab" || name === FORM_ORIGIN_PARAM) continue;
    if (typeof value === "string" && value !== "") {
      carried[name] = value;
    } else if (Array.isArray(value)) {
      /**
       * A repeated key, carried as the array it arrived as.
       *
       * `purpose=infrastructure&purpose=service` is one filter with two answers,
       * and `stringifySovrenSearch` writes an array back as a repeated key -- so
       * reading this down to its last value would show an operator a list of
       * Dokploy hosts and call it the estate's own machines.
       */
      const many = value.filter(
        (entry): entry is string => typeof entry === "string" && entry !== "",
      );
      if (many.length > 0) carried[name] = many;
    }
  }

  const asked = raw[FORM_ORIGIN_PARAM];
  const path = typeof asked === "string" && isVmsListPath(asked) ? asked : VMS_LIST_PATH;

  return { path, search: carried };
};

/**
 * The list, with whatever the operator had on it.
 *
 * On a cold deep link to a form there is nothing to carry, so this is the plain
 * Fleet list path -- which is the answer to "a create form deep-linked directly,
 * with no list behind it, can still return somewhere sensible": the way back is
 * always a real list, never a dead end and never the form itself.
 */
export const useVmsListHref = (): string => {
  const { path, search } = useFormOrigin();
  return `${path}${stringifySovrenSearch(search)}`;
};

/**
 * The form's href, carrying the operator's view of the list.
 *
 * The list's own pathname is written as `from` when it is not the default one, so
 * the return address is the list this form was actually opened from rather than
 * an assumption about which list that was.
 */
const useFormHref = (suffix: string): string => {
  const location = useLocation();
  const { search } = useFormOrigin();
  const fromANonDefaultList =
    isVmsListPath(location.pathname) && location.pathname !== VMS_LIST_PATH;
  const extra = fromANonDefaultList ? { [FORM_ORIGIN_PARAM]: location.pathname } : {};
  return `/fleet/vms/${suffix}${stringifySovrenSearch({ ...extra, ...search })}`;
};

/** The create form, from whichever list the operator was reading. */
export const useVmsCreateHref = (): string => useFormHref("new");

/** One VM's edit form, from whichever list the operator was reading. */
export const useVmsEditHref = (vm: string): string => useFormHref(`${encodeURIComponent(vm)}/edit`);
