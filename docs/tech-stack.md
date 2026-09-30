# Sovren — Requirements and Tech Stack

Companion to `docs/specs/sovren-control-plane.md`. The spec is authoritative on behaviour; this document indexes the requirements and records the stack decisions.

---

## Requirements

### Product

| #   | Requirement                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------- |
| R1  | Present Proxmox, NetBird, and Dokploy as one set of nouns, not three dashboards                                        |
| R2  | The product is the join: a Proxmox VM, a NetBird peer, and a Dokploy service are the same object seen from three sides |
| R3  | Provision machines with no human at the keyboard after creation                                                        |
| R4  | Bare VMs are a first-class offering, not only a host for Services                                                      |
| R5  | Single organisation; no multi-tenancy                                                                                  |
| R6  | Sovereign — no public internet dependency for reaching anything                                                        |

### Substrate

| #   | Requirement                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R7  | Proxmox VE already installed; no VMs exist yet                                                                                              |
| R8  | The NetBird VM and the control plane VM are created over the LAN first, before anything enrols in the overlay                               |
| R9  | The control plane must not depend on the overlay it manages — it is dual-homed on LAN and vnet                                              |
| R10 | A golden VM is provisioned from a cloud image whose cloud-init installs `qemu-guest-agent` and enrols in NetBird, then marked as a template |
| R11 | Sovren's own infrastructure VMs are describable in its own model                                                                            |
| R12 | NetBird is self-hosted and provides both the overlay network and internal name resolution for boxes and services                            |

### Networking and identity

| #   | Requirement                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| R13 | NetBird is the internal name authority for machines and services                                                               |
| R14 | Two namespaces: internal (NetBird) and public (Traefik, delegated, unused)                                                     |
| R15 | No public domain, so no public CA — a private CA issues one wildcard certificate for the internal domain                       |
| R16 | The NetBird reverse proxy terminates TLS; services need no public address and no open ports                                    |
| R17 | Service access is gated by NetBird group membership, not by a login page                                                       |
| R18 | Plaintext service-to-service traffic is permitted on the mesh; certificates are spent only on browser traffic                  |
| R19 | The CA root is distributable — device enrolment, baked into the machine image, and importable for containers and CI            |
| R20 | Certificate expiry is surfaced before it causes a failure                                                                      |
| R21 | The internal domain apex is not yet chosen; `home.arpa` and `.internal` are standards-reserved, a branded apex is more legible |

### Domain model

| #   | Requirement                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R22 | Upstream nouns are adopted verbatim and never renamed; sovren invents names only for what it owns                                                                                                                                       |
| R23 | Nouns: `Fleet` `Site` `Node` `Drive` `VM` `Disk` `Snapshot` `Image` `Project` `Environment` `Service` `Deployment` `Domain` `Certificate` `Peer` `Group` `Policy` `SetupKey` `NetworkResource` `Endpoint` `CertificateAuthority` `Task` |
| R24 | `Drive` is the physical disk so `Disk` stays unambiguous for VM storage                                                                                                                                                                 |
| R25 | `Service` is one noun discriminated by `kind`: `application` `compose` `postgres` `mariadb` `mysql` `mongo` `redis` `libsql`                                                                                                            |
| R26 | `Endpoint` is renamed from NetBird's "service" to avoid colliding with the Dokploy `Service`                                                                                                                                            |
| R27 | `VM.purpose` is `infrastructure` \| `service` \| `workload`                                                                                                                                                                             |
| R28 | `Site` is a physical grouping — a latency and failure boundary, not a security one                                                                                                                                                      |

### API

| #   | Requirement                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R29 | Operations are named `{resource}{Verb}`                                                                                                                                                                        |
| R30 | Read trio: `List` for collections, `View` for one, and the object itself                                                                                                                                       |
| R31 | Long work returns `202` with a `Task`                                                                                                                                                                          |
| R32 | Every path parameter accepts a name or an id; `id` immutable, `name` mutable                                                                                                                                   |
| R33 | Every list returns `{ items, nextPage }` with an opaque token                                                                                                                                                  |
| R34 | Errors carry an error code and a `requestId` that also appears in an audit log                                                                                                                                 |
| R35 | The generated client returns a discriminated result union and never throws on HTTP failure                                                                                                                     |
| R36 | The DTOs are the spine; the OpenAPI document is derived from them and consumed by the console for its client, validators, and mocks. A CI check fails if the committed document differs from a regenerated one |

### Console

| #   | Requirement                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R37 | Three scopes — Fleet, Site, Settings — switched from the top bar, each with its own sidebar                                                                                                     |
| R38 | Three archetypes — list, detail, form — and every page is one of them                                                                                                                           |
| R39 | A form is a page of its own, on its own route so it is linkable, and returning restores the list's filters, sort and page. State is carried in the URL rather than held by a still-mounted list |
| R40 | Every detail page opens with an ID / created / updated block                                                                                                                                    |
| R41 | State lives in routes and URL parameters, not in a global store                                                                                                                                 |
| R42 | Tables: fixed row heights, sticky identity and action columns, server-side pagination                                                                                                           |
| R43 | A disabled action explains itself rather than disappearing                                                                                                                                      |
| R44 | Toasts use the present tense; the console never claims completion it has not observed                                                                                                           |
| R45 | Visual language is sovren's own — no external design system to inherit                                                                                                                          |

### Provisioning and tasks

| #   | Requirement                                                                                        |
| --- | -------------------------------------------------------------------------------------------------- |
| R46 | A `Task` is a first-class resource because boots, applies, and playbooks all outlast a request     |
| R47 | The provisioner is a Python subprocess emitting a line protocol; a killed task is a killed process |
| R48 | The control plane holds task state, so tasks survive a restart                                     |
| R49 | Logs are held by the control plane and streamed — none of the three upstreams stream               |
| R50 | A running task is cancellable                                                                      |
| R51 | A resource shows a transitional state while its task runs                                          |

### Testing

| #   | Requirement                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| R52 | One primary seam: the control plane's HTTP surface, with all three upstreams faked                                            |
| R53 | Fakes are faithful to the wire format including the ugly parts — string-typed config values, `{"errors": {...}}` error bodies |
| R54 | A world builder seeds all three fakes from one description so fixtures cannot disagree                                        |
| R55 | Proxmox response shapes are recorded from a real cluster as fixtures, because the spec types only 39% of them                 |
| R56 | Error paths are driven by sentinels the user controls, not by request interception                                            |
| R57 | A safety suite enforces repository invariants: spec version matches generated output, generated files are not hand-edited     |
| R58 | The only provisioner seam is the line-protocol parser                                                                         |
| R59 | Console tests and the dev server run against a mock backend generated from sovren's own spec                                  |

### Known constraints

| #   | Constraint                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R60 | Proxmox's API cannot upload cloud-init snippets — SFTP and a PAM account are required. Two credentials, not one                                                           |
| R61 | Custom cloud-init user-data replaces Proxmox's generated config entirely, so hostname and user must be set inside the snippet                                             |
| R62 | The cloud-init drive must stay attached or boot hangs with no useful error                                                                                                |
| R63 | CPU model floor is `kvm64`; the PVE default `x86-64-v2-AES` fails to boot on pre-2010 chips                                                                               |
| R64 | No live migration across mixed or heterogeneous CPUs                                                                                                                      |
| R65 | LVM-thin over ZFS — current ZFS defaults claim a large fraction of RAM and the disks lack power-loss protection                                                           |
| R66 | Corosync requires sub-5ms latency between all nodes; a dedicated NIC and switch is the real requirement                                                                   |
| R67 | No BMC on consumer hardware, so no fencing, so no Proxmox HA. Wake-on-LAN is the only recovery path                                                                       |
| R68 | The shared host runs the overlay, the control plane, its database, and probably Dokploy. Capacity is a load question, not a robustness one — Dokploy moves first if short |
| R69 | The NetBird reverse proxy is beta. It is last in the build order; fallback is service-level TLS with the same CA-issued certificate                                       |

### Out of scope

Hardware failure and disaster recovery · Proxmox HA · live migration · shared storage (Ceph, ZFS) · multi-tenancy · optimistic concurrency and etags · alarming, on-call, support bundles · backup and restore · metal bootstrap (Proxmox install is assumed done) · public DNS and public certificates · per-VM firewall rules, storage pools, network fabrics, custom images · robustness and error-path UI beyond the three archetypes · multi-server Proxmox clusters.

---

## Recommended stack

### Monorepo

| Choice          | Version                            |
| --------------- | ---------------------------------- |
| Node            | 24 LTS                             |
| TypeScript      | strict, `noUncheckedIndexedAccess` |
| Package manager | pnpm workspaces                    |

Four packages: `api` (control plane), `console` (frontend), `provision` (Python), `client` (generated client). pnpm workspaces alone is sufficient at this size — add Turborepo only if build caching actually becomes a bottleneck.

### Control plane — `packages/api`

| Concern      | Choice                                                                      | Why                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP         | **NestJS**                                                                  | Opinionated module layout across ~20 resource modules, and a DI container that makes the three upstream fakes trivial — which is exactly what requirement R52 needs                                         |
| Contracts    | **@nestjs/swagger** → **Orval**                                             | DTOs produce the OpenAPI document; Orval turns that into the console's typed client, validators, and MSW handlers. One chain, one direction                                                                 |
| Spec format  | OpenAPI 3.1                                                                 | Matches all three upstream specs                                                                                                                                                                            |
| Validation   | **class-validator** + DTO classes (server); Zod (console, emitted by Orval) | One declaration per side, both derived from the same DTOs                                                                                                                                                   |
| Database     | **PostgreSQL** 17                                                           | Already a dependency by way of Dokploy's own engine; JSONB suits storing heterogeneous observed state                                                                                                       |
| Query layer  | **Drizzle ORM**                                                             | Thin and SQL-first — you can see the queries, which matters in an infrastructure tool. Migrations included. Prisma is the natural alternative under Nest; the schema is too small to need a schema language |
| Tasks        | **Hand-rolled supervisor**                                                  | A `tasks` table, a `FOR UPDATE SKIP LOCKED` claim loop, and a spawner that pipes the child's stdout into `task_logs`. ~150 lines. No queue library                                                          |
| Realtime     | **SSE via `@Sse()`**                                                        | Task log streaming is unidirectional, so server-sent events are simpler than WebSockets and need no separate transport                                                                                      |
| Subprocesses | `node:child_process`                                                        | JSON-lines on stdout. No dependency needed                                                                                                                                                                  |
| Errors       | Global exception filter                                                     | One place that mints every error's code and `requestId`, so R34 cannot be forgotten per-endpoint                                                                                                            |
| Auth         | Session cookie, no tokens in JS                                             | The control plane holds all three upstream credentials and issues one sovereign session                                                                                                                     |

**Proxmox client: hand-rolled, ~300 lines.** The API is simple — form-encoded writes, JSON reads, ticket or token auth — and the spec is only 39% typed on responses, so generating a client would produce something that looks complete and lies. Write it, and take request types from the spec.

**Dokploy client: use the existing SDK.** `@dokploy/sdk` v0.30.7 is already vendored and complete on both request and response sides. Note the auth quirk — `x-api-key` must be set manually, because the spec's per-operation `security` references a scheme that is never defined.

**NetBird client: generate from the vendored spec.** The upstream document is complete on both sides, so Orval produces something trustworthy.

### Provisioner — `packages/provision`

| Concern            | Choice                                   | Why                                                             |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------- |
| Language           | **Python** 3.12+                         | Already the stated toolchain                                    |
| Packaging          | **uv**                                   | Fast, modern, single binary for reproducible installs           |
| Validation         | **Pydantic**                             | Task specification and result shapes at the subprocess boundary |
| Terraform          | `subprocess` to `terraform` / `opentofu` | Terraform owns plan/apply semantics; do not reimplement them    |
| Terraform provider | **`bpg/proxmox`**                        | 13.7M downloads, actively maintained, PVE 9.x target            |
| NetBird provider   | **`netbirdio/netbird`**                  | Groups, policies, setup keys, peers, network resources          |
| Ansible            | `subprocess` to `ansible-playbook`       | Matrix runs, vault, and retry are not worth reimplementing      |
| Protocol           | JSON lines on stdout                     | One JSON object per line, tagged `log` / `step` / `result`      |

Structure it as an importable library plus a thin CLI, so the protocol parser is unit-testable in isolation.

### Console — `packages/console`

| Concern           | Choice                      | Why                                                                                                                                             |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | **React** 19                | Best-supported ecosystem for dense data grids, streaming logs, and side-modals. Svelte or Solid are viable; the ecosystem depth is what tips it |
| Build             | **Vite** 7                  | Fast, simple, good dev-mode story for the mock backend                                                                                          |
| Routing           | **React Router** 7          | Loader-based data fetching, which the "state lives in routes" requirement needs                                                                 |
| Server state      | **TanStack Query** 5        | Cache, invalidation by endpoint, and the prefetched-query pattern                                                                               |
| Tables            | **TanStack Table** 8        | Headless; the design language is ours, so no visual opinion is imposed                                                                          |
| Styling           | **Tailwind CSS** 4          | CSS-first configuration                                                                                                                         |
| Mock backend      | **MSW** 2                   | One tool serving both browser and node, so the console's mocks and the control plane's fakes share a shape                                      |
| UI state          | **Zustand**, used sparingly | Theme, toasts, and confirm dialogs only. Everything else is URL or query cache                                                                  |
| Unit and contract | **Vitest**                  | Fast, shares config with the workspace                                                                                                          |
| End-to-end        | **Playwright**              | Accessible locators; matches the spec's testing approach                                                                                        |

**Build the component set rather than adopting one.** Roughly: page shell, list page, detail page, properties table, data table, side panel, form controls, state badge, resource meter, capacity bar, toast, confirm dialog, empty state. All small, all ours, no licence to track.

### Infrastructure

| Concern              | Choice                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| Guest OS             | Debian 13 cloud image (`genericcloud` amd64)                               |
| Host bootstrap       | cloud-init via Proxmox snippets                                            |
| Storage              | `local-lvm` per node; `local` for images and snippets                      |
| Machine provisioning | Terraform + `bpg/proxmox`                                                  |
| Metal provisioning   | Ansible, outside the control plane's runtime                               |
| Proxy                | NetBird reverse proxy, private mode, static wildcard certificate directory |
| CA                   | Private CA, offline root, one wildcard certificate for the internal apex   |

### Testing

| Concern          | Choice                                                               | Why                                                                                                                           |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Contract tests   | **Vitest** against the control plane's HTTP surface, upstreams faked | The one primary seam                                                                                                          |
| Upstream fakes   | **MSW** in node, world-builder seeded                                | One mock tool for the whole stack                                                                                             |
| Proxmox fixtures | Recorded from a live cluster, checked in                             | Response schemas are 39% typed; real is the only source of truth                                                              |
| Browser tests    | **Playwright** against the MSW mock backend                          | Console work is never blocked on infrastructure                                                                               |
| Line protocol    | Vitest, one parser                                                   | The single provisioner seam                                                                                                   |
| Supervisor       | Vitest, against a real spawned child                                 | Claim, log capture, exit-code-to-state, cancel, and orphan reconciliation are logic worth pinning down without a live Proxmox |
| Invariants       | Vitest safety suite                                                  | Cheap, and has caught real bugs elsewhere                                                                                     |

### CI

GitHub Actions: `tsc` → lint → unit and contract → build → Playwright. Keep the feedback loop under ten minutes by running contract tests before the browser suite.

---

## Notable trade-offs

**Orval as the console-side generator.** It produces the typed client, the validators, and the MSW mock handlers from the document the control plane emits. The alternative is three separate tools, which reintroduces the drift the requirement exists to prevent. Orval's react-query hook output is a bonus, not a reason.

**NestJS over a thinner framework.** The control plane is not a small service — it is twenty-odd resource modules, a task system, and three upstream integrations. A framework that supplies the layout is worth more here than one that stays out of the way, and a layout you did not have to invent is a layout a second contributor will also follow.

**Dependency injection earns its keep in two specific places.** The first is testing: overriding the Proxmox, NetBird, and Dokploy providers is the primary seam, and a DI container makes that a provider override rather than monkey-patching. The second is the error taxonomy — a single global exception filter is the only way to guarantee every error carries a code and a `requestId` without relying on every endpoint author to remember.

**The spec is derived, not authored.** `@nestjs/swagger` builds the document from the DTOs, which means the document cannot drift from the server. That is strictly better than a hand-maintained document — but the risk moves rather than vanishing, so CI regenerates the document and fails on any diff.

**Drizzle over Prisma, under Nest.** Prisma is the more natural pairing and would be less work, and for a schema this small it makes no material difference. Drizzle is kept because the workload is infrastructure queries — task claims and heterogeneous observed state — where being able to read the SQL is worth more than the convenience. If Prisma is preferred, nothing else in the design changes.

**React over a lighter framework.** The console is dense, tabular, and has streaming requirements. That is the exact shape where React's ecosystem is furthest ahead.

**A hand-rolled task supervisor, not a job queue.** The three candidates were graphile-worker, pg-boss, and BullMQ. All three are dispatch queues: they hand work to a worker and apply retry semantics. What the control plane actually has is a subprocess it spawns, streams from, and kills — one per `Task` resource, with no fan-out, no worker pool, and no retry worth having. That is a process supervisor, not a queue, and it is about 150 lines.

Four reasons, in order of weight:

_Retry is actively wrong for this work._ graphile-worker's documented default is twenty-five attempts across roughly three days. A Terraform apply that failed because a VM name collided should surface as a failed task, not silently retry until Tuesday. Adopting any of the three means disabling its headline feature on day one.

_Every one of them creates a second source of truth._ A queue is not a task store. Adopting one means holding `tasks` and `task_logs` alongside its internal table or Redis structures, so "is this task running" becomes answerable from two places with different durability. In a system whose selling point is that state survives a restart, that is the wrong shape.

_BullMQ needs Redis, on a host that is already short on RAM._ R68 is a live constraint. Redis is also in-memory by default, while R48 requires task state to outlive a restart — durability for one fact split across two stores.

_Nothing else in the design needs a queue._ No multi-replica control plane, no scheduling, no rate limiting. Those are all out of scope.

What is taken from the queue design rather than a queue library: the `FOR UPDATE SKIP LOCKED` claim, which is the one piece not worth reinventing and is three lines of SQL. Cancellation is a `SIGTERM` to the recorded pid. Recovery is a startup reconciliation that finds tasks left in `running`, checks whether the pid still exists, and marks the orphans failed.

**Revisit if sovron grows its own scheduler.** graphile-worker's cron-with-backfill is the best of the three, and it would bolt on cleanly alongside the supervisor. Note that Dokploy already offers cron and Proxmox has scheduled tasks, so sovren may never need a scheduler of its own.

**One database, no Redis.** Task state, observed state, and job claims all live in Postgres. Adding a broker before it is needed is the most common premature-complexity mistake in a project like this.

**Server-sent events rather than WebSockets.** Task log streaming flows one way. SSE needs no separate transport, reconnects on its own, and traverses the same origin as the rest of the API.

**Postgres on the control plane VM, Dokploy separate.** They must not share a fate. Dokploy is the heavier process and the less coupled of the two, so it is the one that moves to its own VM first if the host is short on memory.
