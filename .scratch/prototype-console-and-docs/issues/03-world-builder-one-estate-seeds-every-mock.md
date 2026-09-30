# 03: One estate description seeds every mock

**What to build:** The console never talks to a real Proxmox, NetBird, or Dokploy in the prototype; it talks to a mock backend seeded from a single description of the estate — a lab of nodes with their VMs, the peers enrolled on the overlay, and last week's tasks. Change the description and every screen, every fixture, and every test change together, so no two parts of the system can disagree about what exists. The same description is selectable at runtime, so an operator can reproduce a failure in the dev server without touching a test.

Serves R52, R54, R55, R56, R59. No Proxmox response shape is invented here: those must be recorded from a live cluster (R55), so the prototype mocks sovren's own contract and records the upstream fixtures as a separate, still-open piece of work.

**Blocked by:** 02 — The contract document, and a client generated from it.

**Status:** ready-for-agent

**Delivered.**

- [ ] One estate description produces the data every mock operation returns, and no mock carries data authored outside it.
- [ ] `Node`s, `VM`s, `Peer`s, and `Task`s are cross-consistent: a VM names a `Node` that exists, a `Peer` carries the `Group`s the estate gives it, a `Task` targets something that exists.
- [ ] The description is one typed value, not prose, and is the only place a fixture identifier is written.
- [ ] A test asserts the seeded estate is internally consistent — no dangling references, no duplicate ids, no malformed identifiers.
- [ ] A sentinel — a value in the URL or a query parameter — selects a branch, so a failure path is reproducible in the dev server and not only in a test.
- [ ] The dev server and the test suite start from the same description, so a screen looks the same in both.
- [ ] The estate is large enough to exercise pagination honestly — more rows than fit on one page — and a second, smaller description exists for narrow-screen testing.

## Comments

Delivered. One typed `Estate` per estate; rows are the generated model types, and names are literal unions so a typo is a compile error where it was written. `fleet` (19 Nodes / 27 VMs / 46 peers / 23 tasks) and `compact`, selected with `?estate=`. The consistency checker covers what types cannot see.
