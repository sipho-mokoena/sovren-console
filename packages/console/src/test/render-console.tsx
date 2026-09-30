/**
 * Rendering a screen, the way the console actually renders one.
 *
 * The console's own router, on the browser's history. Not a hand-built tree of
 * the one route under test, and not a second router configured slightly
 * differently: the shell, the scope switcher, the sidebar, the providers and the
 * search parsing are all part of what an operator sees, and a test that mounted
 * any less of it would pass with a console that could not do the thing.
 *
 * The browser history rather than a memory one is load-bearing twice over. It is
 * what makes "the back button returns to the previous view" assertable, and it is
 * what makes the mock backend's URL controls work: they are read from
 * `location.search`, and a memory history would move the router without moving
 * the URL the backend is handed.
 */

import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { RouterProvider, createBrowserHistory } from "@tanstack/react-router";

import { getRouter } from "@/router";

export interface ConsoleApp extends RenderResult {
  /** The router, so a test can read the URL or drive the history directly. */
  router: ReturnType<typeof getRouter>;
}

/** Render the console at a URL, exactly as an operator would arrive at it. */
export const renderConsole = async (url: string): Promise<ConsoleApp> => {
  window.history.replaceState({}, "", url);

  const router = getRouter(createBrowserHistory());
  const result = render(<RouterProvider router={router} />);
  await router.load();

  return { ...result, router };
};
