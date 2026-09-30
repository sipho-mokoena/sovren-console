import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseMakeTargets, readMakeTargets } from "../lib/makefile";
import { locateRegistry } from "../lib/ports";

const repoRoot = locateRegistry().root;
const runbook = readFileSync(path.join(repoRoot, "content", "runbook.mdx"), "utf8");

/** `make install`, `make down:hard` -- and nothing else is a command in a runbook. */
function commandsIn(markdown: string): string[] {
  return [...markdown.matchAll(/\bmake\s+([A-Za-z0-9_.:-]+)/g)].map(([, target]) => target ?? "");
}

describe("the runbook", () => {
  test("only tells an operator to run targets the Makefile declares", () => {
    const declared = new Set(readMakeTargets());
    const promised = [...new Set(commandsIn(runbook))].sort();

    expect(promised).not.toEqual([]);
    expect(promised.filter((target) => !declared.has(target))).toEqual([]);
  });

  test("opens with the three commands the README gives", () => {
    expect(commandsIn(runbook)).toEqual(expect.arrayContaining(["install", "dev", "check"]));
  });

  test("covers the container path as well as the local one", () => {
    expect(commandsIn(runbook)).toEqual(expect.arrayContaining(["up", "down", "ps", "logs"]));
  });

  test("never writes a port number, because the registry is the only place", () => {
    const ports = runbook.match(/\b\d{4,5}\b/g) ?? [];

    // 24 is the Node major version, which is a version and not a port.
    expect(ports.filter((port) => port !== "24")).toEqual([]);
  });

  test("does not tell an operator to run anything other than make", () => {
    const codeBlocks = [...runbook.matchAll(/```sh\n([\s\S]*?)```/g)].map(([, body]) => body ?? "");

    for (const block of codeBlocks) {
      for (const line of block.split("\n")) {
        if (line.trim() === "") continue;
        expect(line).toMatch(/^(export PATH|make )/);
      }
    }
  });
});

describe("the Makefile reader", () => {
  test("reads targets, prerequisites and colon-separated names, but not recipes", () => {
    expect(
      parseMakeTargets(
        [
          ".DEFAULT_GOAL := help",
          "CONSOLE := packages/console",
          "",
          "## help: list the targets",
          ".PHONY: help",
          "help:",
          "\t@grep -E '^## ' $(MAKEFILE_LIST)",
          "",
          "check: lint typecheck test",
          "\t@echo done",
          "generate:check: fail if stale",
          "\t@cd $(CLIENT) && pnpm run generate",
          "down:hard:",
        ].join("\n"),
      ),
    ).toEqual(["check", "down:hard", "generate:check", "help"]);
  });
});
