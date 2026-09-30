/**
 * The console's test harness.
 *
 * The mock backend is started here, once, for every test file -- from
 * `@sovren/fakes`, the same handlers the dev server runs, wrapped in the same
 * control bridge. So a test and the dev server take the identical code path from
 * the identical URL (R59), and a test that passes here is a screen an operator
 * will see working.
 *
 * `onUnhandledRequest: "error"` on purpose, for the same reason the node harness
 * sets it: a request the backend does not serve is a request that escaped the
 * interceptor, and the default failure says so with the path in it.
 */

import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { setupServer } from "msw/node";
import { resetAuditLog } from "@sovren/fakes";

import { inheritingHandlers, markBackendReady } from "@/lib/mock-backend";

/**
 * The node server, built from the same wrapped handlers the browser worker gets.
 *
 * `inheritingHandlers` is what makes a test and the dev server take the identical
 * path from the identical URL: the console's `?sentinel=` and `?estate=` reach
 * the backend, in both runtimes, from the one place that carries them. A harness
 * that used the fakes' own `setupSovrenServer` would serve a healthy estate to a
 * test that asked for a failure -- and the test would fail for a reason that has
 * nothing to do with the screen.
 */
const server = setupServer(...inheritingHandlers());

// Five seconds, not the library's one. A route's component is a lazily imported
// chunk, and a cold dynamic import through the test runner's module graph is
// slower than a second on a first navigation into a scope nobody has visited in
// this run. A one-second budget makes that a flake, and a flake in a suite is
// how a real failure stops being believed.
configure({ asyncUtilTimeout: 5_000 });

// jsdom has no layout, so `scrollTo` is unimplemented and every scroll
// restoration logs a warning that says nothing about the console. Stubbed here
// so the only warnings a test run prints are the ones worth reading.
window.scrollTo = () => undefined;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  // The console's gate holds the first render until the backend answers. A node
  // server needs no browser worker, so it is ready the moment it is listening.
  markBackendReady();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetAuditLog();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterAll(() => server.close());
