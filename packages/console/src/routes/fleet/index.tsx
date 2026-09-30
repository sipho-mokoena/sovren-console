import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/fleet` is the scope, not a page. The scope opens on its first entry. */
export const Route = createFileRoute("/fleet/")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/nodes" });
  },
});
