import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * The connections area: the list, and one integration.
 *
 * A layout with no component of its own, so `/settings/connections` and
 * `/settings/connections/proxmox-accra` are siblings under it rather than a
 * parent that has to remember to render its child. A parent route that renders a
 * list and no outlet is a list that silently swallows every page beneath it.
 */
export const Route = createFileRoute("/settings/connections")({
  component: ConnectionsLayout,
});

function ConnectionsLayout() {
  return <Outlet />;
}
