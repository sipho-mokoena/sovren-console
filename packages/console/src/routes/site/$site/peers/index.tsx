import { createFileRoute } from "@tanstack/react-router";

import { PeersList } from "@/routes/fleet/peers/-list";
import { useSitePicker } from "@/screens/site-picker";
import { EmptyState } from "@/components/sovren/empty-state";

/**
 * A Site's Peers.
 *
 * The same screen as Fleet's, with a `site`. That is the reuse the archetype
 * exists for: this route adds a path parameter and nothing else, and the list
 * behaves identically -- same columns, same refresh, same pagination -- because
 * it is the same archetype with a filter.
 *
 * **The Node column is dropped here.** Every peer in a Site is by definition in
 * that lab, so the column would repeat what the sidebar already says, and a Site
 * scope is the narrow working view. What it does not do is pretend the peers are
 * estate hardware: a Site filter also removes the operator's own laptop, because
 * that laptop is in no Site at all, and the scope's own description says so.
 */
export const Route = createFileRoute("/site/$site/peers/")({
  component: SitePeers,
});

function SitePeers() {
  const { site, unknown } = useSitePicker();

  if (unknown) {
    return (
      <EmptyState
        title={`No Site is called “${site}”`}
        body="A Site is a physical grouping of Nodes, so the ones that exist are the ones with machines in them. Pick one from the sidebar."
      />
    );
  }

  return <PeersList site={site} scopeLabel="One lab." />;
}
