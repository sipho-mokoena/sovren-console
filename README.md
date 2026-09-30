# sovren

A control plane and console for an estate of retired university desktops. Proxmox,
NetBird and Dokploy presented as one set of nouns rather than three dashboards.

- `docs/specs/sovren-control-plane.md` — authoritative on behaviour
- `docs/tech-stack.md` — requirements R1–R69 and the stack decisions
- `.scratch/prototype-console-and-docs/` — the prototype's tickets

## Getting started

```sh
make install    # install every workspace package
make dev        # console on 4141, documentation site on 4142
make check      # generate, format, lint, type-check, test
```

`make help` lists every target. Every port comes from `config/ports.env` and is
declared in exactly one place.

## The shape of it

| Package               | What it is                                                               |
| --------------------- | ------------------------------------------------------------------------ |
| `openapi/sovren.json` | The contract. Everything downstream is generated from this one file.     |
| `packages/client`     | Generated: typed client, react-query hooks, Zod validators, MSW handlers |
| `packages/fakes`      | One estate description, seeding every mock and every test fixture        |
| `packages/console`    | TanStack Start + shadcn/ui. Runs entirely against the mock backend       |
| `packages/docs`       | fumadocs. Renders the repository's own markdown                          |

The console needs no Proxmox, no NetBird, no Dokploy and no control plane to
run. The mock backend is generated from the same document as the client, which
is what makes it incapable of drifting from one.

## Port registry

`config/ports.env` is the only place a port is written. The Makefile includes it,
docker compose reads it as an env file, and the documentation site renders it.
