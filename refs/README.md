# Reference Artifacts

Vendored third-party material, kept read-only. **Nothing here is part of the sovren build.**

These are the source of truth for code generation and for the upstream API fakes, so they are tracked: a fresh clone must be able to build against them. Provenance is recorded per file below — if an artifact is ever wrong or missing, this is the record of where it came from and what it should contain.

| File                            | Bytes  | OpenAPI | Paths | Operations |
| ------------------------------- | ------ | ------- | ----- | ---------- |
| `proxmox-ve.json`               | 2.9 MB | 3.1.0   | 449   | 680        |
| `dokploy-openapi.json`          | 1.8 MB | 3.1.0   | 604   | 604        |
| `netbird-openapi.yml`           | 500 KB | 3.1.0   | 130   | —          |
| `proxmox-apidoc-to-snapshot.py` | 3 KB   | —       | —     | —          |

## Licensing

**No third-party source is copied into sovren.** Design concepts borrowed from other infrastructure consoles are taken as ideas, not code. Where any third-party artefact carries a copyleft licence, that obligation is recorded in the spec under _Implementation Decisions → Composition_ and is re-examined before any copying happens.

`dokploy-openapi.json` is ISC-licensed, extracted from the Dokploy SDK.

`proxmox-ve.json` is a _generated data artifact_ produced by a GPL-3.0 tool. Data produced by a tool is not a derivative work of the tool's code, so the spec itself carries no obligation — but that distinction is exactly why the generating project is not vendored here, and why only its output is kept.

## `proxmox-ve.json` — Proxmox VE

|            |                                                        |
| ---------- | ------------------------------------------------------ |
| OpenAPI    | 3.1.0, 449 paths, 680 operations, 81 tag groups        |
| Base URL   | `https://{host}:{port}/api2/json`, default port `8006` |
| Validation | passes Swagger Parser                                  |
| Generated  | 2026-09-28, against PVE 9.2.4 documentation            |

Proxmox publishes no official OpenAPI document — only a bespoke schema behind its API viewer. This file is generated from that schema by the `mihailfox/proxmox-openapi` pipeline (scrape → normalise → generate).

Tag distribution is dominated by `nodes/qemu` (97), `cluster/sdn` (78), `nodes/lxc` (62), and `nodes/ceph` (43). The substrate is qemu plus sdn.

**Request typing is good. Response typing is not.** Parameters carry types, defaults, and descriptions throughout. Only **39% of responses have a schema** — 61% are untyped or bare scalars, and `create_vm` returns `{ "type": "string" }`.

This asymmetry is the most important thing to know about this file. Drive request types from the spec; get response shapes by recording real responses from a live cluster as fixtures. A fake built from this spec alone would be fluent in requests and silent on replies, which is precisely backwards.

## `dokploy-openapi.json` — Dokploy

|           |                                                       |
| --------- | ----------------------------------------------------- |
| OpenAPI   | 3.1.0, 604 paths, 604 operations, 56 tag groups       |
| License   | ISC                                                   |
| Extracted | 2026-09-29 from Dokploy SDK v0.30.7, commit `da303e6` |
| Auth      | `x-api-key` header                                    |

Complete on both the request and the response side — the best-documented of the three, and the only one where generated mocks could plausibly stand on their own.

Two traps:

- Only **33 of the 56** tag groups are declared in the spec's own `tags` array. Tooling that relies on that array will under-report the surface by nearly half.
- Every operation individually declares `security: [{ Authorization: [] }]`, referencing a scheme that is **never defined** in `securitySchemes`. The generated client does not inject auth, so the caller must set `x-api-key` manually.

## `netbird-openapi.yml` — NetBird

|          |                                                                    |
| -------- | ------------------------------------------------------------------ |
| OpenAPI  | 3.1.0, 130 paths, 14 771 lines                                     |
| Base URL | `https://api.netbird.io` — override for the self-hosted management |
| Fetched  | 2026-09-29                                                         |
| SHA-256  | `011f51023d678c2819edcb087c59915c166bd60e7f3cceba5ae2569dc2c2a9d7` |

Replaces an earlier hand-trimmed copy that contained only the `Instance` and `Setup` endpoints. That subset has been deleted: generating a client from it would have produced a console missing peers, groups, policies, setup keys, networks, network resources, routes, DNS, posture checks, and events.

Relevant to the design — policies carry rules with `protocol` (`all` / `tcp` / `udp` / `icmp` / `netbird-ssh`), `ports`, `port_ranges`, `bidirectional`, and posture checks. This is the vocabulary behind the `Policy` and `NetworkResource` nouns.

## `proxmox-apidoc-to-snapshot.py`

The upstream pipeline's scrape stage uses Playwright against the live API viewer and reshapes its output into the snapshot type the normaliser expects: the `info` map becomes a `methods` array, and `allowtoken: 1` becomes `allowToken: true`.

This script performs that same reshape locally, so the Proxmox spec can be regenerated without adding a browser dependency. It is pinned to the upstream `RawApiSnapshot` shape and must be re-checked if those types change.

```sh
python3 refs/proxmox-apidoc-to-snapshot.py <path-to-proxmox-schema>
```

The input is Proxmox's raw API schema, fetched from the API viewer URL recorded in the pipeline's own configuration. Verify it by hash before use — the value the current `proxmox-ve.json` was generated from is `68a8ac7b4994525a1df5530e2d96f4fc76b6401f07861ac8a51635a0b9ce7c53`.
