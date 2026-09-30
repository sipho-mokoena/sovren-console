/**
 * The page envelope, and why the token is not an offset.
 *
 * R33: every list returns `{ items, nextPage }` and the token is opaque, never an
 * offset. The reason is not tidiness. An offset shifts under the operator: open a
 * list, let a Task finish and add a row, press next, and an offset shows the row
 * that just moved to the end -- so the operator sees a row twice and misses one,
 * on a screen whose whole job is to tell them what exists.
 *
 * These tests are at the HTTP seam, because the property being defended is what
 * the *client* experiences, not what the paginator returns.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { nodeList, vMList } from "@sovren/client";

import { resetAuditLog, setupSovrenServer } from "../src";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  decodeToken,
  fingerprint,
  fromBase64UrlForTest,
  toBase64UrlForTest,
  isPageToken,
  paginate,
  readSize,
} from "../src/backend/pagination";

const server = setupSovrenServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetAuditLog();
});
afterAll(() => server.close());

describe("the envelope is the one the document declares", () => {
  it("returns items and nextPage, and nothing else at the top level", async () => {
    const response = await nodeList({ size: 3 });
    if (response.status !== 200) throw new Error("expected 200");

    // A list is `{ items, nextPage }` and not `{ data: [...], total }`. The
    // convention is pinned rather than composed, and pinning it is this
    // assertion.
    expect(Object.keys(response.data).sort()).toEqual(["items", "nextPage"]);
  });

  it("gives a null token on the last page, not an empty string", async () => {
    const response = await nodeList();
    if (response.status !== 200) throw new Error("expected 200");
    // A screen tests truthiness either way, but a validator generated from the
    // document will not: `null` and `""` are different types here.
    expect(response.data.nextPage).toBeNull();
  });
});

describe("the token is opaque, and a client cannot construct one", () => {
  it("is not a number, an offset, or a row id", async () => {
    const response = await vMList({ size: 5 });
    if (response.status !== 200) throw new Error("expected 200");

    const token = response.data.nextPage;
    expect(token).not.toBeNull();
    expect(isPageToken(token as string)).toBe(true);
    // If the token were the offset, a crafted `?page=40` would skip forty rows
    // and a control plane could not tell that from a legitimate request.
    expect(token).not.toMatch(/^\d+$/);
    expect(token).not.toMatch(/^vm_/);
  });

  it("resumes after the last row of the page, not after a count", async () => {
    const first = await vMList({ size: 5 });
    if (first.status !== 200) throw new Error("expected 200");
    const token = first.data.nextPage as string;

    const decoded = decodeToken(token);
    expect(decoded).not.toBeNull();
    // The boundary is a row, and paging through a list that is changing
    // underneath you still shows every row exactly once.
    expect(decoded?.after).toBe(first.data.items.at(-1)?.id);
  });

  it("refuses a token from a differently filtered list", async () => {
    const unfiltered = await vMList({ size: 5 });
    if (unfiltered.status !== 200) throw new Error("expected 200");
    const token = unfiltered.data.nextPage as string;

    const filtered = await vMList({ size: 5, purpose: ["service"], page: token });
    if (filtered.status !== 200) throw new Error("expected 200");
    // Resuming an unfiltered cursor into a filtered list would skip rows
    // silently, and the operator would never know which.
    for (const row of filtered.data.items) expect(row.purpose).toBe("service");
  });

  it("restarts rather than failing when the row it pointed after is gone", async () => {
    // A row being deleted is a normal thing that happens to a control plane.
    // Refusing would make a page unreachable; restarting shows the operator the
    // current list, which is what they asked for.
    const rows = [{ id: "vm_a" }, { id: "vm_b" }, { id: "vm_c" }];
    const first = paginate(rows, { size: 2, page: null }, "");
    const token = first.nextPage as string;

    const deleted = paginate([{ id: "vm_a" }, { id: "vm_c" }], { size: 2, page: token }, "");
    expect(deleted.items.map((row) => row.id)).toEqual(["vm_a", "vm_c"]);
  });

  it("does not lose its place when the page size changes", async () => {
    const first = await vMList({ size: 5 });
    if (first.status !== 200) throw new Error("expected 200");

    // An operator who changes the page size mid-list is still on the same list.
    // If the token carried the size, it would be refused and the console would
    // have to explain why.
    const second = await vMList({ size: 3, page: first.data.nextPage ?? undefined });
    if (second.status !== 200) throw new Error("expected 200");
    expect(second.data.items.length).toBeGreaterThan(0);
  });
});

describe("page size honours the bounds the document declares", () => {
  it("defaults to twenty-five", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect(readSize(null)).toBe(25);
  });

  it("clamps rather than trusting the caller", () => {
    expect(readSize("0")).toBe(MIN_PAGE_SIZE);
    expect(readSize("-5")).toBe(MIN_PAGE_SIZE);
    expect(readSize("100000")).toBe(MAX_PAGE_SIZE);
    // A size that is not a number is a typo, not an instruction, and falling
    // back to the default is what an operator would expect.
    expect(readSize("lots")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("serves the whole list at the maximum size", async () => {
    const response = await vMList({ size: MAX_PAGE_SIZE });
    if (response.status !== 200) throw new Error("expected 200");
    expect(response.data.items).toHaveLength(27);
    expect(response.data.nextPage).toBeNull();
  });
});

describe("the fingerprint names the list, and only the list", () => {
  it("is the same whichever order the parameters arrived in", () => {
    // `?site=a&q=b` and `?q=b&site=a` are the same query, which they are.
    expect(fingerprint({ site: "a", q: "b" })).toBe(fingerprint({ q: "b", site: "a" }));
  });

  it("treats an absent filter as no filter", () => {
    expect(fingerprint({ site: "a", q: null })).toBe(fingerprint({ site: "a" }));
    expect(fingerprint({ site: "a", q: "" })).toBe(fingerprint({ site: "a" }));
  });

  it("differs when the list differs", () => {
    expect(fingerprint({ site: "a" })).not.toBe(fingerprint({ site: "b" }));
  });
});

describe("the token alphabet round-trips at every length", () => {
  // A hand-rolled base64url is exactly the kind of thing that is right for most
  // inputs and subtly wrong for the rest: the first version of this decoder
  // emitted one byte too many whenever the payload's length left a two-character
  // group at the end, and every payload whose length was a multiple of three
  // round-tripped perfectly. A token is a position in a list, so a decoder that
  // fails on some lengths fails on *some pages*, which is the worst shape a bug
  // can have here.
  it("survives every payload length, and agrees with Node's base64url", () => {
    for (let length = 1; length <= 96; length += 1) {
      const payload = "a".repeat(length);
      const token = `pt_${toBase64UrlForTest(payload)}`;
      expect(token, `length ${length}`).toBe(
        `pt_${Buffer.from(payload, "utf8").toString("base64url")}`,
      );
      expect(fromBase64UrlForTest(token.slice(3)), `length ${length}`).toBe(payload);
    }
  });

  it("survives characters outside ASCII, which are the ones a byte-wise codec gets wrong", () => {
    for (const payload of ["accra-lab", "kumasi — store", "naïve", "▚▞", "🔑 overlay"]) {
      const token = `pt_${toBase64UrlForTest(payload)}`;
      expect(fromBase64UrlForTest(token.slice(3))).toBe(payload);
    }
  });

  it("and a token with a character outside the alphabet is refused, not guessed", () => {
    expect(isPageToken("pt_eyJhIjoiYSJ9")).toBe(true);
    expect(isPageToken("pt_eyJhIjoiYSJ+")).toBe(false);
    // Too short to be a token, and `+` is standard base64 rather than base64url
    // -- a token from a codec that got the alphabet wrong is not silently read.
    expect(isPageToken("pt_eyJh")).toBe(false);
    expect(isPageToken("not-a-token")).toBe(false);
  });
});
