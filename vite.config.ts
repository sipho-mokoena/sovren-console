import { availableParallelism } from "node:os";

import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    // refs/ is vendored upstream material, not ours to reformat.
    // Oxfmt's YAML parser also rejects the multi-line flow sequence in
    // refs/netbird-openapi.yml, which the real YAML spec permits.
    //
    // Generated output is excluded for a different and harder reason: `check
    // --fix` would *rewrite* it. Orval emits `({...{...}, ...override})` for
    // every nested mock, `no-useless-spread` flags it, and the fixer deletes the
    // spread -- leaving a tree where a human has edited generated output, which
    // is exactly what the safety suite exists to catch. A clean tree must mean
    // "regenerate and get no diff", never "somebody fixed the generator's
    // output by hand".
    ignorePatterns: ["refs/**", "**/src/generated/**", "**/routeTree.gen.ts"],
  },
  lint: {
    // Same reasoning as fmt, one level up. Linting generated output produces
    // diagnostics nobody can act on, and acting on them corrupts the artefact.
    ignorePatterns: ["**/src/generated/**", "**/routeTree.gen.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    // Two projects, because one environment cannot serve both halves of the
    // suite. The default project is node: the contract, the world builder, the
    // docs site's own checks and the safety suite all run there. The console is
    // jsdom with its own `@/` resolution, because a console screen is a DOM and
    // asserting on a rendered table is the seam it is tested through.
    //
    // Declaring `projects` at all is the point: without it the root run is a
    // single node project that collects the console's DOM tests and then fails
    // to give them a DOM or the alias, which is a failure that says nothing
    // about any screen. Worse, it looks green while never running them.
    /**
     * Half the machine, and stated here rather than in a package.
     *
     * Every console failure in this workspace was `Test timed out in 5000ms`, with
     * a different test each run -- which is what contention looks like, not what a
     * broken screen looks like. A screen test mounts a jsdom document, a query
     * cache and a mock backend; a run of those at once will not each get a core.
     * Unbounded workers produced a suite that passed and then failed at random,
     * and a suite that fails at random is worse than no suite, because it teaches
     * people to re-run until it goes green.
     *
     * It also has to live at the root: vitest refuses to group two projects that
     * disagree about `maxWorkers` unless each is given its own group order, and
     * bounding one package while leaving the rest unbounded fixes nothing.
     */
    maxWorkers: Math.max(2, Math.floor(availableParallelism() / 2)),
    projects: [
      "packages/client/vitest.config.ts",
      "packages/docs/vitest.config.ts",
      "packages/fakes/vitest.config.ts",
      "packages/invariants/vitest.config.ts",
      "packages/console/vitest.config.ts",
    ],
  },
});
