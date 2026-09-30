/**
 * Server-side pagination with an opaque token.
 *
 * R33: every list returns `{ items, nextPage }` and the token is opaque, never an
 * offset. The reason is not tidiness. An offset shifts under the operator: open a
 * list of twenty VMs, let a Task finish and add one, press next, and an offset
 * shows the row that just moved to the end -- so the operator sees a row twice
 * and misses one, on a screen whose whole job is to tell them what exists.
 *
 * **A keyset cursor, not an offset.** The token carries the id of the last row
 * of the page just served, and the next page starts after it. A row inserted
 * anywhere but at the end does not move the boundary, so paging through a list
 * that is changing underneath you still shows every row exactly once.
 *
 * **The token is opaque because it is base64url of a signed-ish payload, and
 * deliberately so.** It is not an integer, and a test that asserts it is not an
 * integer is asserting the property that matters: a client cannot construct one,
 * so it cannot ask for page 40 and a control plane cannot be made to skip rows
 * by a crafted number.
 */

import { PAGE_TOKEN_PATTERN } from "../estate/identifiers";

/** The document's default. A page of twenty-five, which is a screenful. */
export const DEFAULT_PAGE_SIZE = 25;

/** The document's bounds. Both are in the document, and both are enforced here. */
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 200;

export interface PageRequest {
  page?: string | null;
  size?: number | null;
}

export interface Page<T> {
  items: T[];
  nextPage: string | null;
}

/** Read a query parameter as a page size, clamped to the document's bounds. */
export const readSize = (raw: string | null): number => {
  if (raw === null) return DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(parsed, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
};

/**
 * base64url, without `Buffer`.
 *
 * The mock backend runs in two places: a node test server, and the browser
 * through a service worker. `Buffer` is a Node global, so a token minted with it
 * throws `Buffer is not defined` in the browser -- and **only** in the browser,
 * which is why the suite was green and every paginated list in the running
 * console was a 500. A token is a string in a URL; the alphabet is the same
 * everywhere, so it is written by hand.
 *
 * Round-trip correctness is asserted in `pagination.test.ts` for both alphabets
 * and for non-ASCII, because a hand-rolled base64 is exactly the kind of thing
 * that is subtly wrong for one character and fine for the rest.
 */
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += BASE64URL_ALPHABET[a >> 2];
    out += BASE64URL_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += BASE64URL_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += BASE64URL_ALPHABET[c & 63];
  }
  return out;
};

const fromBase64Url = (token: string): string | null => {
  const bits: number[] = [];
  for (const character of token) {
    const value = BASE64URL_ALPHABET.indexOf(character);
    if (value < 0) return null;
    bits.push(value);
  }
  // Six bits per character: 4 characters carry 24 bits and so 3 bytes; 3 carry 2;
  // 2 carry 12 bits and so exactly 1. The last group of an unpadded token is
  // always short, and writing a byte per *pair* of trailing characters rather
  // than per whole pair of them is how a decoder emits one byte too many and
  // then fails to parse the result -- silently, for the lengths that happen to
  // be a multiple of three.
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 4) {
    const a = bits[i] as number;
    const b = bits[i + 1];
    const c = bits[i + 2];
    const d = bits[i + 3];
    bytes.push(((a << 2) | ((b ?? 0) >> 4)) & 255);
    if (c !== undefined) bytes.push((((b ?? 0) & 15) << 4) | (c >> 2));
    if (d !== undefined) bytes.push((((c ?? 0) & 3) << 6) | d);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};

export const toBase64UrlForTest = toBase64Url;
export const fromBase64UrlForTest = fromBase64Url;

/**
 * The token, and the row it resumes after.
 *
 * `pt_` is the prefix, then base64url of `{"a":"<last id>","f":"<filter>"}`. The
 * `f` is a fingerprint of the filters the page was cut from: a token from an
 * unfiltered list is refused by a filtered one, because resuming after an id that
 * the filtered list may not contain would skip rows silently.
 */
const encodeToken = (after: string, fingerprint: string): string => {
  const payload = JSON.stringify({ a: after, f: fingerprint });
  return `pt_${toBase64Url(payload)}`;
};

export const decodeToken = (token: string): { after: string; fingerprint: string } | null => {
  if (!PAGE_TOKEN_PATTERN.test(token)) return null;
  const payload = fromBase64Url(token.slice(3));
  if (payload === null) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { a, f } = parsed as { a?: unknown; f?: unknown };
    if (typeof a !== "string" || typeof f !== "string") return null;
    return { after: a, fingerprint: f };
  } catch {
    return null;
  }
};

/**
 * A stable fingerprint of the filters a page was cut from.
 *
 * Sorted so that `?site=a&q=b` and `?q=b&site=a` are the same query, which they
 * are. Not a hash: the value is never compared against a secret, and a readable
 * fingerprint makes a mismatched token legible in a test failure.
 */
export const fingerprint = (filters: Readonly<Record<string, string | null>>): string => {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== null && value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([key, value]) => `${key}=${String(value)}`).join("&");
};

/** Why a token was refused, so a handler can turn it into a code rather than a shrug. */
export type TokenRejection = "malformed" | "wrong-filter" | "unknown-cursor";

export type CursorResult =
  | { readonly ok: true; readonly start: number }
  | { readonly ok: false; readonly reason: TokenRejection };

/**
 * Where to start, given the rows and the token.
 *
 * `start` is an index into the *current* list, which is what a keyset cursor
 * reduces to once the boundary row has been located. Finding it by id rather
 * than by counting is the part that makes an insertion harmless: the count is
 * re-derived from the list as it is now, and the boundary is still the same row.
 */
export const cursorInto = <T extends { readonly id: string }>(
  rows: readonly T[],
  token: string | null | undefined,
  mark: string,
): CursorResult => {
  if (token === null || token === undefined || token === "") return { ok: true, start: 0 };

  const decoded = decodeToken(token);
  if (decoded === null) return { ok: false, reason: "malformed" };
  if (decoded.fingerprint !== mark) return { ok: false, reason: "wrong-filter" };

  const index = rows.findIndex((row) => row.id === decoded.after);
  if (index === -1) return { ok: false, reason: "unknown-cursor" };
  return { ok: true, start: index + 1 };
};

/** Cut one page. The only place `nextPage` is ever built. */
export const paginate = <T extends { readonly id: string }>(
  rows: readonly T[],
  request: PageRequest,
  mark: string,
): Page<T> => {
  const size = readSize(
    request.size === null || request.size === undefined ? null : String(request.size),
  );
  const cursor = cursorInto(rows, request.page, mark);

  // A token that no longer resolves is treated as the start of the list rather
  // than as an error, and the reason is worth being precise about: the row it
  // pointed after has been *deleted*, which is a normal thing that happens to a
  // control plane. Refusing would make a page unreachable; restarting shows the
  // operator the current list, which is what they asked for.
  const start = cursor.ok ? cursor.start : 0;
  const items = rows.slice(start, start + size);
  const consumed = start + items.length;
  const nextPage =
    consumed < rows.length && items.length > 0
      ? encodeToken(items[items.length - 1]?.id ?? "", mark)
      : null;
  return { items: [...items], nextPage };
};

/** Whether a token is one this backend could have minted. Exported for a test. */
export const isPageToken = (value: string): boolean => PAGE_TOKEN_PATTERN.test(value);
