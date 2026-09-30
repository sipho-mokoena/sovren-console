import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Orval is a child process writing a tree to a temporary directory, and the
    // coverage check reads the whole generated tree off disk. Neither is affected
    // by which pool runs them, and this suite never touches the network or MSW's
    // global fetch, so the default pool is correct here -- unlike `packages/fakes`,
    // which needs `forks` because MSW's interceptors cannot reach a worker.
    //
    // The generation tests are the slow ones, and they are slow in wall-clock
    // terms only: orval is a separate process that runs in about half a second.
    // The cap is generous enough that a cold, contended machine does not turn a
    // passing suite red, and tight enough that a hung orval is a failure rather
    // than a wedged `make check`.
    testTimeout: 60_000,
  },
});
