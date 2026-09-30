# Agent brief — building the sovren prototype

Read this before touching anything. It records the decisions already made and the
traps already hit, so you do not rediscover them.

## What you are

An agent in a fleet working on the sovren prototype. Your ticket files are under
`.scratch/prototype-console-and-docs/issues/`. Read the ones assigned to you
first — they are the spec for your work, and their acceptance criteria are the
definition of done.

## Environment

- `pnpm` is **not on the default PATH**. Prefix commands with
  `export PATH="$HOME/.local/share/pnpm:$PATH" &&`
- `vp` is the project's toolchain (a Vite+ wrapper). `vp install`, `vp check`,
  `vp test`.
- `docs/specs/sovren-control-plane.md` is authoritative on behaviour.
  `docs/tech-stack.md` indexes requirements R1–R69 — cite the `R` numbers your
  work serves.
- There is no control plane and no Proxmox, NetBird or Dokploy anywhere in this
  prototype. Everything the console renders comes from the mock backend.

## Verification, before you call it done

```sh
export PATH="$HOME/.local/share/pnpm:$PATH" && vp check --fix   # format + lint + types
export PATH="$HOME/.local/share/pnpm:$PATH" && vp test          # every test
```

`vp check --fix` reformats. Run it before reading your own diff — the repo is
formatted with semicolons and double quotes, and your editor's defaults are not.
A change is not finished until `vp check` reports zero errors and zero warnings
and `vp test` is green.

## The architecture you are working inside

| Package               | Owns                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `openapi/sovren.json` | The contract. The spine. Everything downstream is generated.          |
| `packages/client`     | Generated: typed client, react-query hooks, Zod schemas, MSW handlers |
| `packages/fakes`      | One estate description, seeding every mock and every test fixture     |
| `packages/console`    | TanStack Start + shadcn/ui, running entirely against the mock         |
| `packages/docs`       | fumadocs, rendering the repository's own markdown                     |
| `config/ports.env`    | The only place a port is written                                      |

Regenerate the client after any document change:

```sh
cd packages/client && pnpm run generate
```

## Traps already hit. Do not re-hit them.

- **Never hand-edit `packages/client/src/generated/`.** It is generated, and the
  safety suite fails the build if a human touched it. Change the document and
  regenerate.
- **Write page schemas flat.** Composing `{items, nextPage}` out of an `allOf`
  against a shared `Page` makes orval emit `items` twice, and a duplicated key is
  not a type. The envelope convention is pinned by a test instead.
- **MSW handler paths are absolute**, `*/api/v1/...`. A relative pattern only
  matches a relative request, and the client always asks with an absolute
  same-origin URL.
- **MSW needs `pool: "forks"`** in the vitest config. Its interceptors patch the
  global `fetch` and cannot reach it from a worker thread. Without it, every test
  silently makes a real network call and fails on DNS.
- **The client never throws.** The generated call returns a union discriminated
  on `status`, so reading a page means narrowing on success first. A component
  that assumes `response.data.items` does not type-check, and that is the
  intended behaviour, not an obstacle to route around.
- **`pnpm dlx shadcn@latest`** will not find pnpm. Use `npx shadcn@latest add
<component>` from `packages/console`. The preset is already recorded in
  `components.json` (style `base-lyra`, base colour `mist`, emerald theme,
  lucide icons, Inter for body and Geist for headings, default radius).

## The seams under test

Agreed in the spec, not negotiable per ticket:

1. **Console screens** — through the generated mock backend, in the browser.
2. **The generated chain** — document → client → validators → MSW handlers, over
   real HTTP, both ends generated.
3. **The world builder** — one estate description, asserted for internal
   consistency.
4. **The safety suite** — repository invariants.

Not under test in this prototype: the control plane's HTTP surface and the
provisioner's line protocol. Neither exists yet.

## Test what a user can observe

A test asserts what the API returns or what the console renders. Not the shape
of an internal adapter, and not that a particular function was called. The tell
that a test has gone bad is that it breaks during a refactor that changed no
behaviour.

Never write a test whose expected value is recomputed the way the code computes
it. Expected values come from the document, the spec, or a literal.

## Vocabulary

Use the project's nouns exactly. Upstream nouns are adopted verbatim and never
renamed; names are invented only for what sovren owns.

- `Drive` is a physical disk on a Node. `Disk` is VM storage. Never swap them.
- `Peer`, `Group`, `Policy`, `SetupKey`, `NetworkResource` are NetBird's.
  `Endpoint` is NetBird's "service", renamed to avoid colliding with the Dokploy
  `Service`. Never call it a service.
- `Node` is a physical machine, `VM` a guest, `Site` a physical grouping that is
  a latency and failure boundary and **not** a security one, `Task` sovren's own
  noun for a unit of asynchronous work.
- `Task` states are `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- Heterogeneity is the normal case. Do not normalise a Node into a fiction.

## Working with other agents

Several agents share this working tree. **Only edit the files your brief assigns
to you.** If you need something from another ticket, note it in your report
rather than building it. Do not run `git checkout`, `git stash`, or revert
anything you did not write.
