import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/sovren/console-shell";

/**
 * The Fleet scope: the whole estate, across every Site.
 *
 * The scope is the path, so the scope is in the URL (R41) and a Fleet view is a
 * link. The sidebar is rebuilt from the registry rather than written here, so
 * adding an entry is one line in `nav/scopes.ts` and not a layout edit.
 */
export const Route = createFileRoute("/fleet")({
  component: FleetLayout,
});

function FleetLayout() {
  return (
    <ConsoleShell scope="fleet">
      <Outlet />
    </ConsoleShell>
  );
}
