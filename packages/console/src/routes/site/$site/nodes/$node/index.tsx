import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/sovren/empty-state";
import { NodeDetail } from "@/routes/fleet/nodes/-node-detail";
import { useSitePicker } from "@/screens/site-picker";

/**
 * A Site → Nodes → one Node.
 *
 * The same screen as Fleet's, with a `site`, for one reason: so the breadcrumb
 * returns to *this lab's* filtered list rather than to the estate-wide one. A
 * Site scope that could not be exited back into itself would be a scope an
 * operator has to climb out of, and the Nodes list is where they are standing when
 * they decide to open a machine.
 */
export const Route = createFileRoute("/site/$site/nodes/$node/")({
  component: SiteNode,
});

function SiteNode() {
  const { node } = Route.useParams();
  const { site, unknown } = useSitePicker();

  if (unknown) {
    return (
      <EmptyState
        title={`No Site is called “${site}”`}
        body="A Site is a physical grouping of Nodes, so the ones that exist are the ones with machines in them. Pick one from the sidebar."
      />
    );
  }

  return <NodeDetail node={node} site={site} />;
}
