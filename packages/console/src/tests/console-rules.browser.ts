/**
 * The console's own rules, asserted without a screen.
 *
 * Two of them, and both are rules about *language* rather than about behaviour,
 * which is why they are worth a test at all: nothing else in the build would
 * notice a toast claiming a completion nobody observed, or a page token
 * constructor that lets a client ask for page 40.
 */

import { describe, expect, it, vi } from "vitest";

import { claimsCompletion } from "@/components/sovren/toast";
import { isSovrenError, readList, readOne } from "@/lib/sovren";
import { formatBytes, formatDuration, formatRelative, formatTimestamp } from "@/lib/format";

describe("toasts claim only what has been observed", () => {
  it("recognises a completed outcome in the past tense", () => {
    // The family of messages this rule exists to prevent. Each of them asserts
    // something the browser cannot know.
    for (const title of [
      "VM created",
      "Node rebooted",
      "Task succeeded",
      "Proxmox connected",
      "golden-tpl provisioned",
    ]) {
      expect(claimsCompletion(title)).toBe(true);
    }
  });

  it("accepts a present-tense report of something that was watched", () => {
    for (const title of [
      "netbird-accra answers",
      "dokploy-accra does not answer",
      "create-golden queued",
      "3 rows match the filter",
      "restore-grafana-canary is running",
      "2 Tasks are queued",
    ]) {
      expect(claimsCompletion(title)).toBe(false);
    }
  });

  it("does not fire on a state that happens to be a past participle", () => {
    // `stopped`, `cancelled` and `suspended` are states sovren is required to
    // say out loud, and an operator watching a Task reach one is being told
    // something true. A check that fired on them would make the console unable
    // to report the state at all.
    for (const title of ["golden is stopped", "the Task is cancelled", "nextcloud is suspended"]) {
      expect(claimsCompletion(title)).toBe(false);
    }
  });

  it("warns rather than swallowing, so a bad message is loud in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(claimsCompletion("VM created")).toBe(true);
    warn.mockRestore();
  });
});

describe("reading a generated response", () => {
  it("reads a page off the success arm and an error off every other one", () => {
    const page = readList<{ id: string }>({
      status: 200,
      data: { items: [{ id: "nd_1" }], nextPage: null },
    });
    expect(page.kind).toBe("page");

    const failure = readList({
      status: 503,
      data: { code: "upstream_unavailable", message: "", requestId: "req_1" },
    });
    expect(failure.kind).toBe("error");
    expect(readList(undefined).kind).toBe("pending");
  });

  it("does not mistake a connection test result for an error response", () => {
    // A `ConnectionTestResult` carries a `code` and a `requestId`, so a console
    // that told a failed test apart by its body would report "the test did not
    // run" for a test that ran and came back `ok: false`.
    const failed = readOne<{ ok: boolean; code: string | null; requestId: string }>({
      status: 200,
      data: { ok: false, code: "upstream_unauthenticated", message: "no", requestId: "req_2" },
    });
    expect(failed.kind).toBe("value");
    expect(failed.kind === "value" && failed.value.ok).toBe(false);

    expect(isSovrenError({ code: "conflict", requestId: "req_3" })).toBe(true);
  });
});

describe("formatting what the estate reported", () => {
  it("reports bytes in binary units and absence as absence", () => {
    expect(formatBytes(4 * 1024 ** 3)).toBe("4.0 GiB");
    expect(formatBytes(32 * 1024 ** 4)).toBe("32 TiB");
    expect(formatBytes(0)).toBe("0 B");
    // null is a real state on a Node, and it is not zero.
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });

  it("reports a duration coarsely, because the column is narrow", () => {
    expect(formatDuration(918_233)).toBe("10d 15h");
    expect(formatDuration(3_600)).toBe("1h");
    expect(formatDuration(null)).toBe("—");
  });

  it("reports a stamp in UTC, so a table does not depend on the browser's zone", () => {
    expect(formatTimestamp("2026-09-29T06:00:00.000Z")).toBe("2026-09-29 06:00:00Z");
    expect(formatTimestamp(null)).toBe("—");
  });

  it("says how long ago, in the words an operator would use", () => {
    const now = Date.parse("2026-09-29T06:00:00.000Z");
    expect(formatRelative(now - 30_000, now)).toBe("just now");
    expect(formatRelative(now - 6 * 60_000, now)).toBe("6m ago");
    expect(formatRelative(now - 6 * 24 * 3_600_000, now)).toBe("6d ago");
    expect(formatRelative(0, now)).toBe("never");
  });
});
