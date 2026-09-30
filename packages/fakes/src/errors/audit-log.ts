/**
 * The audit trail, in memory, queryable.
 *
 * R34: every error carries a `requestId`, and *that same `requestId` appears in
 * the audit log*, so a problem an operator reports is traceable end to end. The
 * two halves of that sentence are the whole point. A `requestId` on an error
 * with nothing to match it against is a decoration; the traceability is in the
 * agreement, and the agreement is only checkable if the log can be read back.
 *
 * So this is a real store with a real query, not a counter. A test asserts that
 * the `requestId` on an error and the `requestId` on its audit entry are the
 * same value -- which is the assertion that would catch a handler minting a
 * second id on the way out, and that bug is otherwise invisible.
 *
 * Every request is recorded, not only the failures. A log that contains only
 * errors cannot answer "did that succeed?", and the interesting question about
 * a destructive action is usually about the request that preceded it.
 */

import type { ErrorCode } from "@sovren/client";

/** What was asked for. The method and path, never a body: this is a trail, not a store. */
export interface AuditRequest {
  method: string;
  path: string;
  operation: string;
}

/** One line of the trail. */
export interface AuditEntry {
  /** The same value the response carried, when the request failed. */
  requestId: string;
  at: string;
  request: AuditRequest;
  status: number;
  /** Present on a failure. Absent on a success, rather than null, so absence means absence. */
  code?: ErrorCode;
  message?: string;
  /** The sentinel that caused this, when one did. Lets a test tell a real failure from a staged one. */
  sentinel?: string;
}

/** The subset of an entry a query can constrain on. */
export interface AuditQuery {
  requestId?: string;
  code?: ErrorCode;
  operation?: string;
  /** Only entries that carry a `code`. */
  failuresOnly?: boolean;
}

export class AuditLog {
  #entries: AuditEntry[] = [];

  /** Fixed, because an audit entry that used the real clock could not be asserted against. */
  #clock: () => string;

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.#clock = clock;
  }

  record(entry: Omit<AuditEntry, "at"> & { at?: string }): AuditEntry {
    const written: AuditEntry = { at: entry.at ?? this.#clock(), ...entry };
    this.#entries.push(written);
    return written;
  }

  /**
   * Most recent last, which is the order a log is read in. A test that finds
   * "the entry for this requestId" should not have to care whether it was first
   * or last in the array.
   */
  query(query: AuditQuery = {}): AuditEntry[] {
    return this.#entries.filter((entry) => {
      if (query.requestId !== undefined && entry.requestId !== query.requestId) return false;
      if (query.code !== undefined && entry.code !== query.code) return false;
      if (query.operation !== undefined && entry.request.operation !== query.operation)
        return false;
      if (query.failuresOnly === true && entry.code === undefined) return false;
      return true;
    });
  }

  /** The entry for one `requestId`. `undefined` when the trail does not have it, which is the failure. */
  find(requestId: string): AuditEntry | undefined {
    return this.#entries.find((entry) => entry.requestId === requestId);
  }

  get size(): number {
    return this.#entries.length;
  }

  /** Every entry, in the order they were written. */
  all(): readonly AuditEntry[] {
    return this.#entries;
  }

  clear(): void {
    this.#entries = [];
  }
}

/**
 * The log the mock backend writes to.
 *
 * Module-level on purpose. The dev server and a test construct the backend the
 * same way, and a test that could not reach the log the server wrote to would
 * be asserting against a different trail than the one an operator reads.
 * `resetAuditLog` is what keeps one suite's entries out of the next suite's
 * assertions; it is exported rather than reached into.
 */
export const auditLog = new AuditLog();

export const resetAuditLog = (): void => {
  auditLog.clear();
};
