/**
 * The mock backend for the sovren console.
 *
 * Everything the console renders in this prototype comes from here. There is no
 * control plane and no Proxmox, NetBird or Dokploy anywhere in the build, so a
 * screen that works against this works against a document, and a screen that does
 * not was never working.
 *
 * ## What a consumer gets
 *
 * ```ts
 * import { setupSovrenServer } from "@sovren/fakes";
 *
 * const server = setupSovrenServer();   // node: the test suite
 * // const worker = setupSovrenWorker(); // browser: the dev server
 * ```
 *
 * Both are seeded from the same estate, so a screen looks the same in the dev
 * server as it does in a test. That is R54, and it is why the estate is a value
 * both read rather than two fixtures that were kept in step by hand.
 *
 * ## The two controls an operator has
 *
 * Both are values in the URL, so both work in a browser and in a test from the
 * same input -- R56. Neither is a header, and neither is an environment variable.
 *
 * | What                     | How                                    | Example                                    |
 * | ------------------------ | -------------------------------------- | ------------------------------------------ |
 * | Which estate             | `?estate=<name>`                        | `/nodes?estate=compact`                     |
 * | Which failure            | `?sentinel=<name>` or a `~name` segment | `/nodes?sentinel=upstream-unavailable`      |
 *
 * The sentinel names are the error codes, kebab-cased. `SENTINEL_NAMES` and
 * `sentinelHelp` are the machine-readable and human-readable forms, and the same
 * URL produces the same failure in the dev server as in a test.
 *
 * ## What is deliberately not here
 *
 * **No Proxmox, NetBird or Dokploy response shape is invented.** Those have to be
 * recorded from a live cluster (R55) because the Proxmox document types only 39%
 * of them, and a hand-written guess would be a fixture that lies convincingly.
 * This package mocks sovren's own contract, which is the part that is knowable
 * without hardware. The upstream fixtures remain open work.
 */

import { setupServer } from "msw/node";
import type { SetupServer } from "msw/node";

import { sovrenHandlers } from "./backend/handlers";
import { checkEstate } from "./estate/consistency";
import { ESTATES } from "./estate/registry";

/**
 * The handlers, seeded from the estate each request selects.
 *
 * A function because the estate is chosen per request from the URL, so the
 * handlers have to be able to read it. A constant array would be a fixture, and a
 * fixture is the thing the world builder exists to avoid.
 */
export const handlers = sovrenHandlers;

/**
 * The mock backend in node: the test suite, and any script.
 *
 * `onUnhandledRequest: "error"` on purpose. A request the backend does not serve
 * is a request that would make a real network call in a test -- silently, and
 * then fail on DNS with a message that has nothing to do with the cause. The
 * default fails the test with the path in it, which is the message worth having.
 */
export const setupSovrenServer = (): SetupServer => setupServer(...sovrenHandlers());

/**
 * The mock backend in a browser: the dev server.
 *
 * Exported as a factory rather than a started worker because the console's Vite
 * config has to decide where in the plugin order it starts, and a module that
 * started intercepting on import would do it before the app was ready to be
 * intercepted. `packages/console` owns that decision.
 */
export const setupSovrenWorker = async (): Promise<{ start: () => void; stop: () => void }> => {
  const { setupWorker } = await import("msw/browser");
  const worker = setupWorker(...sovrenHandlers());
  return {
    start: () => void worker.start({ onUnhandledRequest: "error" }),
    stop: () => worker.stop(),
  };
};

/**
 * Every estate the backend can serve, checked for coherence.
 *
 * Called at module load rather than only in a test, because the alternative is a
 * dev server serving an incoherent estate with nothing saying so -- and the whole
 * reason the consistency check exists is that the symptom of a broken fixture is
 * a screen rendering something impossible, which is expensive to trace back.
 *
 * Cheap enough to be free and loud enough to be impossible to miss: a fixture
 * that stops making sense stops the build.
 */
export const assertEstatesCoherent = (): void => {
  for (const estate of Object.values(ESTATES)) {
    const problems = checkEstate(estate);
    if (problems.length === 0) continue;
    const detail = problems
      .map((entry) => `  [${entry.rule}] ${entry.subject}: ${entry.detail}`)
      .join("\n");
    throw new Error(`The estate "${estate.name}" is not internally consistent:\n${detail}`);
  }
};

assertEstatesCoherent();

export * from "./backend/guard";
export * from "./backend/handlers";
export * from "./backend/pagination";
export * from "./backend/projections";
export * from "./estate/build";
export * from "./estate/consistency";
export * from "./estate/identifiers";
export * from "./estate/registry";
export * from "./estate/types";
export * from "./errors/audit-log";
export * from "./errors/sentinels";
export * from "./errors/vocabulary";
