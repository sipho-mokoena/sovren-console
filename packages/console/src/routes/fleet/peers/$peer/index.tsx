import { createFileRoute } from "@tanstack/react-router";

import { PeerDetail } from "@/routes/fleet/peers/-peer-detail";

/**
 * Fleet → Peers → one Peer.
 *
 * The route is the ref and nothing else. `PeerView` accepts a name or an id (R32)
 * -- `Peer.name` is NetBird's mutable name and the document says it "works in any
 * path parameter alongside the id" -- so a colleague can be sent a link carrying
 * either, and the console never has to redirect between them.
 *
 * A sibling of `/fleet/peers/`, not a child of it: the Peers route is a leaf that
 * renders the list, so opening a Peer replaces the list rather than stacking
 * beneath it, and the breadcrumb at the other end hands the operator back the
 * filters, sort and page they left.
 */
export const Route = createFileRoute("/fleet/peers/$peer/")({
  component: FleetPeer,
});

function FleetPeer() {
  const { peer } = Route.useParams();
  return <PeerDetail peer={peer} />;
}
