# 01: Two runtimes, one workspace, one port registry

**What to build:** An operator clones the repo and runs one command. `make install` brings the toolchain up for both runtimes, `make dev` starts the console and the documentation site side by side under `concurrently`, and `make check` runs the whole verification sweep and fails loudly. The two runtimes — the Vite-based console and the Next-based documentation site — coexist in one pnpm workspace without either toolchain's assumptions leaking into the other, and every port the project will ever publish is named in exactly one place instead of being hard-coded in three.

Serves R36, R37, R57, R59. The runtime split is forced by the stack: fumadocs 16.x needs Next 16 and React 19.2, the console needs TanStack Start on Vite.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Delivered.**

- [ ] `make install`, `make dev`, and `make check` exist and are the documented entry points; the root README states them.
- [ ] The Vite/TypeScript packages and the Next-based documentation package install and build side by side in the same workspace, and no root dependency override forces one runtime's toolchain onto the other.
- [ ] `make dev` starts every long-running local process under `concurrently`, prefixes each stream with its service name, and shuts all of them down cleanly on one signal.
- [ ] The port block (console, documentation, API, database) is declared once and consumed by the Makefile, the compose file, and the documentation — changing a port is a one-edit change.
- [ ] The chosen ports are high and non-default, and none collides with a default Postgres or Vite port.
- [ ] `make check` fails on a type error, a lint error, a failing test, or a stale generated artefact, and its exit code is non-zero.
- [ ] A fresh clone on a clean machine reaches the same state with no undocumented step.

## Comments

Delivered. `config/ports.env` is the only place a port is written; the Makefile includes it, compose reads it as an env file, the docs site renders it. The root `vite@*: catalog:` override is gone so the Next app is not forced onto Vite. **Regression found and fixed after handoff:** `.PHONY: generate:check` made `make` unparseable for everyone, so the targets are now `generate-check` and `down-hard`.
