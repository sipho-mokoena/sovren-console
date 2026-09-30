import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { locateRegistry, parsePortRegistry, readPortRegistry } from "../lib/ports";

const repoRoot = locateRegistry().root;

function readRegistryText(): string {
  return readFileSync(path.join(repoRoot, "config", "ports.env"), "utf8");
}

/**
 * A second, deliberately dumb reader of the registry. It exists so the port map
 * is checked against the file rather than against the parser that renders it.
 */
function assignments(source: string): [string, number][] {
  return source.split("\n").flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(\d+)$/.exec(line.trim());
    return match?.[1] && match[2] ? ([[match[1], Number(match[2])]] as [string, number][]) : [];
  });
}

describe("config/ports.env", () => {
  test("is found by walking up from the docs package", () => {
    expect(path.relative(repoRoot, path.join(repoRoot, "config", "ports.env"))).toBe(
      path.join("config", "ports.env"),
    );
  });
});

describe("the port map the site renders", () => {
  test("has one entry per assignment in the registry", () => {
    const expected = assignments(readRegistryText());
    const actual = readPortRegistry().entries.map(({ name, port }) => [name, port] as const);

    expect(actual).toEqual(expected.map(([name, port]) => [name, port]));
  });

  test("adds no ports that are not in the registry", () => {
    const declared = new Set(assignments(readRegistryText()).map(([name]) => name));
    const rendered = readPortRegistry().entries.map(({ name }) => name);

    expect(rendered.filter((name) => !declared.has(name))).toEqual([]);
  });

  test("renders every port, not a subset", () => {
    const rendered = readPortRegistry().entries.map(({ name }) => name);
    const expected = [
      "SOVREN_CONSOLE_PORT",
      "SOVREN_DOCS_PORT",
      "SOVREN_API_PORT",
      "SOVREN_POSTGRES_PORT",
    ];

    for (const name of expected) expect(rendered).toContain(name);
  });

  test("binds every port the README promises", () => {
    const ports = readPortRegistry().entries.map(({ port }) => port);
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");

    for (const mentioned of readme.match(/localhost:(\d+)/g) ?? []) {
      const port = Number(/:(\d+)$/.exec(mentioned)?.[1]);
      expect(ports).toContain(port);
    }
  });

  test("gives every port a description drawn from the registry's own comment", () => {
    for (const entry of readPortRegistry().entries) {
      expect(entry.description.length).toBeGreaterThan(0);
      // the sentence that only restates the number is dropped, so no
      // description should contain the port it describes
      expect(entry.description).not.toContain(String(entry.port));
    }
  });

  test("drops the sentence that only restates the number", () => {
    const [entry] = parsePortRegistry(
      ["# The console. 4141 sits clear of Vite's 5173.", "SOVREN_CONSOLE_PORT=4141", ""].join("\n"),
      "config/ports.env",
    );

    expect(entry).toEqual({
      name: "SOVREN_CONSOLE_PORT",
      port: 4141,
      description: "The console.",
      source: "config/ports.env",
    });
  });

  test("keeps commentary that is about the service, not the number", () => {
    const [entry] = parsePortRegistry(
      [
        "# The control plane's REST API. 4143. Reserved now, served once",
        "# packages/api exists.",
        "SOVREN_API_PORT=4143",
        "",
      ].join("\n"),
      "config/ports.env",
    );

    expect(entry?.description).toBe(
      "The control plane's REST API. Reserved now, served once packages/api exists.",
    );
  });

  test("ignores comments, blank lines and non-port assignments", () => {
    expect(
      parsePortRegistry(
        [
          "# a header",
          "SOVREN_NOT_A_PORT=nope",
          "PATH=/usr/bin",
          "",
          "  # indented comment",
          "SOVREN_CONSOLE_PORT=4141",
        ].join("\n"),
        "config/ports.env",
      ),
    ).toEqual([
      {
        name: "SOVREN_CONSOLE_PORT",
        port: 4141,
        description: "indented comment",
        source: "config/ports.env",
      },
    ]);
  });
});
