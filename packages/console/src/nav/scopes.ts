/**
 * The three scopes, and what is in each sidebar.
 *
 * R37: Fleet, Site and Settings, switched from the top bar, each with its own
 * sidebar. The reason the sidebars differ completely is that the questions
 * differ. Fleet answers "is anything broken" across the whole estate, Site
 * answers "what is in this lab", and Settings answers "what has sovren been
 * told about the three upstreams" -- and a sidebar that mixed them would put a
 * credential next to a machine, which is the confusion R37 exists to prevent.
 *
 * **A Site is a physical grouping, not a tenancy.** R28, and the wording in
 * `purpose` below is deliberate: latency and failure boundary, no isolation. The
 * model has no tenancy and the console must not imply one, because an operator
 * who reads "Site" as a boundary will eventually rely on it as one.
 *
 * ## Adding a scope entry
 *
 * One entry in the array for the scope. Nothing else: the sidebar, the top bar,
 * the scope in the URL, and the scope switcher all read from here. A screen
 * agent adds its own route file under the scope's directory and flips its
 * entry's `state` to `ready`; until then the entry is rendered *disabled, with
 * the ticket that owns it*, which is the same treatment a disabled action gets
 * everywhere else in the console.
 */

import {
  Cable,
  HardDrive,
  ListChecks,
  Network,
  Server,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ScopeId = "fleet" | "site" | "settings";

export interface NavEntry {
  /** The noun, in the contract's own words. Never a synonym. */
  label: string;
  /** The path under the scope's root. `""` is the scope's own index. */
  to: string;
  icon: LucideIcon;
  /** One line: what this page answers. Shown beside the entry. */
  description: string;
  /**
   * `planned` renders the entry disabled rather than hiding it, for the reason a
   * disabled action is rendered disabled: an operator who cannot see that a
   * screen exists learns less, and learns nothing that transfers.
   */
  state: "ready" | "planned";
  /** Which ticket owns it, shown as the reason a planned entry is unavailable. */
  ticket?: string;
}

export interface Scope {
  id: ScopeId;
  label: string;
  /** Where the scope switcher goes when it has no better place to go. */
  to: string;
  entries: readonly NavEntry[];
}

const ready = (label: string, to: string, icon: LucideIcon, description: string): NavEntry => ({
  label,
  to,
  icon,
  description,
  state: "ready",
});

const planned = (
  label: string,
  to: string,
  icon: LucideIcon,
  description: string,
  ticket: string,
): NavEntry => ({ label, to, icon, description, state: "planned", ticket });

/**
 * The registry. The only place a scope's navigation is written down.
 *
 * `Site`'s entries are relative to `/site/<site>`, which is why a Site scope
 * can have the same pages as Fleet: the same archetype, filtered to one lab.
 */
export const SCOPES: Readonly<Record<ScopeId, Scope>> = {
  fleet: {
    id: "fleet",
    label: "Fleet",
    to: "/fleet/nodes",
    entries: [
      ready("Nodes", "nodes", Server, "The physical machines, and what each one actually has."),
      ready(
        "Infrastructure",
        "vms?purpose=infrastructure&purpose=service",
        HardDrive,
        "The machines that are sovren's own: the overlay, the control plane, a Dokploy host.",
      ),
      ready("Workloads", "vms?purpose=workload", HardDrive, "The machines handed to an operator."),
      ready("Peers", "peers", Network, "Every machine enrolled on the overlay."),
      ready("Tasks", "tasks", ListChecks, "Every run, and the state it reached."),
    ],
  },
  site: {
    id: "site",
    label: "Site",
    to: "/site",
    entries: [
      ready("Nodes", "nodes", Server, "The machines in this lab."),
      ready(
        "Infrastructure",
        "vms?purpose=infrastructure&purpose=service",
        HardDrive,
        "This lab's own machines.",
      ),
      ready("Workloads", "vms?purpose=workload", HardDrive, "The boxes handed to an operator."),
      ready("Peers", "peers", Network, "The peers enrolled from this lab."),
    ],
  },
  settings: {
    id: "settings",
    label: "Settings",
    to: "/settings/connections",
    entries: [
      ready(
        "Connections",
        "connections",
        Cable,
        "Proxmox, NetBird and Dokploy: what sovren has been told, and whether it answers.",
      ),
      planned(
        "Audit log",
        "audit",
        SlidersHorizontal,
        "Every request sovren made, and the code it came back with.",
        "—",
      ),
      ready(
        "Console",
        "console",
        Settings2,
        "The mock backend controls, and what this prototype is.",
      ),
    ],
  },
};

/** The scope switcher's three entries, in the order they appear in the top bar. */
export const SCOPE_ORDER: readonly ScopeId[] = ["fleet", "site", "settings"];

/** A scope's entry, at its own path. */
export const entryPath = (scope: ScopeId, entry: NavEntry, site?: string): string => {
  const suffix = entry.to === "" ? "" : `/${entry.to}`;
  switch (scope) {
    case "fleet":
      return `/fleet${suffix}`;
    case "site":
      return site === undefined || site === "" ? "/site" : `/site/${site}${suffix}`;
    case "settings":
      return `/settings${suffix}`;
  }
};

/** The Site a pathname is looking at, or `undefined` outside a Site scope. */
export const siteInPath = (pathname: string): string | undefined => {
  const match = /^\/site\/([^/]+)/.exec(pathname);
  return match?.[1];
};
