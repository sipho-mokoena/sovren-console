import { createFileRoute } from "@tanstack/react-router";

import { ConsolePage } from "@/screens/console-page";

/**
 * Settings → Console: what this prototype is, and the failure switches.
 *
 * The other Settings entry, and the reason it is a real page rather than a
 * hidden menu is in `console-page.tsx`.
 */
export const Route = createFileRoute("/settings/console")({
  component: ConsolePage,
});
