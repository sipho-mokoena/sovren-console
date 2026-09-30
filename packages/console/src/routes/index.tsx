import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The root is a redirect, not a landing page.
 *
 * The console's first question is "is anything broken", and that is the Fleet
 * scope's Nodes list. A landing page that had to be built and kept current would
 * be one more place for the answer to go stale.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/nodes" });
  },
});
