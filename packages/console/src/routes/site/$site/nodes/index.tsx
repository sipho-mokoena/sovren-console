import { createFileRoute } from "@tanstack/react-router";

import { NodesList } from "@/screens/nodes-list";
import { useSitePicker } from "@/screens/site-picker";
import { EmptyState } from "@/components/sovren/empty-state";

/**
 * A Site's Nodes.
 *
 * The same screen as Fleet's, with a `site`. That is the reuse the archetype
 * exists for: this route adds a path parameter and nothing else, and the list
 * behaves identically -- same columns, same refresh, same pagination -- because
 * it is the same archetype with a filter.
 */
export const Route = createFileRoute("/site/$site/nodes/")({
  component: SiteNodes,
});

function SiteNodes() {
  const { site, unknown } = useSitePicker();

  if (unknown) {
    return (
      <EmptyState
        title={`No Site is called “${site}”`}
        body="A Site is a physical grouping of Nodes, so the ones that exist are the ones with machines in them. Pick one from the sidebar."
      />
    );
  }

  return <NodesList site={site} scopeLabel="One lab." />;
}
