import { createBrowserHistory, createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { parseSovrenSearch, stringifySovrenSearch } from "./lib/search-params";

/**
 * The console's router.
 *
 * The history is a parameter for one reason: a test needs to start at a URL it
 * chose -- `?sentinel=conflict`, `?q=desk` -- and needs the browser's own history
 * afterwards, because "the back button returns to the previous view" is one of
 * the things a test has to be able to assert. The dev server and the build pass
 * nothing and get the browser history they would have got anyway.
 */
export function getRouter(history?: ReturnType<typeof createBrowserHistory>) {
  const router = createTanStackRouter({
    routeTree,
    ...(history === undefined ? {} : { history }),

    // Every search parameter is the string the URL said. See `search-params.ts`
    // for why the default parser is not good enough for a console whose filters
    // are substrings of names.
    parseSearch: parseSovrenSearch,
    stringifySearch: stringifySovrenSearch,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
