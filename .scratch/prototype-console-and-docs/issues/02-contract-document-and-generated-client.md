# 02: The contract document, and a client generated from it

**What to build:** sovren has one contract, written down in OpenAPI 3.1, and everything downstream of it is generated rather than hand-written: a typed client, react-query hooks, Zod validators, and MSW mock handlers. The document declares sovren's own vocabulary — `Node`, with an immutable `id` and a mutable `name`, reachable by either — plus the conventions every list shares: an `{ items, nextPage }` envelope with an opaque page token, a fixed error vocabulary carrying a `requestId`, and 202-with-`Task` for long work. A developer changes the document, regenerates, and the client, the validators, and the mocks move together. Because no control plane exists yet, the document is hand-authored and an ADR records that it is provisional and exactly how it hands over to a derived document later.

Serves R29–R36, R52, R57, R59. Operations are named `{resource}{Verb}`; the read trio is `List`, `View`, and the object itself.

**Blocked by:** 01 — Two runtimes, one workspace, one port registry.

**Status:** ready-for-agent

**Delivered.**

- [ ] The document declares `NodeList` and `NodeView` in sovren's vocabulary, every path parameter accepting a name or an id, and `id` immutable with `name` mutable.
- [ ] Every list operation returns `{ items, nextPage }` where the token is opaque, and a document change visibly changes the generated pagination type.
- [ ] Errors declare a fixed sovren code and a `requestId`, distinct from any upstream error shape.
- [ ] Mutating long work declares `202` returning a `Task`.
- [ ] One generation command emits a typed client, react-query hooks, Zod validators, and MSW handlers into the client package; generated output is not hand-edited.
- [ ] The committed document is pinned by a check that regenerates and fails on any diff.
- [ ] An ADR states that the document is provisional for the prototype, why, and the seam by which the control plane later derives it from DTOs.
- [ ] The `Endpoint` and `Service` collision is respected: no sovren noun reuses NetBird's "service" for anything other than `NetworkResource` or `Endpoint`.

## Comments

Delivered. 19 operations, all four artefact types generated, and `docs/adr/0001-provisional-contract-document.md` records the deviation from R36 and the handover seam. Later added by the orchestrator: `VMDelete` (202 + Task) for ticket 12, `DisabledAction` on `Node`/`VM` for ticket 04, and `pool: "forks"` in the client vitest config without which MSW silently makes real network calls.
