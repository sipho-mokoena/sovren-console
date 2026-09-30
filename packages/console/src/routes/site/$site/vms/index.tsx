import { createFileRoute } from "@tanstack/react-router";

import { VmsList } from "@/routes/fleet/vms/-list";
import { useSitePicker } from "@/screens/site-picker";
import { EmptyState } from "@/components/sovren/empty-state";

/**
 * A Site's VMs.
 *
 * The same screen as Fleet's, with a `site`. That is the reuse the archetype
 * exists for: this route adds a path parameter and nothing else, and the list
 * behaves identically -- same columns, same refresh, same pagination -- because
 * it is the same archetype with a filter.
 */
export const Route = createFileRoute("/site/$site/vms/")({
  component: SiteVms,
});

function SiteVms() {
  const { site, unknown } = useSitePicker();

  if (unknown) {
    return (
      <EmptyState
        title={`No Site is called “${site}”`}
        body="A Site is a physical grouping of Nodes, so the ones that exist are the ones with machines in them. Pick one from the sidebar."
      />
    );
  }

  return <VmsList site={site} scopeLabel="One lab." />;
}
