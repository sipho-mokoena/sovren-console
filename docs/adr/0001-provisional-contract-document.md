# 0001: The contract document is provisional and hand-authored

`openapi/sovren.json` is hand-authored for the prototype. It is **not** yet derived from the control plane's DTOs, which is a deliberate, recorded deviation from R36 and from the spec's API conventions — and this ADR exists so that nobody later reads the current file as the intended steady state, or "fixes" it in either direction by accident.

## Status

Accepted. Supersedes nothing. This ADR describes the state of the document during the prototype and is expected to become false when the control plane exists.

## The deviation

R36 and the spec's _API conventions_ both say the same thing: **the DTOs are the spine, and the OpenAPI document is derived from them.** The control plane declares each request and response shape once, as a NestJS DTO class with `@nestjs/swagger` decorators; that class is the server's runtime validator _and_ the source of the document; the document produces the console's client, validators, and mock handlers. The point of that chain is that the document cannot drift from the server, because the server produced it.

The prototype has no control plane. There is nothing to derive a document from, and waiting for one would mean the console has no contract to build against at all — the whole prototype renders from a mock backend, and a mock backend needs a document. So the document is written by hand, and `docs/tech-stack.md`'s claim that "the spec is derived, not authored" is false for as long as this ADR is in force.

**What the deviation costs, stated plainly:** a hand-maintained document _can_ drift, and for now nothing enforces that it does not. The risk does not disappear; it sits in this file unmitigated until the handover below happens. Everything downstream of the document — the typed client, the Zod validators, the MSW handlers, the mock backend — still cannot drift from each other, because all of them are generated from the one document. What is unverified is only that the document describes the server that will eventually exist.

## The seam: how it hands over

The handover is a swap of who writes the file, not a rewrite of the file. Concretely, in the order it must happen:

1. **The DTOs arrive and become the spine.** Each schema here becomes a DTO class in `packages/api`, with the class's `@ApiProperty` shape matching what the document currently declares. The `required` lists, the enums, and the nullability are the parts that have to survive exactly, because the envelope and the error vocabulary are conventions the console depends on rather than descriptions it happens to render.
2. **`@nestjs/swagger` emits `openapi/sovren.json` from them.** The file at this path stops being a source and becomes an artefact. The `info.description` line in it is updated to point at this ADR's successor; the rest of its content should be byte-comparable to what it says today, and the first `git diff` after the swap is the honest measure of how far the DTOs are from the document.
3. **Nothing downstream changes, and that is the test of the seam.** The client, the validators, and the MSW handlers are already generated from this document. If the regenerated document produces no diff in `packages/client/src/generated/`, the seam held. If it does produce one, the diff is a list of places where a DTO and this document disagreed — read it, do not dismiss it, and change whichever is wrong.
4. **This file is replaced by generated output, not edited.** From step 2 on, `openapi/sovren.json` is never hand-edited again: a change to a request or response shape is a change to a DTO followed by a regeneration. `make generate-check` is the pin — it regenerates the client and fails on any diff against what is committed, and it is the same mechanism R36 asks for.
5. **This ADR is marked superseded** by the first ADR that records the DTOs as the spine, and its `info.description` reference in the document is repointed at that one.

## What is already enforced, and therefore not at risk from the deviation

The four conventions a later contributor is most likely to break are pinned by tests against the document itself rather than against the generated code — reading `openapi/sovren.json` and asserting its shape is a legitimate seam precisely because the document _is_ the contract and the generated code cannot drift from it by construction:

- every `List` operation returns the flat `{ items, nextPage }` envelope, with `nextPage` an opaque token and never an offset
- every path parameter is a plain required string that accepts a name or an id
- every operation's error responses carry a fixed sovren `code` and a `requestId`
- every long-work verb returns `202` with a `Task`, and nothing else returns `202`
- `Drive` is a physical disk on a `Node` and has no `vmId`; `Disk` is a VM's storage and has no `nodeId`

The first of those is a test rather than a `$ref` to a shared `Page` schema on purpose: composing the envelope with `allOf` makes the generator emit `items` twice, and a duplicated key is not a type. The schema is restated flat in each page schema, and the convention is held by the test instead of by the composition.

## Consequences

- A document change during the prototype is a two-step commit, not one: edit the document, then `make generate`. Committing the document without the regenerated client is the one drift this repository can currently have, and `make check` is what catches it.
- The document is the reviewable artefact during the prototype, which is the main thing gained: the console's whole contract can be read in one file before a line of server code exists.
- The error vocabulary, the pagination envelope, the name-or-id path parameters, and the 202-with-`Task` rule are all declared in the document now, so the DTOs written later inherit them rather than inventing them.
