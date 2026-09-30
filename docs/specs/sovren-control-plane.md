# Sovren — Sovereign Control Plane and Console

- **Status:** Draft — awaiting seam confirmation
- **Date:** 2026-09-29
- **Scope:** Substrate (NetBird VM, control plane VM, golden machine) through the task model, with the Dokploy service join as the leading edge.
- **Tracker:** Unpublished. No issue tracker is configured for this repository; run `/setup-matt-pocock-skills` to set one, then publish with the `ready-for-agent` label.

---

## Problem Statement

Voltedge Africa runs infrastructure on retired university desktops. Proxmox is installed and the cluster is up, but there are no VMs, no overlay network, and no way to provision a machine without clicking through a web UI by hand. Four separate control planes will be layered on top — Proxmox, NetBird, Dokploy, and Terraform/Ansible — each with its own UI, its own vocabulary, and its own credentials. An operator who wants to know "which of my services is broken, and what is it running on" has to correlate four dashboards by hand, and a machine that is created today is created by a human sitting at a keyboard.

## Solution

Sovren is a control plane and console that spans the whole estate. It reads Proxmox, NetBird, and Dokploy and presents them as one set of nouns rather than three; it provisions machines through Terraform and Ansible and runs those as observable tasks; and it uses NetBird as both the overlay network and the internal name authority, so services resolve by name without public DNS exposure. The API, the resource vocabulary, and the screen structure are sovren's own design.

The substrate is built in a fixed order so nothing is circular: the NetBird VM is created over the LAN, the control plane VM is created over the LAN, and only then does anything enrol in the overlay.

## User Stories

### Substrate — the overlay and the plane it lives on

1. As an operator, I want one command to create the NetBird VM, so that the overlay network exists without clicking through the Proxmox UI.
2. As an operator, I want the NetBird VM provisioned over the LAN, so that the overlay's own infrastructure never depends on the overlay.
3. As an operator, I want NetBird's signalling, STUN, and relay ports opened on the LAN, so that peers can connect.
4. As an operator, I want a reusable NetBird setup key created from the API, so that machines enrol without interactive login.
5. As an operator, I want a second setup key for a different group, so that I can separate infrastructure peers from user peers.
6. As an operator, I want my workstation to join the overlay as a peer, so that I can reach infrastructure by name.
7. As an operator, I want the control plane VM created by the same tooling as the NetBird VM, so that the substrate is reproducible.
8. As an operator, I want the control plane VM dual-homed on LAN and overlay, so that I can still reach it when the overlay is broken.
9. As an operator, I want the console reachable over HTTPS by name with no public exposure, so that the control plane is not internet-facing.

### Substrate — the golden machine

10. As an operator, I want to create a Debian VM whose cloud-init installs the guest agent and enrols it in NetBird, so that no human touches a machine after creation.
11. As an operator, I want cloud-init user-data uploaded as a Proxmox snippet over SSH, so that arbitrary user-data is possible at all.
12. As an operator, I want the VM's hostname set inside my own user-data, so that it survives the snippet replacing Proxmox's generated config.
13. As an operator, I want the golden VM marked as a template, so that every later VM is a clone that arrives already enrolled.
14. As an operator, I want clones to be fully linked clones, so that many VMs cost little disk.

### Control plane — reading the estate

15. As an operator, I want a REST API that lists Proxmox nodes, so that the console has real data on day one.
16. As an operator, I want an API that lists VMs across the whole fleet, so that I can see everything without switching scope.
17. As an operator, I want an API that lists NetBird peers, so that I can see what has actually joined the overlay.
18. As an operator, I want physical disks listed separately from VM disks, so that the two are never confused.
19. As an operator, I want a VM's node, specs, run state, and overlay address on one row, so that I don't have to join by hand.
20. As an operator, I want a peer's name, address, groups, and last-seen time, so that I can tell a stale peer from a live one.
21. As a developer, I want the API described by an OpenAPI document, so that the console's client is generated rather than hand-written.
22. As a developer, I want every list endpoint to return the same `{ items, nextPage }` envelope, so that the console has one pagination path.
23. As a developer, I want an opaque page token rather than an offset, so that pages stay correct when the underlying list changes.
24. As a developer, I want `NameOrId` accepted at every path parameter, so that URLs work with the names humans remember.
25. As a developer, I want `id` to be immutable and `name` to be mutable, so that links never break when something is renamed.
26. As a developer, I want every error to carry a `requestId` that also appears in an audit log, so that a user-reported problem is traceable end to end.
27. As a developer, I want a fixed error vocabulary distinct from upstream errors, so that the console can key off error codes.
28. As a developer, I want the generated client to return a result union and never throw on HTTP failure, so that every call site is forced to handle failure.
29. As a developer, I want the generated client and the server validated against one document, so that they cannot drift.

### Control plane — tasks and writes

30. As an operator, I want creating a VM to return immediately, so that I am not blocked on a four-minute boot.
31. As an operator, I want the create response to carry a task I can navigate to, so that I land on the progress.
32. As an operator, I want a task's logs streamed while it runs, so that I can see what it is doing.
33. As an operator, I want a task list, so that I can find a run from last week.
34. As an operator, I want to cancel a running task, so that a mistake costs seconds instead of minutes.
35. As an operator, I want a task to record its terminal state and failure reason, so that failures are diagnosable after the fact.
36. As an operator, I want a VM to show a transitional state while its create task runs, so that it is visibly in flight.
37. As an operator, I want a VM to show an explicit failed state distinct from a stopped one, so that failures are never mistaken for intent.
38. As a developer, I want the provisioner to be a subprocess with a line protocol, so that a killed task is a killed process rather than an orphaned job.
39. As a developer, I want the control plane to hold task state in a database, so that tasks survive a restart.

### Console — scope and structure

40. As an operator, I want a Fleet scope, so that I can ask whether anything in the estate is broken.
41. As an operator, I want a Site scope, so that I can work within one lab or building.
42. As an operator, I want a Settings scope, so that connections and credentials live outside the fleet view.
43. As an operator, I want the top bar to switch scope and the whole sidebar to change with it, so that the navigation matches what I am working on.
44. As an operator, I want a Site to be a physical grouping rather than a security boundary, so that the model matches how the hardware actually fails.
45. As an operator, I want every list page to have the same shape — header, refresh, last-updated, create, table, pagination — so that I learn the console once.
46. As an operator, I want to see when data was last refreshed, so that I can tell a stale view from a broken one.
47. As an operator, I want a detail page per resource with tabs, so that related information lives in one place.
48. As an operator, I want every detail page to open with ID, created, and updated, so that I can reference and audit anything.
49. As an operator, I want create and edit forms to be their own routes, so that I can link to them.
50. As an operator, I want the list page to stay mounted behind a create or edit form, so that I do not lose my place.
51. As an operator, I want a disabled action to explain why it is disabled, so that I learn what the system can do rather than what it hides.
52. As an operator, I want to select multiple rows and act on them together, so that repetitive work is not repetitive.
53. As an operator, I want destructive actions behind a confirmation that names the resource, so that I confirm the right thing.
54. As an operator, I want toasts in the present tense, so that the console never claims completion it has not observed.
55. As an operator, I want dense tables with fixed row heights, so that I can see a lot of the estate at once.

### Console — the screens

56. As an operator, I want a Nodes table showing name, CPU, cores, memory, disks, and overlay status per physical machine, so that I can spot a degraded PC.
57. As an operator, I want a VMs table showing name, node, overlay address, CPU model, memory, and run state, so that I can see what is running where.
58. As an operator, I want a Peers table showing name, address, OS, groups, and last seen, so that I can spot a peer that dropped off.
59. As an operator, I want a Tasks table showing kind, target, state, and start time, so that I can find a stuck run.
60. As an operator, I want a VM detail page with overview, disks, snapshots, and tasks tabs, so that one resource is explorable in place.
61. As an operator, I want a node detail page with overview, drives, VMs, and peers tabs, so that I can see what a machine is responsible for.
62. As an operator, I want a task detail page streaming logs, so that progress is visible without leaving the console.

### Workloads and the service join

63. As an operator, I want Dokploy's services visible in the same console as their hosts, so that I do not switch UIs to answer a question.
64. As an operator, I want one Dokploy instance managing many Docker hosts, so that I do not run a Dokploy per VM.
65. As an operator, I want each service registered as a NetBird network resource, so that services resolve by name internally.
66. As an operator, I want an internal name to resolve to the host's overlay address and published port, so that resolution reflects the real path rather than a container address.
67. As an operator, I want internal names and public names in separate namespaces, so that public certificate issuance still works.
68. As an operator, I want a service to show both its Traefik domain and its internal name, so that I can see which namespace it is in.
69. As an operator, I want a service's deployments listed, so that I can see what is deployed and when.
70. As an operator, I want a service's build log readable, so that a failed deploy is diagnosable.

### Bare VMs as a first-class offering

71. As an operator, I want to create a VM that hosts nothing, so that I get a machine to work on without having to frame it as an application.
72. As an operator, I want a bare VM provisioned from the same image as every other machine, so that it arrives with the guest agent, the overlay client, and my credentials already in place.
73. As an operator, I want a bare VM to receive an overlay address and a resolvable name, so that it is addressable the moment it finishes building.
74. As an operator, I want a bare VM to be a first-class peer in the access model, so that policies apply to it like any other machine.
75. As an operator, I want to start, stop, and reboot a bare VM from the console, so that I can recover it without leaving the console.
76. As an operator, I want a browser console attached to a bare VM, so that I can get in when SSH is not configured.
77. As an operator, I want to resize a bare VM's CPU and memory, so that I can fit the work to the machine.
78. As an operator, I want to snapshot a bare VM and restore it, so that an experiment is reversible.
79. As an operator, I want to attach a Service to an existing bare VM, so that a machine I already have can become a deployment target.
80. As an operator, I want each VM to declare its purpose, so that I can tell a Service host from a machine I am experimenting on.
81. As an operator, I want sovren's own infrastructure VMs to be described in its own model, so that the system can account for the machines it runs on.
82. As an operator, I want creating a bare VM to be a task with streamed logs like any other, so that the only available progress channel is a good one.
83. As an operator, I want the bare-VM boundary enforced — no custom images, storage pools, network fabrics, or per-VM firewall rules — so that the offering stays supportable.

### TLS and internal identity

84. As an operator, I want a private certificate authority in the estate, so that browsers trust internal services with no public dependency at all.
85. As an operator, I want a single wildcard certificate covering the internal domain, so that every service gets a valid name from one certificate rather than a per-service issuance.
86. As an operator, I want that wildcard certificate delivered to the NetBird proxy, so that TLS terminates in one place for every service.
87. As an operator, I want a documented internal domain, so that service names are predictable and the wildcard certificate is valid for all of them.
88. As an operator, I want a device enrolment page offering the CA root, so that a new laptop or phone can start trusting internal services.
89. As an operator, I want the CA root baked into the machine image, so that provisioned machines trust internal services without a manual step.
90. As an operator, I want the CA root importable for containers and CI, so that automated clients can reach internal services.
91. As an operator, I want certificate expiry surfaced before it bites, so that a service never starts serving an expired certificate.
92. As an operator, I want TLS termination shown as a per-service property, so that I can see where each service's TLS ends.
93. As an operator, I want service access gated by NetBird group membership, so that only peers in the right group can reach a service.
94. As an operator, I want the calling peer's identity passed through to the service, so that a service can make its own authorization decisions.
95. As an operator, I want plaintext service-to-service traffic allowed over the mesh, so that certificates are reserved for browser traffic where they are actually required.

### Settings and credentials

96. As an operator, I want the Proxmox endpoint and credentials configured in one place, so that I know what sovren holds.
97. As an operator, I want to see that the Proxmox integration needs both an API token and a PAM SSH key, so that the requirement is not a surprise.
98. As an operator, I want the NetBird endpoint and token configured, so that the overlay integration is explicit.
99. As an operator, I want the Dokploy endpoint and API key configured, so that the workload integration is explicit.
100.  As an operator, I want a connection test per integration, so that a misconfiguration is visible before it is needed.
101.  As an operator, I want an audit log of changes, so that I know what happened to my estate.

## Implementation Decisions

### Composition

One repository, four packages plus an infrastructure directory and a read-only reference directory. The reference directory holds the three upstream OpenAPI specifications, the generator used to build the Proxmox one, and their provenance. The heavy upstream clones are not tracked; see the reference directory's own README for how to restore them.

**No third-party source is copied into sovren.** Design ideas drawn from other infrastructure consoles are taken as concepts, not code. Where any third-party artefact carries a copyleft licence, that obligation is recorded here and is re-examined before any copying happens. The tracked specifications are generated data artefacts and carry no such obligation.

### Runtimes

Node for the control plane and its REST API. Python for provisioning automation, invoked as a subprocess. React for the console. Terraform with the `bpg/proxmox` provider for infrastructure declarations; Ansible for machine bootstrap.

### Nomenclature

Upstream nouns are adopted verbatim and never renamed — the operator sees Proxmox's, NetBird's, and Dokploy's vocabularies too, and a sovren-specific word for something natively called a NetBird Group would force a translation table. Names are invented only for what sovren owns.

| Noun                   | Origin  | Notes                                                                                                                                                                        |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Fleet`                | sovren  | the whole estate                                                                                                                                                             |
| `Site`                 | sovren  | physical grouping; a failure and latency boundary, not a security one                                                                                                        |
| `Node`                 | Proxmox | a physical machine. Heterogeneity is the normal case, not an edge case                                                                                                       |
| `Drive`                | Proxmox | a physical disk on a Node. Named `Drive` specifically to keep `Disk` unambiguous                                                                                             |
| `VM`                   | Proxmox | a guest, and a first-class offering in its own right — not only a host for Services. Carries a `purpose` of `infrastructure`, `service`, or `workload`                       |
| `Disk`                 | Proxmox | VM storage                                                                                                                                                                   |
| `Snapshot`             | Proxmox | point-in-time disk copy                                                                                                                                                      |
| `Image`                | sovren  | a bootable base a VM is created from; a marked template is the practical instance of this                                                                                    |
| `Project`              | Dokploy | tenancy unit for services                                                                                                                                                    |
| `Environment`          | Dokploy | between Project and Service                                                                                                                                                  |
| `Service`              | Dokploy | umbrella noun; discriminated by `kind`: `application`, `compose`, `postgres`, `mariadb`, `mysql`, `mongo`, `redis`, `libsql`                                                 |
| `Deployment`           | Dokploy | a deploy or build record                                                                                                                                                     |
| `Domain`               | Dokploy | a public hostname with Traefik routing and a public certificate. Distinct from an internal name, which lives in NetBird. May be absent on most services                      |
| `Certificate`          | Dokploy | public TLS material managed by Dokploy. Distinct from the internal certificate sovren's CA issues                                                                            |
| `Peer`                 | NetBird | an enrolled machine                                                                                                                                                          |
| `Group`                | NetBird | access-control grouping                                                                                                                                                      |
| `Policy`               | NetBird | access rule                                                                                                                                                                  |
| `SetupKey`             | NetBird | enrolment credential                                                                                                                                                         |
| `NetworkResource`      | NetBird | a registered internal name resolving directly to an address and port. Serves plaintext service-to-service traffic                                                            |
| `Endpoint`             | NetBird | a reachable address for a Service: TLS termination plus group-gated access. NetBird calls this a "service", which collides with the Dokploy `Service`, so it is renamed here |
| `CertificateAuthority` | sovren  | the internal CA. Issues the wildcard certificate covering the internal domain                                                                                                |
| `Task`                 | sovren  | the unit of asynchronous work                                                                                                                                                |

### API conventions

Adopted conventions:

- Operation names are `{resource}{Verb}`.
- The read trio is `List` for collections, `View` for a single resource, and the object itself.
- Mutating verbs that start long work return `202` with a `Task`.
- Every path parameter accepts a name or an id.
- `id` is an immutable system key; `name` is a mutable human key.
- Every list returns `{ items, nextPage }`.
- Every error carries an error code and a `requestId` that is also written to the audit log.
- The generated client returns a discriminated result union and never throws on HTTP failure, so failure handling is explicit at every call site.

**The DTOs are the spine; the OpenAPI document is derived from them.** The control plane declares each request and response shape once, as a DTO. That declaration is the server's runtime validator _and_ the source of the published OpenAPI document, which is then consumed by the console to generate its typed client, its own validators, and its mock handlers. The consequence worth stating plainly: the document cannot drift from the server, because the server is what produced it. A hand-maintained document could.

### Tasks

The one concept not borrowed but invented. Long-running work is a first-class resource because a VM boot, a Terraform apply, and an Ansible run all take minutes and none of them can complete inside a request. The control plane holds task state; the provisioner is a child process emitting a line protocol on stdout; logs are held by the control plane so they can be streamed — a capability none of the three upstream APIs offer, since all three expose logs as polled REST. A resource shows a transitional state while its task runs, and the console never asserts completion it has not observed.

**The execution model is a process supervisor, not a job queue.** A queue dispatches work to workers and applies retry semantics; what is needed here is a subprocess the control plane spawns, reads from, and kills — one per `Task`, with no fan-out and no retry that is worth having. The implementation is a `tasks` table, a claim loop using `FOR UPDATE SKIP LOCKED`, and a spawner that pipes the child's stdout into a `task_logs` table. Cancellation sends a signal to the recorded pid. Recovery on startup finds tasks left in a running state, checks whether the pid still exists, and marks the orphans failed.

**A failed task is not retried automatically.** This is the decision that rules out adopting a queue library, and it is deliberate. A Terraform apply that failed because a name collided should surface as a failed task that a human looks at. Silent retry on a backoff would hide exactly the information the console exists to show.

### Scope model

Three scopes, switched from the top bar, each with its own sidebar:

- **Fleet** — cross-site, the "is anything broken" view
- **Site** — the normal working scope
- **Settings** — integrations and credentials

`Site` is deliberately a physical grouping rather than a tenancy boundary, because on this hardware the meaningful groupings are corosync latency and failure blast radius.

### Screen archetypes

Every page is one of three:

- **List** — header with icon and title, then a refresh control with a last-updated timestamp, then a create action, then the table, then a pagination bar.
- **Detail** — breadcrumb, header, tabs, content. Key/value via a properties table; every detail opens with an ID/created/updated block.
- **Form** — a page of its own, on its own route, so it is linkable, and returning to the list restores the filters, sort and page the operator left. **Changed from a side panel over the still-mounted list.** The requirement it was serving was R49 — _do not lose my place_ — and a drawer satisfied that by keeping the list mounted. A full page satisfies it better, by carrying the list's state in the URL, and it does so without the two obligations a drawer creates: the form has to live inside a layout that owns another screen, and a form deep-linked cold arrives with no list behind it and nothing to return to. The cost is real and worth naming — the list unmounts, so the state has to be carried rather than retained, which is a real invariant for the form to uphold rather than a property the router gives it for free.

Table conventions are fixed row heights, a sticky identity column, a sticky action column, and server-side pagination with an opaque token.

### Bootstrap ordering

The substrate is created over the LAN in a fixed order: NetBird VM, then control plane VM, then the golden VM, and only then does anything enrol in the overlay. This is a correctness constraint, not a robustness one — the control plane must remain reachable when the overlay it manages is down. The control plane VM is therefore dual-homed, and bootstrap paths run over the LAN.

### NetBird as name authority

NetBird is the internal resolver for both machines and services, so sovren registers a network resource per service. A network resource points at the workload VM's overlay address and published port, not a container address, because the NetBird agent runs on the host and Docker's resolver is separate. Internal names and public names occupy separate namespaces: internal resolution is NetBird's, public ingress and certificate issuance remain Traefik's, because ACME validation requires public reachability.

### TLS and internal identity

There is no public domain, so there is no public certificate authority. TLS for browser traffic is served by a private certificate authority in the estate, and a single wildcard certificate covering the internal domain is handed to the NetBird proxy. One wildcard rather than per-service issuance is the decision that makes this affordable: every service name is valid from the one certificate, so issuance is a periodic renewal of one artefact rather than a lifecycle per service.

**NetBird's reverse proxy is the termination point.** It terminates TLS at the edge, forwards through the WireGuard tunnel to the target, and the target needs no public address and no open ports. A private service is bound to an inbound listener on the tunnel itself, so it is unreachable from outside the overlay by construction rather than by firewall rule. Access is gated by NetBird group membership: management resolves the source address to a peer and checks the peer's groups against the service's access groups. The proxy stamps identity headers on proxied requests and strips client-supplied copies, so services can make their own authorization decisions.

**The certificate is a browser requirement, not a network requirement.** The tunnel is already encrypted, so plaintext service-to-service traffic is perfectly sound and needs no certificate. Certificates are spent only on traffic a browser terminates. This scopes the CA's cost to user-facing surfaces, and it means the substrate can be developed over plaintext on the mesh before any CA exists.

**Dokploy's automatic TLS does not apply to overlay-only services.** Its Let's Encrypt path uses HTTP-01, which requires public reachability. Those services terminate TLS at the NetBird proxy, and Dokploy's Traefik is reduced to plain HTTP routing behind it. Traefik and NetBird's own external proxy are both Traefik-based, which is a convergence worth noting but not one to exploit.

**Two distinct NetBird mechanisms are in play and must not be conflated.** A network resource is a name that resolves directly to an address and port, and is sufficient for plaintext service-to-service traffic. An endpoint is a name that terminates TLS and proxies, and is what browsers need. The relationship between the two — whether an endpoint is backed by a network resource, a peer, or a subnet — needs confirming against the current NetBird API before the join is modelled.

**The CA root's real cost is distribution, not issuance.** Every laptop, phone, container image, and CI runner that opens a browser to an internal service must trust the root, and must keep trusting it through renewals. The console therefore offers device enrolment, the machine image bakes the root in, and containers and CI get an importable bundle. This is a recurring operational obligation and the main argument for keeping the number of browser-facing services small.

**NetBird has no equivalent of `tailscale cert`.** Issuing certificates for peers is an open feature request upstream, so the issuance, delivery, and renewal loop is sovren's own to build.

### Bare VMs are a first-class offering

A VM is not only a place to put a Service. It is something an operator can ask for directly and get a machine back.

**Two kinds exist and they are treated identically after creation.** An infrastructure VM backs the system itself — the overlay, the control plane, a Dokploy host. A workload VM is handed to an operator. Both are provisioned from the same image, both receive an overlay address and a name, both enrol as peers, both are visible and snapshottable. The only difference is whether a Service is attached, which is a `purpose` field rather than a separate resource.

**This is close to free, because the substrate already needs every primitive it requires.** An image, networking, identity, task orchestration, node inventory, disks, and a console all exist to build the substrate. Exposing VM creation as a direct action rather than a provisioning step is the whole of the marginal work, plus lifecycle actions, resize, and console access.

**It closes a real gap in the model.** Slices one and two create the overlay and control plane machines by hand, before sovren exists, which left the system's own infrastructure outside its own vocabulary. Once bare VMs are in the model, the system can describe the machines it runs on — which is the difference between a tool and a platform that knows what it is.

**It is the honest answer for users who are not deploying applications.** Dokploy runs containers on hosts that are explicitly non-clustered, with no failover and no live migration. Someone who needs a machine to experiment on, a legacy application, or anything that does not fit a container is unserved by a Service-only model, and would otherwise have no reason to talk to sovren at all.

**The boundary is held deliberately, because this is where "cloud project" becomes "build a cloud provider."** In scope: create, start, stop, reboot, resize, console, address and identity, snapshot, and attaching a Service to an existing VM. Out of scope: live migration, custom images beyond the golden one, storage pools, network fabrics, and per-VM firewall rules. Proxmox already implements firewall rules competently; reimplementing them would add a surface nobody asked for.

**The task model becomes more important, not less, under this decision.** A bare VM has no Dokploy deployment to observe, so the streamed task log is the only progress signal that exists for it. That is a further argument for building the task model well rather than treating it as a secondary concern.

### Proxmox credentials: two, not one

Proxmox's API cannot upload cloud-init snippets; they require SFTP and a PAM account. Sovren therefore holds an API token for resource CRUD and a PAM user's SSH key for snippet upload. This is a property of the substrate, not a design preference, and it is surfaced in Settings rather than hidden.

### Build order

Slices are ordered so each de-risks the next and none is circular:

1. Overlay and control plane substrate on the LAN
2. The golden machine that self-enrols and becomes a template
3. The read-only control plane API and the first console screens
4. The task model and the first write
5. The Dokploy service join and network resource registration

### Technical clarifications carried from research

- Cloud-init custom user-data replaces Proxmox's generated configuration entirely, so hostname and user account must be supplied inside the snippet.
- The cloud-init drive must remain attached, or boot hangs with no useful error.
- The snippet datastore must have the snippets content type enabled.
- User-data cannot configure networking; that must come from the network config or the ip-config block.
- Live migration is not offered across heterogeneous CPUs.
- The CPU model defaults to the lowest common denominator across the fleet.

## Testing Decisions

### What makes a good test here

Only external behaviour. A test asserts what the API returns or what the console renders, never the shape of an internal adapter or the fact that a particular function was called. Because the upstream APIs are faked, the tests that matter are contract tests: given a fake Proxmox that reports a specific state, the API must return sovren's shape of that state, and the error vocabulary must be sovren's rather than Proxmox's.

### Seams

**The primary seam is the control plane's HTTP surface**, exercised end to end with Proxmox, NetBird, and Dokploy faked. This is the highest seam available and it is deliberately the only one that reaches into the adapters, because a test that stops at the adapter boundary would let the naming and translation decisions go unverified. There is no existing seam in the codebase to reuse.

**The spine is the DTO set, from which the OpenAPI document is generated.** The server's request and response shapes are declared once and produce the document; the console's client, its validators, and its mock handlers are all generated from that document. This is the mechanism that makes the other seams trustworthy: mocks cannot drift from the client, the client cannot drift from the server, and the document cannot drift from either. The risk moves rather than disappearing — it becomes a CI check that a regenerated document matches the committed one, which fails loudly if a DTO changed without the document being refreshed.

**The provisioner gets one narrow seam** — the line protocol parser between the Python subprocess and Node — because that is a real contract we own and it is the one place a malformed stream would be silent. Everything else in the provisioner is exercised by running it.

**Console tests run against the generated mock backend in the browser**, not against a live control plane, so UI work is never blocked on infrastructure and the dev server can run the same mocks.

### Modules under test

The three upstream adapters, the resource and pagination envelope, the naming and translation rules, the error taxonomy, the task lifecycle including cancellation and failure, and the network resource registration that joins a service to an internal name.

Not under test: Terraform's and Ansible's own behaviour, which is verified by hand against real Proxmox.

### Error paths

Driven by sentinels — the mock branches on a value the user typed or selected — rather than by request interception, so a failure path is reproducible in the dev server and not only in tests. This is also where the constraint that every endpoint must be acknowledged even if unimplemented earns its keep: a spec change that adds an operation should fail the build until someone decides whether it is implemented.

### Repository invariants

Enforced by a safety suite, following the same idea: the OpenAPI document's version matches the generated client, generated artifacts are not hand-edited, and identifiers in fixtures are well-formed. It also pins the generated document against the committed one and validates fixture identifier shapes, which is cheap and has caught real bugs in comparable systems.

### Not tested, deliberately

Anything about failure of the underlying hardware, the overlay, or the cluster. That is out of scope by decision, and tests written against it would be aspirational.

## Out of Scope

- **Hardware failure and disaster recovery.** No BMC, fencing, or IPMI. Wake-on-LAN is the only recovery path and is not automated.
- **High availability.** Proxmox HA is not enabled and not managed.
- **Live migration.** Not offered, and not attempted across heterogeneous or mixed-vendor CPUs.
- **Shared storage.** No Ceph, no ZFS, no clustered filesystem. Local storage per node only.
- **Multi-tenancy.** Single organisation. `Site` is a physical grouping, not a security boundary, and no tenancy isolation is built.
- **Optimistic concurrency.** No etags, no version tokens, no conflict resolution. Last write wins.
- **Alarming, on-call, and support bundles.** The concepts are acknowledged in the vocabulary; the machinery comes later.
- **Backup and restore.** Recognised as a gap, deliberately not built.
- **Metal bootstrap.** Ansible over the Proxmox installation itself is assumed done and is not part of this work.
- **Public DNS and public certificates.** There is no public domain, so nothing is published to the internet and no public CA is used. Every service is reachable only from inside the overlay.
- **Per-VM firewall rules, storage pools, network fabrics, and custom images.** Delegated to Proxmox and Dokploy. Bare VM support stops deliberately at create, lifecycle, resize, console, identity, snapshot, and Service attachment, because that is where "cloud project" starts becoming "build a cloud provider."
- **Robustness, error-path UI, and empty-state polish** beyond what falls out of the three screen archetypes.
- **Multi-server Proxmox clusters.** Single-cluster assumption.

## Further Notes

**The vendored NetBird spec is a trimmed subset.** The file in the repository contains only the instance and setup endpoints. The real API is substantially larger — peers, groups, policies, setup keys, networks, network resources, routes, DNS, and events. The full document should be fetched before generating any client, or the console will be built against a vocabulary that is missing most of what it needs.

**The Proxmox API schema is present and complete** in the reference directory, covering cluster, SDN, HA, Ceph, QEMU, cloud-init, and migration. The QEMU cloud-init endpoints in particular are the mechanism behind machine creation, and are worth reading before the first VM is created.

**Capacity on the shared host.** The single physical machine will run the overlay stack, the control plane, its database, and probably Dokploy. On retired hardware this is a load question rather than a robustness question — if the box is short on memory, the thing will not work at all, and Dokploy is the heaviest and least coupled component, so it moves first.

**License note.** The reference directory contains MPL-2.0 and ISC licensed material. The decision to take design rather than code keeps those obligations off the project; if that changes, the obligations attach and should be re-examined before any copying happens.

**The TLS story rests on a beta feature, and that is the main risk in this spec.** NetBird's reverse proxy is beta, private services are newer than that, and the combination of self-hosted plus private plus statically-supplied certificates is the least-travelled of the paths available — self-hosters are actively working through its rough edges on the community forum. It is placed last in the build order for that reason: slices one through four do not touch it, and the substrate runs over plaintext on the mesh throughout development. If it turns out to be unusable, the fallback is terminating TLS in the service itself with the same CA-issued certificate, which is more work per service but no new dependency.

**Certificate renewal is a clock that will fail silently.** The proxy serves a static certificate, and a CA that is offline when that certificate expires produces a service that looks healthy and is not. Surfacing expiry in the console is therefore not polish; it is the only signal that exists.

**The internal domain has not been chosen.** A wildcard certificate is only valid for names under a known apex, and both `home.arpa` and `.internal` are reserved for exactly this purpose by standards bodies, while a branded apex such as `sovren.internal` is more legible in a UI. This is a small decision with a long tail, because every internal name issued for the life of the estate sits under it.

**Two deferred-but-real concerns,** recorded so they are not rediscovered as surprises: the Proxmox cluster requires sub-5ms corosync latency between all nodes, which is a network property rather than a hardware one and should be verified early; and ZFS on this hardware is a poor fit, since default ARC sizing in current versions claims a large fraction of total memory and the disks are unlikely to have power-loss protection.
