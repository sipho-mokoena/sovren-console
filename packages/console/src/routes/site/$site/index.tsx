import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A Site opens on its Nodes.
 *
 * A redirect rather than a second rendering of the list, so the URL an operator
 * bookmarks, and the one the back button returns to, is the list's own URL with
 * its filters on it.
 */
export const Route = createFileRoute("/site/$site/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/site/$site/nodes", params: { site: params.site } });
  },
});
