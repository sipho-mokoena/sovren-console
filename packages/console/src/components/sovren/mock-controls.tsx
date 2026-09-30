/**
 * The mock controls: which estate, and which failure.
 *
 * R56: a failure path the operator cannot reproduce is a failure path nobody
 * will ever see. The mock backend reads both of these out of the request URL, so
 * the only thing this control has to do is put them in the *console's* URL and
 * let the bridge in `lib/mock-backend.ts` carry them across.
 *
 * That is why they live in the console's address bar and not in a settings
 * screen: a control an operator can type over, share in a bug report, and get
 * back by pressing the back button. `?sentinel=upstream-unavailable` in a URL is
 * a reproduction; a toggle in a menu is a setting nobody can quote.
 *
 * **They are labelled as what they are.** This is a prototype with no control
 * plane, so these two selects are the boundary between the console and the
 * estate, and pretending otherwise would put a mock selector where an operator
 * would look for a real setting.
 */

import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ESTATE_NAMES,
  ESTATE_PARAM,
  SENTINEL_NAMES,
  SENTINEL_PARAM,
  sentinelHelp,
} from "@/lib/mock-backend";
import { cn } from "cn";

export interface MockControls {
  /** The estate the backend serves, or undefined for the default one. */
  estate: string | undefined;
  /** The failure the backend serves, or undefined for a healthy estate. */
  sentinel: string | undefined;
  setEstate: (name: string | null) => void;
  setSentinel: (name: string | null) => void;
  /** Step to the next sentinel, wrapping back to none. Bound to the `d` key. */
  cycleSentinel: () => void;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

export const useMockControls = (): MockControls => {
  const navigate = useNavigate();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const estate = asString(raw[ESTATE_PARAM]);
  const sentinel = asString(raw[SENTINEL_PARAM]);

  const set = useCallback(
    (name: string, value: string | null) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous };
          if (value === null || value === "") delete next[name];
          else next[name] = value;
          return next;
        },
      });
    },
    [navigate],
  );

  const cycleSentinel = useCallback(() => {
    const index = sentinel === undefined ? -1 : SENTINEL_NAMES.indexOf(sentinel as never);
    const next = SENTINEL_NAMES[(index + 1) % SENTINEL_NAMES.length];
    set(SENTINEL_PARAM, next);
  }, [sentinel, set]);

  return {
    estate,
    sentinel,
    setEstate: (name) => {
      set(ESTATE_PARAM, name);
    },
    setSentinel: (name) => {
      set(SENTINEL_PARAM, name);
    },
    cycleSentinel,
  };
};

/**
 * `d` cycles the sentinels, on any list.
 *
 * A shortcut rather than a discoverable feature: the point is to make every
 * failure state reachable in two keystrokes from wherever an operator already
 * is, so the error states get looked at during ordinary work instead of only
 * when someone remembers to open the console's help.
 */
export const useSentinelShortcut = (cycle: () => void): void => {
  const latest = useRef(cycle);
  latest.current = cycle;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "d" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Never steal a keystroke from a field the operator is typing a filter
      // into, which is where a `d` is most likely to be meant as a letter.
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable === true) return;
      latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
};

const SELECT_CLASS =
  "h-7 rounded-none border border-input bg-background px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring";

export interface MockControlPanelProps {
  controls: MockControls;
  className?: string;
}

export function MockControlPanel({ controls, className }: MockControlPanelProps) {
  const selected = sentinelHelp.find(
    (entry) => entry.query === `?${SENTINEL_PARAM}=${controls.sentinel}`,
  );
  const estateChanged = controls.estate !== undefined;

  return (
    <div
      data-mock-controls="true"
      className={cn(
        "flex flex-wrap items-center gap-2 border border-dashed border-border px-2 py-1",
        className,
      )}
    >
      <span className="font-mono text-[11px] text-muted-foreground">mock backend</span>

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        estate
        <select
          aria-label="Estate the mock backend serves"
          className={SELECT_CLASS}
          value={controls.estate ?? ""}
          onChange={(event) => {
            controls.setEstate(event.target.value === "" ? null : event.target.value);
          }}
        >
          <option value="">default (fleet)</option>
          {ESTATE_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        sentinel
        <select
          aria-label="Failure the mock backend serves"
          className={SELECT_CLASS}
          value={controls.sentinel ?? ""}
          onChange={(event) => {
            controls.setSentinel(event.target.value === "" ? null : event.target.value);
          }}
        >
          <option value="">none</option>
          {SENTINEL_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <span className="text-[11px] text-muted-foreground">
        {controls.sentinel === undefined
          ? estateChanged
            ? `serving the ${controls.estate} estate`
            : "serving the fleet estate"
          : (selected?.yields ?? "unknown sentinel")}
      </span>
    </div>
  );
}
