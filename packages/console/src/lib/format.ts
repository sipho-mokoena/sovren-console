/**
 * Formatting observed values.
 *
 * Everything here takes what the contract gave the console and turns it into
 * something an operator reads at a glance. The rules are the same on every
 * screen, which is most of why a list is scannable: bytes are binary units, a
 * duration is `6d 4h`, and a timestamp in a table is UTC because an operator
 * comparing a Node's uptime to a Task's start time should not have to work out
 * which timezone the browser is in.
 *
 * Nothing here rounds a value the estate reported. A heterogeneous estate is
 * reported, not normalised, and a formatter that tidied 1.7 GHz into "fast"
 * would be the first place that fiction entered the console.
 */

const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

const KIB = 1024;

/** What a cell says when the contract said nothing. Distinct from zero. */
export const ABSENT = "—";

/**
 * A byte count, in binary units, to one decimal above KiB.
 *
 * `null` is a real state on a `Node` -- `driveBytes` is absent on a machine the
 * estate has never measured -- and it renders as absent rather than as `0 B`,
 * because a machine with no reported capacity is not a machine with no disks.
 */
export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return ABSENT;
  if (bytes === 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(Math.abs(bytes)) / Math.log(KIB)),
    BINARY_UNITS.length - 1,
  );
  const scaled = bytes / KIB ** exponent;
  const unit = BINARY_UNITS[exponent] ?? "B";
  const decimals = exponent === 0 ? 0 : scaled < 10 ? 1 : 0;
  return `${scaled.toFixed(decimals)} ${unit}`;
};

/** A count with a unit, pluralised by the count rather than by the word. */
export const formatCount = (value: number, unit: string): string =>
  `${value.toLocaleString("en-GB")} ${unit}${value === 1 ? "" : "s"}`;

/**
 * A duration in seconds, coarse on purpose.
 *
 * Two significant units: an operator reading a table wants to know whether a
 * machine has been up for a week or a minute, and `6d 4h 12m 3s` costs a
 * column width to say the same thing.
 */
export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return ABSENT;
  if (seconds < 0) return ABSENT;
  const whole = Math.floor(seconds);
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${whole}s`;
};

/**
 * A time, in UTC, to the second.
 *
 * Built from the ISO string rather than through `toLocaleString`, so the same
 * value renders identically in a browser, in a test, and in a screenshot --
 * which is the only way a test can assert a timestamp without asserting the
 * machine's locale.
 */
export const formatTimestamp = (iso: string | null | undefined): string => {
  if (iso === null || iso === undefined || iso === "") return ABSENT;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return ABSENT;
  return `${parsed.toISOString().slice(0, 19).replace("T", " ")}Z`;
};

/** Just the date, for a table that does not need the time of day. */
export const formatDate = (iso: string | null | undefined): string => {
  if (iso === null || iso === undefined || iso === "") return ABSENT;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return ABSENT;
  return parsed.toISOString().slice(0, 10);
};

/**
 * How long ago something happened, in words.
 *
 * Deliberately imprecise past a day: "6d ago" is what an operator needs to know
 * about a peer that dropped off, and a peer seen 6d 2h 11m ago is the same
 * problem. Below a minute it says "just now" rather than "12s ago", because a
 * refresh stamp that changes every second is a stamp nobody reads.
 */
export const formatRelative = (at: number, now: number = Date.now()): string => {
  if (!Number.isFinite(at) || at <= 0) return "never";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${String(days)}d ago`;
};

/**
 * A byte count and what it is a fraction of, for a capacity cell.
 *
 * `used / total` on one line, because "931 GiB of 1.8 TiB" is the question an
 * operator has about a drive and two separate columns make them do the division.
 */
export const formatCapacity = (
  used: number | null | undefined,
  total: number | null | undefined,
): string => {
  if (total === null || total === undefined) return ABSENT;
  if (used === null || used === undefined) return `of ${formatBytes(total)}`;
  return `${formatBytes(used)} of ${formatBytes(total)}`;
};

/** A percentage of a total, to the point, or absent when there is no total. */
export const formatPercent = (part: number, total: number | null | undefined): string => {
  if (total === null || total === undefined || total <= 0) return ABSENT;
  return `${Math.round((part / total) * 100)}%`;
};

/** A number with thin thousands separators, for a count that needs them. */
export const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return ABSENT;
  return value.toLocaleString("en-GB");
};
