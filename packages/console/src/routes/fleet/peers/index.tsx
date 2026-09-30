import { createFileRoute } from "@tanstack/react-router";

import { PeersList } from "./-list";

/**
 * Fleet → Peers.
 *
 * The route is three lines: the screen. Everything the screen needs comes from
 * the archetype, and everything the archetype needs comes from the generated
 * hook and the URL.
 */
export const Route = createFileRoute("/fleet/peers/")({
  component: FleetPeers,
});

function FleetPeers() {
  return <PeersList scopeLabel="Across every Site." />;
}
