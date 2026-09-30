import { createFileRoute } from "@tanstack/react-router";

import { SiteIndex } from "@/screens/site-index";

/**
 * The Site scope's index: the labs, and how many machines are in each.
 *
 * A scope with no landing page forces a choice before anything can be read, and
 * "which lab am I in" is a question with a list as its answer.
 */
export const Route = createFileRoute("/site/")({
  component: SiteIndex,
});
