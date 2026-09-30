import { createFileRoute } from "@tanstack/react-router";

import { ConnectionDetail } from "@/screens/connection-detail";

/**
 * Settings → Connections → one integration.
 *
 * The ref in the path is passed to the generated hook untouched, because the
 * contract accepts a name or an id in every path parameter (R32) and the
 * console has no opinion about which one an operator has.
 */
export const Route = createFileRoute("/settings/connections/$connection")({
  component: ConnectionRoute,
});

function ConnectionRoute() {
  const { connection } = Route.useParams();
  return <ConnectionDetail connection={connection} />;
}
