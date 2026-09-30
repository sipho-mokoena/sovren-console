import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsList } from "@/screens/connections-list";

/** Settings → Connections. Outside the fleet view, deliberately (R37). */
export const Route = createFileRoute("/settings/connections/")({
  component: ConnectionsRoute,
});

function ConnectionsRoute() {
  return <ConnectionsList />;
}
