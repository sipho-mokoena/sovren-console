import { createFileRoute, redirect } from "@tanstack/react-router";

/** Settings opens on the connections: the thing an operator comes here to do. */
export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/connections" });
  },
});
