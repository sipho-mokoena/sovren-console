import { createFileRoute } from "@tanstack/react-router";

import { NodesList } from "@/screens/nodes-list";

/**
 * Fleet → Nodes.
 *
 * The route is three lines: the screen. Everything the screen needs comes from
 * the archetype, and everything the archetype needs comes from the generated
 * hook and the URL.
 */
export const Route = createFileRoute("/fleet/nodes/")({
  component: FleetNodes,
});

function FleetNodes() {
  return <NodesList scopeLabel="Across every Site." />;
}
