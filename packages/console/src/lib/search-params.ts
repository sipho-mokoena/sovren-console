/**
 * Reading and writing the console's search parameters.
 *
 * One rule: **a search parameter is the string the URL said, and nothing else.**
 *
 * TanStack Router's default parser runs values through JSON, which quietly turns
 * `?size=5` into the number `5` and `?q=5` into the number `5` too. That is a
 * small thing with two consequences, and both of them are bugs someone would
 * spend an afternoon on: a filter for a machine called `5` stops matching
 * because the value arrived as a number, and a page size stops arriving as the
 * `number` the generated parameter type declares while the screen is comparing
 * it against a string.
 *
 * So the console parses its own search, as strings, and writes it back the same
 * way. It also means the console's own controls -- `?estate=`, `?sentinel=` --
 * survive every navigation untouched, because nothing in here knows about them
 * and nothing in here filters.
 */

/** Values a search parameter is allowed to take once parsed. */
/**
 * A parsed query string. A value is `string[]` when its key was repeated, which
 * is the one case a flat `Record<string, string>` cannot express honestly.
 */
export type SovrenSearch = Record<string, string | string[]>;

/**
 * Parse a query string into strings.
 *
 * A repeated parameter keeps its last value, which is what `URLSearchParams`
 * does and what an operator typing one value twice means. A parameter with no
 * `=` is an empty string rather than a missing key, so a filter the operator
 * cleared is visibly cleared rather than absent.
 */
/**
 * Read a query string into a flat record.
 *
 * A key that appears more than once becomes an **array**, because a repeated key
 * is a question with more than one answer and the last one is not the answer:
 * `?purpose=infrastructure&purpose=service` means both, and a parser that kept
 * the last would show an operator a list of Dokploy hosts and call it the
 * estate's own machines. This is the shape a URL genuinely has, so the parser
 * reports it rather than flattening it.
 */
export const parseSovrenSearch = (search: string): SovrenSearch => {
  const parsed: SovrenSearch = {};
  for (const [name, value] of new URLSearchParams(search)) {
    const held = parsed[name];
    if (held === undefined) parsed[name] = value;
    else if (Array.isArray(held)) held.push(value);
    else parsed[name] = [held, value];
  }
  return parsed;
};

/**
 * Write search parameters back into a query string.
 *
 * The leading `?` is part of the return value because that is the contract
 * TanStack Router defines: a serialiser returns `""` or `?name=value`. Getting
 * that wrong produces `/fleet/nodessize=5`, which is a valid path, matches no
 * route, and is very hard to read as a mistake.
 *
 * Empty, null and undefined values are dropped, so clearing a filter removes the
 * parameter instead of leaving `?q=` in the address bar for the next reader --
 * and so a link an operator shares has no leftover noise in it.
 */
export const stringifySovrenSearch = (search: Record<string, unknown>): string => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(search)) {
    if (value === null || value === undefined || value === "") continue;
    // A repeated answer goes back as a repeated key, which is what it was.
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === null || entry === undefined || entry === "") continue;
        if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
          throw new Error(
            `The search parameter "${name}" holds a ${typeof entry}. A URL carries strings, so write one.`,
          );
        }
        params.append(name, String(entry));
      }
      continue;
    }
    // Only ever a string, a number or a boolean reaches a search parameter --
    // `parseSovrenSearch` puts nothing else in one, and a screen writes nothing
    // else. Anything else would be a bug worth failing on rather than
    // stringifying into `[object Object]`, which is what `String` would do.
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(
        `The search parameter "${name}" is a ${typeof value}. A URL carries strings, so write one.`,
      );
    }
    params.set(name, String(value));
  }
  const serialised = params.toString();
  return serialised === "" ? "" : `?${serialised}`;
};
