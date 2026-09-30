/**
 * The mock backend, in the browser and in the console's own tests.
 *
 * R59: console tests and the dev server run against the same mock backend, or
 * the console is testing something the operator will never see. The handlers
 * come from `@sovren/fakes` -- the ones wrapping orval's generated handlers and
 * serving the estate -- and the two runtimes differ only in the interceptor:
 * `msw/browser` behind a service worker for the dev server, `msw/node` for the
 * test suite.
 *
 * ## The bridge, and why it exists
 *
 * The mock backend reads two controls out of *its own* request URL: which
 * estate to serve (`?estate=`) and which failure to serve (`?sentinel=`). The
 * generated client, however, builds its URLs from the document -- `/api/v1/nodes`
 * with whatever parameters the operation declares -- and the document declares
 * neither. So a control an operator selected in the console's address bar would
 * not reach the backend, and `?sentinel=upstream-unavailable` in a browser would
 * quietly serve a healthy estate.
 *
 * That is not fixed by editing the client, which is generated and owned
 * elsewhere. It is fixed here: each handler is given the console's own `estate`
 * and `sentinel` values before it runs. So the URL an operator edits is the URL
 * that decides what the backend serves, in the dev server and in a test, from
 * one mechanism -- which is what R56 asks for.
 *
 * The controls are inherited rather than forced, so a request that already
 * carries one keeps it.
 *
 * ## Why the fakes are reached by path
 *
 * `@sovren/fakes`'s entrypoint also exports the *node* harness, so importing it
 * from a browser bundle pulls `msw/node` and its `node:http` and `node:stream`
 * imports into a bundle that has no node in it. The console therefore reaches
 * the three modules it needs -- the handlers, the estate registry and the
 * sentinel vocabulary -- by their paths inside the package, none of which touch
 * `msw/node`. The tidier fix is subpath exports on `@sovren/fakes` (`.` and
 * `./handlers`), and it belongs to whoever owns that package; recorded in the
 * console's report rather than done here.
 */

import { HttpHandler } from "msw";

import { ESTATE_NAMES, ESTATE_PARAM } from "../../../fakes/src/estate/registry";
import { SENTINEL_NAMES, SENTINEL_PARAM, sentinelHelp } from "../../../fakes/src/errors/sentinels";
import { sovrenHandlers } from "../../../fakes/src/backend/handlers";

export { ESTATE_NAMES, ESTATE_PARAM, SENTINEL_NAMES, SENTINEL_PARAM, sentinelHelp };

/** The two values the console's own URL decides for every request. */
const CONTROL_PARAMS = [ESTATE_PARAM, SENTINEL_PARAM] as const;

/** Where the console is right now, as a value. Empty in a test that sets one. */
const locationSearch = (): string => {
  if (typeof globalThis.location === "undefined") return "";
  if (typeof globalThis.location.search !== "string") return "";
  return globalThis.location.search;
};

/** The controls the console's own URL is asking for, as request parameters. */
export const controlsFromLocation = (): URLSearchParams => {
  const inherited = new URLSearchParams();
  const current = new URLSearchParams(locationSearch());
  for (const name of CONTROL_PARAMS) {
    const value = current.get(name);
    if (value !== null && value !== "") inherited.set(name, value);
  }
  return inherited;
};

/**
 * One request, carrying the console's controls.
 *
 * Rebuilt only when there is something to add: a `Request` cannot be mutated,
 * and rebuilding one that has a body would mean re-reading a stream, so a
 * request that already says what it means is passed straight through.
 */
export const inheritControls = (request: Request): Request => {
  const inherited = controlsFromLocation();
  if (inherited.size === 0) return request;

  const url = new URL(request.url);
  let added = false;
  for (const [name, value] of inherited) {
    if (url.searchParams.has(name)) continue;
    url.searchParams.set(name, value);
    added = true;
  }
  return added ? new Request(url, request) : request;
};

let wrapCount = 0;

/**
 * The estate's handlers, each one given the console's controls first.
 *
 * The handler's own method and path are preserved and its resolver is reached
 * through MSW's public `run`, so this is a wrapper and not a re-declaration: the
 * endpoints are still the ones the generator wrote, and nothing about how a
 * response is produced is reimplemented here.
 */
export const inheritingHandlers = (): HttpHandler[] =>
  sovrenHandlers().map(
    (handler) =>
      new HttpHandler(handler.info.method, handler.info.path, async (info) => {
        wrapCount += 1;
        const executed = await handler.run({
          request: inheritControls(info.request) as Parameters<typeof handler.run>[0]["request"],
          requestId: `wrap${String(wrapCount)}`,
        });
        // `run` is MSW's own "execute this handler and give me the response".
        // A handler that declined returns nothing, and a resolver that returns
        // nothing hands the request on -- which is what the mock backend's
        // guards rely on.
        return executed?.response;
      }),
  );

/* -------------------------------------------------------------------------- */
/* Readiness                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether requests are already answered.
 *
 * The console renders nothing until this is true, because a screen that fetches
 * before the mock backend is intercepting makes a *real* network call to the
 * dev server, gets HTML where a `NodePage` was expected, and shows an error
 * that has nothing to do with the screen under test. A blank moment during
 * startup is cheaper than that.
 *
 * A test's node server needs no worker, so `markBackendReady` says so directly.
 */
let ready = false;
const listeners = new Set<() => void>();

export const markBackendReady = (): void => {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
};

export const backendIsReady = (): boolean => ready;

export const subscribeToBackend = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

let starting: Promise<void> | null = null;

/**
 * The one switch that stops the console answering from the mock backend.
 *
 * Set it the day a control plane answers on this origin. A build mode is the
 * wrong signal: the mode a container runs in is not a statement about what is
 * listening.
 */
const MOCK_BACKEND_DISABLED = import.meta.env.VITE_MOCK_BACKEND === "off";

/**
 * Start the mock backend in the browser. Idempotent.
 *
 * **Not dev-only, and that correction is load-bearing.** This used to be gated on
 * `import.meta.env.DEV`, on the reasoning that a build would talk to a real
 * control plane and there would be nothing to intercept. There is no real control
 * plane. The mock backend is not a development convenience here -- it is the only
 * backend this prototype has, and it is what `make up` serves from a container.
 * Gating it on DEV meant the containerised console waited forever for a worker
 * that was never going to start, on a page that says "starting the mock
 * backend…" and never says why.
 *
 * What replaces the guard is a real signal rather than a build mode: an explicit
 * opt-out, so the day a control plane exists the console can be pointed at it
 * without editing this file. Until then the mock backend is the answer.
 */
export const startMockBackend = (): void => {
  if (MOCK_BACKEND_DISABLED) return;
  // Already answering: a test's node server, or a second call. Installing a
  // browser worker on top of that would fail, slowly, and for no reason.
  if (ready || starting !== null) return;
  starting = (async () => {
    const { setupWorker } = await import("msw/browser");
    const worker = setupWorker(...inheritingHandlers());
    await worker.start({
      onUnhandledRequest: "error",
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
    markBackendReady();
  })().catch((cause: unknown) => {
    // A worker that never starts would leave a blank console with nothing in
    // the log saying why, so the reason is logged loudly and the console is
    // released anyway: a real request is better than a blank page.
    console.error(
      "sovren: the mock backend did not start, so the console is talking to whatever " +
        "answers on this origin. Run `npx msw init public/` if public/mockServiceWorker.js is missing.",
      cause,
    );
    markBackendReady();
  });
};
