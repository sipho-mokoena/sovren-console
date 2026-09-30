import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/sovren/console-shell";

/**
 * The Settings scope.
 *
 * Deliberately a different scope and not a page in Fleet (R37). The three
 * upstream credentials are the most sensitive thing the console holds, and a
 * sidebar that mixed them with machines would put "NetBird" next to "Nodes" in
 * the same list of links -- an operator scanning for a broken machine would learn
 * the shape of the control plane's credentials without meaning to.
 */
export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <ConsoleShell scope="settings">
      <Outlet />
    </ConsoleShell>
  );
}
