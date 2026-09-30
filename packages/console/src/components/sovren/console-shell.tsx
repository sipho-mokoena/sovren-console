/**
 * The console shell: top bar, scope switcher, sidebar.
 *
 * One layout for all three scopes, because the *frame* is the same and only its
 * contents change. The sidebar is rebuilt from the scope registry on every
 * navigation, so switching scope cannot leave a stale link behind, and the scope
 * itself is in the URL -- which is what makes a Site a place an operator can be,
 * rather than a filter that got lost.
 *
 * **Switching scope never destroys where the operator was.** Every link in the
 * top bar is an ordinary navigation, so the browser's own history holds the
 * previous scope, its filters, its sort and its page, and the back button
 * restores all of it. A scope switcher that reset a stack would be a scope
 * switcher that loses work, and an operator who lost their place once would stop
 * using it.
 */

import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { cn } from "cn";

import { SCOPES, SCOPE_ORDER, entryPath, siteInPath, type ScopeId } from "@/nav/scopes";

export interface ConsoleShellProps {
  scope: ScopeId;
  /** Rendered at the top of the sidebar -- a Site selector, for a Site scope. */
  context?: ReactNode;
  children: ReactNode;
}

export function ConsoleShell({ scope, context, children }: ConsoleShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const site = siteInPath(pathname);
  const definition = SCOPES[scope];

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar current={scope} pathname={pathname} />

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label={`${definition.label} navigation`}
          className="flex w-56 shrink-0 flex-col gap-3 border-r border-border bg-sidebar px-2 py-3 text-sidebar-foreground"
        >
          {/* The scope's name is its explanation. A sentence under it repeated
              itself on every screen in the scope and said nothing the name did
              not, so the space went back to the navigation. */}
          <p className="px-1 font-heading text-xs font-medium">{definition.label}</p>

          {context}

          <nav className="flex flex-col gap-0.5">
            {definition.entries.map((entry) => {
              const path = entryPath(scope, entry, site);
              const active = entryIsActive(path, pathname, searchStr);
              const unavailable = entry.state === "planned";
              const className = cn(
                "flex w-full items-center gap-2 px-1.5 py-1 text-left text-xs",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60",
                unavailable && "cursor-not-allowed opacity-50",
              );

              if (unavailable) {
                // Rendered, greyed, and carrying the reason -- the same treatment
                // a disabled action gets, because it is the same situation.
                return (
                  <span
                    key={entry.label}
                    aria-disabled="true"
                    data-nav-state="planned"
                    title={`${entry.description} Not built yet${entry.ticket === undefined ? "" : ` -- ticket ${entry.ticket}`}.`}
                    className={className}
                  >
                    <entry.icon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{entry.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {entry.ticket ?? "—"}
                    </span>
                  </span>
                );
              }

              return (
                <Link
                  key={entry.label}
                  to={path}
                  className={className}
                  data-nav-state="ready"
                  // "You are here", said to a screen reader rather than only to
                  // the eye. The highlight is a colour; this is the fact. It also
                  // means a test can ask which entry is current without reading a
                  // class name -- and the inactive class contains the active
                  // class as a substring, so a test that greps for it passes on
                  // every entry at once.
                  aria-current={active ? "page" : undefined}
                >
                  <entry.icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{entry.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-3">
          <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-3">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * Whether a sidebar entry is the page being looked at.
 *
 * An entry may carry a query -- Fleet's **Infrastructure** and **Workloads** are
 * one list at two different questions, told apart only by `?purpose=` -- and
 * comparing the path alone marked both of them current at once on `/fleet/vms`.
 * An entry with a query is therefore current only when the query matches, and a
 * bare `/fleet/vms` is neither, which is the truth: it is the whole estate, and
 * the page's own view switch says so.
 *
 * Both sides are compared as sorted parameter lists rather than as strings, so
 * `?purpose=service&purpose=infrastructure` is the same page as the order the
 * registry happens to write them in.
 */
function entryIsActive(path: string, pathname: string, searchStr: string): boolean {
  const [pathOnly, query] = path.split("?");
  if (pathOnly === undefined) return false;
  if (query === undefined) {
    return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  }
  return pathname === pathOnly && sameQuery(query, searchStr);
}

const sameQuery = (left: string, right: string): boolean => {
  const read = (query: string): [string, string][] => {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    return [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  };
  const a = read(left);
  const b = read(right);
  return a.length === b.length && a.every(([k, v], i) => k === b[i]?.[0] && v === b[i]?.[1]);
};

function TopBar({ current, pathname }: { current: ScopeId; pathname: string }) {
  const site = siteInPath(pathname);

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-3">
      <Link to="/fleet/nodes" className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center bg-primary text-primary-foreground">
          <Boxes className="size-3.5" aria-hidden />
        </span>
        <span className="font-heading text-sm font-medium">sovren</span>
      </Link>

      <nav aria-label="Scope" className="flex items-center gap-0.5" data-scope-switcher="true">
        {SCOPE_ORDER.map((id) => {
          const scope = SCOPES[id];
          const target = id === "site" && site !== undefined ? `/site/${site}` : scope.to;
          const active = id === current;
          return (
            <Link
              key={id}
              to={target}
              data-scope={id}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border px-2.5 py-1 text-xs",
                active
                  ? "border-border bg-muted font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {scope.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">prototype</span>
        <span>everything renders from the mock backend</span>
      </div>
    </header>
  );
}
