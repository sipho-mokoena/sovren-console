/**
 * Selecting an estate, and the consistency check that every estate passes.
 *
 * **Selection is a value, not a build flag.** R54 wants one description seeding
 * every mock so fixtures cannot disagree, and ticket 03 wants the same
 * description selectable at runtime so an operator can reproduce a failure in
 * the dev server without touching a test. Both are satisfied by the same thing:
 * a registry keyed by name, a query parameter that picks from it, and a
 * programmatic selector for a test.
 *
 *     /nodes                       the default estate
 *     /nodes?estate=compact        the small one, for a narrow screen
 *
 * That is the whole mechanism. An environment variable would work in the dev
 * server and not in a test; a test-only global would work in a test and not in
 * the dev server; a value in the URL works in both, takes the identical code
 * path, and is something an operator can type into a browser.
 */

import { compact } from "./compact";
import { fleet } from "./fleet";
import type { Estate } from "./types";

/** The query parameter that selects an estate. One name, everywhere. */
export const ESTATE_PARAM = "estate";

/** Every estate, by the name a consumer selects it with. */
export const ESTATES: Readonly<Record<string, Estate>> = {
  fleet,
  compact,
};

export const ESTATE_NAMES = Object.keys(ESTATES);

/** The estate a screen gets when nobody selected one. */
export const DEFAULT_ESTATE = fleet;

export const isEstateName = (value: string): boolean => Object.hasOwn(ESTATES, value);

/**
 * The estate a URL asks for.
 *
 * An unrecognised name falls back to the default rather than throwing, because
 * the caller is usually an HTTP handler and a bad query parameter should be
 * visible as the default screen rather than as a stack trace. The name is still
 * checked by the consistency suite, so a typo in the code is caught there; only
 * a typo in a URL bar is forgiven.
 */
export const estateFor = (name: string | null | undefined): Estate =>
  name !== null && name !== undefined && isEstateName(name)
    ? (ESTATES[name] as Estate)
    : DEFAULT_ESTATE;

export const DEFAULT_ESTATE_NAME = DEFAULT_ESTATE.name;

export { compact, fleet };
