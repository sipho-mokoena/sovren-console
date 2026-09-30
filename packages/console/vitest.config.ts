import { defineConfig } from "vitest/config";

/**
 * The console's test project.
 *
 * Separate from `vite.config.ts` because this is a Vite app rather than a
 * vite-plus one: its `defineConfig` is Vite's, which has no `test` block to put
 * settings in. Run these with `pnpm --filter @sovren/console test` (or
 * `vp run test` from this directory), which is the `test` script in this
 * package's `package.json`.
 */
export default defineConfig({
  // The same `@/…` resolution the dev server and the build get, from the same
  // tsconfig. Without it a test imports a screen by one path and the screen
  // imports its own modules by another, and the failure is a resolution error
  // rather than a screen.
  resolve: { tsconfigPaths: true },
  test: {
    // Only the browser tests. They are named `*.browser.tsx` because they render
    // a screen, and `vp test` at the repository root is a single node project
    // over the whole workspace: it would collect them and then fail to give them
    // a DOM or the `@/` alias, which is a failure that says nothing about the
    // console. The root config now declares this package as a `test.projects`
    // entry, so `vp test` runs them too.
    include: ["src/**/*.browser.{ts,tsx}"],
    // jsdom, because a console screen is a DOM, and asserting on a rendered
    // table is the seam this package is tested through.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // MSW's interceptors patch the global `fetch`, and they cannot reach it from
    // inside a worker thread. A forked process is the difference between the
    // mock backend intercepting a request and a console test making a real one --
    // which fails on DNS with a message that has nothing to do with the screen.
    pool: "forks",
    /**
     * A timeout with headroom.
     *
     * Every failure in this package used to be `Test timed out in 5000ms`, and a
     * different test each run -- which is what contention looks like, not what a
     * broken screen looks like. A screen test mounts a jsdom document, a react-
     * query cache and a mock backend, and a run of this many at once will not each
     * get a core. The worker count is bounded in the **root** config, because that
     * is the level at which the contention exists and because vitest refuses to
     * group projects that disagree about it.
     *
     * The timeout is deliberately *not* generous: a test that still cannot finish
     * in 20s is telling us something, and this is the number that says it.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
