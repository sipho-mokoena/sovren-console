import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // MSW's interceptors patch the global fetch, and they cannot reach it from
    // inside a worker thread. A forked process is the difference between the
    // mock backend intercepting a request and the test making a real one.
    pool: "forks",
  },
});
