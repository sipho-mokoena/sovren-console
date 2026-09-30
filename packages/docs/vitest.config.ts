import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The docs tests read repository files -- the Makefile, the port registry,
    // the runbook -- and assert against them. Nothing here renders React.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
