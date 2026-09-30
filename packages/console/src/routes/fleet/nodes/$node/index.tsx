import { createFileRoute } from "@tanstack/react-router";

import { NodeDetail } from "@/routes/fleet/nodes/-node-detail";

/**
 * Fleet → Nodes → one Node.
 *
 * The route is the ref and nothing else. `NodeView` accepts a name or an id (R32),
 * and so does every list this page makes, so the console has no opinion about
 * which one the operator has and never has to redirect between them.
 */
export const Route = createFileRoute("/fleet/nodes/$node/")({
  component: FleetNode,
});

function FleetNode() {
  const { node } = Route.useParams();
  return <NodeDetail node={node} />;
}
