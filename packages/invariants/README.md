# @sovren/invariants

The safety suite: the invariants that keep the generation chain honest.

Everything downstream of `openapi/sovren.json` is generated — the typed client, the
react-query hooks, the Zod validators, the MSW handlers, and the mock backend that
seeds the console. That is what makes them incapable of drifting from one another.
What nothing currently enforces is that the file a human edits is the file
everything is generated from.

This package closes that gap. It is a workspace package rather than part of
`packages/client` or `packages/fakes` because what it asserts are properties of the
_repository_: it reads the document, the generated tree, the world builder, the mock
backend, the identifier prefixes, and the toolchain configuration, and compares them
against each other.

**Read this before changing the document.** Every invariant below is enforced, and
almost every one of them fails with a message that says what drifted and what to run.

```sh
make generate     # after any change to openapi/sovren.json
make check        # the full sweep, including this suite
```

---

## Why this exists at all

ADR 0001 records that `openapi/sovren.json` is **hand-authored** for the prototype.
It is a deliberate, recorded deviation from R36, which says the DTOs are the spine
and the document is derived from them. There is no control plane, so there is
nothing to derive a document from.

The deviation has a cost, and ADR 0001 states it plainly: _a hand-maintained
document can drift, and for now nothing enforces that it does not._ Everything
downstream of the document still cannot drift from each other, because all of them
are generated from the one document. What is unverified is only that the document
describes the server that will eventually exist.

**This suite is what holds that deviation honest.** It does not make the document
derived; it makes the cost of it visible at build time instead of at review time.
When the DTOs arrive and `@nestjs/swagger` starts emitting the document, ADR 0001's
step 3 is the test of the seam: the regenerated document should produce no diff in
`packages/client/src/generated/`. Invariant 1 below is that test, already running.

---

## The invariants

Nine rules, each with a file, a reason, and a negative control that proves the
check bites.

| #   | Invariant                                               | Where                       | What it catches                                                                                                            |
| --- | ------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Regenerating produces no diff                           | `tests/generation.test.ts`  | A document change committed without the regenerated client — _the one drift this repository can currently have_ (ADR 0001) |
| 2   | A hand-edit to a generated artefact is caught           | `tests/generation.test.ts`  | A generated file edited by a person, which the next regeneration destroys silently                                         |
| 3   | The document version and the generated version agree    | `tests/generation.test.ts`  | A partial regeneration leaving two documents' worth of artefacts in one tree                                               |
| 4   | Every identifier the mock backend serves is well-formed | `tests/identifiers.test.ts` | A malformed id in a fixture, which resolves to nothing and renders a blank row                                             |
| 5   | Every operation is implemented or acknowledged          | `tests/coverage.test.ts`    | A spec change that adds an operation nothing serves — a 404 in the dev server, a blank screen in the console               |
| 6   | The suite is wired into `make check` and CI             | `tests/wiring.test.ts`      | The suite quietly ceasing to run, which is the one failure nothing else reports                                            |
| 7   | Every failure message is actionable                     | `tests/generation.test.ts`  | A message that says "assertion failed" and costs an hour                                                                   |
| 8   | The vocabulary stays honest                             | `tests/vocabulary.test.ts`  | A `Drive` that grew a `vmId`, a `Service` type the document never had to name                                              |
| 9   | The generated tree is excluded from fmt and lint        | `tests/generation.test.ts`  | The exclusion being dropped, which would let `vp check --fix` rewrite generated output again                               |

### 1. Regenerating produces no diff

`generate()` runs orval into a **temporary directory** from the committed
`openapi/sovren.json`, and the suite compares that tree to
`packages/client/src/generated/` byte for byte.

Three details make the comparison mean something:

- **The temporary tree, not an in-place regeneration.** Orval deletes and rewrites
  `src/generated/` wholesale, so asking the question in place would destroy the
  evidence — and would leave the working tree modified on a failing run, which in a
  shared repository is somebody else's problem.
- **The real orval config is imported, not copied.** A hand-maintained copy of
  `packages/client/orval.config.ts` inside this suite would be a second statement of
  how the client is generated, and it would drift the moment somebody added a third
  output. `generate.ts` reads the committed config and rewrites only the three
  fields that must move.
- **The mutator is copied, and the working directory is `packages/client`.** Orval
  writes a relative import for the mutator, and reads the `@tanstack/react-query`
  major version from the nearest `package.json` to decide the shape of the hooks it
  emits. Get either wrong and every generated file differs, for reasons that have
  nothing to do with drift.

**The generated tree is currently untracked** (`git status` reports
`?? packages/client/src/generated/`), so the suite relies on the filesystem rather
than on git. The check works identically whether the tree is tracked or not: it
compares what is on disk against what the generator produces, and never asks git
what is committed. That is a deliberate choice — `git status --porcelain` on an
untracked tree reports the whole directory as one entry, which is exactly the
signal `make generate:check` uses and is not a signal this suite can use.

### 2. A hand-edit is caught

The same comparison, asked the narrower question: is any committed generated file a
file orval did not write? This is the check that matters most right now, because
`vp check --fix` used to rewrite generated output before it was excluded from lint
(see `vite.config.ts`, where the reasoning is written). Orval emits
`({...{...}, ...override})` for every nested mock, `no-useless-spread` flags it, and
the fixer deleted the spread — leaving a tree a human appeared to have edited.

**Detected by comparison against a fresh generation, not by a hash file.** A
`.generated-hash` checked in beside the tree would be updated by whoever made the
edit, including by a fixer run without thinking. There is no file a hand-edit can
update alongside itself.

The three drift cases are reported separately because they have three different
causes and three different fixes: `changed` (a hand-edit or a stale regeneration),
`missing` (the generator writes it, it is not committed), and `orphaned` (it is
committed and the generator no longer writes it — the worst, because
`pnpm run generate` deletes the directory wholesale and takes it with no warning).

### 3. Version agreement

The document carries `info.version`; orval copies it into every generated header as
`OpenAPI spec version: X`. The suite reads both and compares.

A mismatch means the tree holds artefacts from two different documents, which is
the state a partial regeneration leaves behind and which is otherwise invisible. A
generated file with _no_ header is reported separately, because it means something
different: a file orval did not write.

Orval's two re-export barrels — `index.ts` and `zod/index.ts` — carry no header and
are exempt **by shape** rather than by name, so a new barrel is exempt
automatically and a hand-written file is not, whatever it is called.

### 4. Identifier shape

The pattern is imported from `packages/fakes` (`ID_PREFIXES`, `idPattern`) and never
restated. A second copy is a second thing to keep in step, and it would eventually
disagree with the first — at which point the world builder would reject ids the
console accepts, and the disagreement would look like a data bug.

**The seam is the wire, not the source text.** An earlier version scanned every
`.ts` file for identifier-shaped tokens, and it was wrong: a test suite's negative
controls are _supposed_ to contain malformed identifiers, so the scan reported
`packages/fakes/tests/estate-consistency.test.ts` for the very strings that test
exists to reject. A check whose false positives are other people's negative
controls gets switched off within a week.

So the suite asks the mock backend what it actually serves, over real HTTP, and
reads the bodies. That has a property the text scan could not have: it reaches
identifiers the backend _mints_, which never pass through the world builder and are
therefore invisible to the world builder's own check. It found the `tk_pending-` and
`vm_pending-` families, which are acknowledged with reasons (see below).

**What this can and cannot see.** A body on the wire carries an id and nothing
saying which resource it belongs to, so the check can judge an id's _shape_ — the
prefix, and the ten Crockford characters — and nothing more. It cannot catch a VM
whose id is well-formed but opens `nd_`. That check exists and is not here: it is
in `packages/client/tests/contract.test.ts`, read off the document's schemas, where
the pairing is _declared_ rather than inferred. The two together cover both halves.

### 5. Operation coverage

The document's operations against the endpoints the mock backend actually serves.
Both directions, because each catches a different mistake:

- **An operation with no implementation.** A spec change that adds an operation
  would otherwise 404 in the dev server and show up as a blank screen — the failure
  surfacing where it was noticed rather than where it was made.
- **An implementation with no operation.** A handler left behind for an operation
  removed from the document. Not harmless: the endpoint answers for a contract that
  has moved on, and no future DTO will produce it.

Endpoints are read off the **live handler list**, not parsed out of `handlers.ts` as
text. The mock backend's central claim is that the method and path of every endpoint
are read off the generated handler, so reading them off the running handlers is
reading them off the generator. A text scan would be reading the same claim from a
file that could say one thing and do another.

**The acknowledged lists** are in [`src/acknowledged.ts`](src/acknowledged.ts), and
each entry carries a reason. A reason that is empty or merely a noun is treated as
an _outstanding decision_ rather than a made one, because "out of scope" without
saying what for is the sentence that lets a gap outlive the prototype.

**All three lists are pruned from the other side.** An acknowledgement whose
operation has since been implemented is reported as out of date. A list that is
only ever added to stops being a record of decisions and becomes a list of things
somebody once gave up on.

### 6. The suite is wired in

Read from the files that define it — `pnpm-workspace.yaml`, the `Makefile`,
`vite.config.ts`, `docs/tech-stack.md` — rather than assumed from the fact that
these tests are executing.

The negative control is the point: `checkRunsTests` passes on
`check: lint typecheck test` today, and must fail the day somebody drops `test` from
that line, which is exactly the edit that would silently retire every invariant here.

#### A defect this suite found in the Makefile

**`make` cannot currently parse the repository's Makefile.** Two `.PHONY` lines name
targets whose names contain a colon:

```make
.PHONY: generate:check
.PHONY: down:hard
```

To GNU Make, a target name containing a colon is a _static pattern rule_, not a
target, so it stops with `target pattern contains no '%'` before reading a single
recipe — and `make` then refuses to run at all:

```
$ make generate
Makefile:36: *** target pattern contains no '%'.  Stop.
```

That breaks `make check`, `make generate`, and `make generate:check` for everyone,
which means **every invariant in this package is currently unreachable through
`make`.** The suite still runs through `vp test` directly, which is how the figures
below were measured.

The fix is one character per line — `.PHONY: generate\:check` and
`.PHONY: down\:hard` — or renaming the targets to `check-generate` and `hard-down`.
It is in a file this package does not own, so it is **reported here rather than
applied**. `tests/wiring.test.ts` asserts the two offending lines _by name_ and
passes, so the day they are fixed the assertion fails and names what changed.

It is worth a check of its own because the failure is silent from the repository's
point of view: the Makefile is a file nothing else reads, and the first sign of
trouble is a contributor discovering that `make` does not work at all.

### 7. Every failure is actionable

The acceptance criterion is that every message names what drifted and how to
regenerate it, and the only honest way to hold six checks to that is to check the
messages. `poorlyFormed` runs over a corpus of deliberately broken inputs and
rejects any violation with an empty subject, an empty detail, or no remedy.

The regeneration failures quote the **first differing line**, with a line number and
one line of context either side, plus what the generator produced. "model/node.ts
differs" is the message that costs an hour; the same message with the offending line
next to it costs a minute.

The remedy is `make generate`, and a separate check asserts the Makefile has a
`generate` and a `generate:check` target — a remedy naming a target that does not
exist is worse than no remedy, because the reader runs it, gets "no such target",
and has learned nothing.

### 8. The vocabulary

**Deliberately not repeated.** `packages/client/tests/contract.test.ts` already
holds five naming checks against the document: `Drive` has a `nodeId` and no
`vmId`, `Disk` has the reverse, no schema carries both, `DiskPage` and `DrivePage`
stay separate, and only `Endpoint` and `NetworkResource` reuse NetBird's collided
word. Those are not restated here.

What is here is what a document-only check cannot reach:

- **The estate.** The document can say a `Drive` has a `nodeId` while `fleet.ts`
  gives one a `vmId`, and every document-level check still passes. The estate is
  read here, not declared.
- **The identifier prefixes.** `ID_PREFIXES` is in no document.
- **The packages' TypeScript vocabularies.** The document's schema list is a subset
  of the Nomenclature table — there is no `Service`, no `Endpoint`, no
  `NetworkResource`, no `Site` operation, no `CertificateAuthority` at all. So a
  `Service` type invented in `packages/fakes` or `packages/console` would collide
  with the Dokploy `Service` without the contract ever noticing. This is the most
  valuable of the three and the least obvious.

`packages/invariants` is excluded from its own name scan, for a stated reason: a
check has to _name_ the rule it enforces, and `PERMITTED_SERVICE_NAMES` is the rule,
written down. That exclusion is asserted in a test, so widening it is a visible
change.

### 9. The tooling exclusion

`vite.config.ts` excludes `**/src/generated/**` from both `fmt` and `lint`, and that
exclusion is what makes invariants 1 and 2 mean something. Asserted separately
because the failure mode is invisible: the day somebody drops the `ignorePatterns`
entry, the fixer starts editing generated files again and produces exactly the
hand-edits this suite exists to catch — while the suite itself kept passing, because
the fixer and the suite had come to disagree about what a clean tree means.

---

## What is acknowledged, and why

Three lists in [`src/acknowledged.ts`](src/acknowledged.ts). Each entry is a
decision, and each is checked in both directions so the lists cannot rot.

### `ACKNOWLEDGED_OPERATIONS` — declared, deliberately not served

**`VMDelete`.** The prototype has no delete path for a VM. The create form is the
only write form built, and a delete needs a confirmation dialog and a transitional
state behind it — unbuilt screens rather than unbuilt mocks. The operation stays in
the document because the document is the contract, not a rendering of the console's
current screens; narrowing it to what the console renders today is precisely what ADR
0001 exists to prevent. The generated handler exists; nothing pairs it with an
estate, because the estate is a description of what exists and a delete would make it
change under a reader.

### `ACKNOWLEDGED_SERVING` — served, but not by the generated handler alone

**`TaskLogStream`.** The document declares `text/event-stream`, which is what a
browser's `EventSource` asks for and what R49 wants. The generated client goes
through the same mutator as every other call, which reads the body as JSON, so it
cannot consume a stream; orval emits one `TaskLogEvent` for it because a return type
cannot express a stream. Both callers are served from one endpoint, chosen by the one
thing that genuinely distinguishes them: what they said they accept. The JSON branch
is the generated handler, so the generated client's declared type is honoured; the
SSE branch is hand-written, so the document is. A hand-written response to a declared
operation is exactly the thing that ought to be named rather than discovered.

### `ACKNOWLEDGED_IDENTIFIER_PREFIXES` — served, and not sovren identifiers

**`tk_pending-` and `vm_pending-`.** The Task and VM ids the backend mints for a
create it does not perform, keyed by prefix because the values are minted per
request from the name in the body.

The estate is a description of what exists, so a create that invented a finished VM
would be teaching the console to render a success nobody observed. The create
answers with a `queued` Task the operator can watch and cancel — and that Task has no
estate row to take an id from, hence a synthesised one.

**The synthesised id is outside the id rule on purpose.** An operator who copies it
out of the console and pastes it into a path parameter gets a `not_found`, because
nothing in the estate answers to it. That is honest. A well-formed id that resolved to
nothing would be worse: it would look like a real resource and render a detail page
for a VM that does not exist.

---

## How a check is proved to bite

Every invariant has a negative control, and the pattern is the one
`packages/client/tests/contract.test.ts` established: take what a check reads, clone
it, break one thing, and assert the check notices.

The checks are **pure functions of their arguments** — that is what makes this
possible without a fixture on disk and without touching a file another agent may be
working in. `src/checks.ts`, `src/identifiers.ts` and `src/vocabulary.ts` reach for
nothing; `src/repo.ts` knows where the repository is, `src/generate.ts` runs a
generator, and `src/wire.ts` asks the mock backend what it serves.

Where a check reads an allowlist, the allowlist is a **parameter with a default**
rather than a closed-over import. A negative control passes `{ VMDelete: "" }` and
watches the check notice, instead of mutating the real list and making the result
depend on test order.

A convention test that cannot fail is worse than no test, because it reads like
coverage. Every check here has been watched to go red.

---

## Cost

The suite is **113 tests in about 2.2 seconds**, of which roughly 1.5 seconds is
three orval runs at half a second each. Everything else is milliseconds. That is fast
enough to run on every change, which is the only speed that matters for a safety
suite: a suite slow enough to skip is a suite that catches nothing.

`packages/invariants` declares `testTimeout: 60_000` to bound each orval run. A
generator that hangs fails rather than wedging `make check`; the bound is loose
enough that a cold, contended machine does not turn a passing suite red.

---

## Files

| File                                         | What it holds                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| [`src/acknowledged.ts`](src/acknowledged.ts) | The three decision lists, each entry with a reason                        |
| [`src/violation.ts`](src/violation.ts)       | The `Violation` shape, and the check that messages are actionable         |
| [`src/repo.ts`](src/repo.ts)                 | Where everything is, and how to read the document and the generated tree  |
| [`src/generate.ts`](src/generate.ts)         | A fresh generation into a temporary tree, from the committed orval config |
| [`src/checks.ts`](src/checks.ts)             | The pure checks: drift, hand-edits, versions, coverage, messages          |
| [`src/wire.ts`](src/wire.ts)                 | Asks the mock backend what it actually serves, over real HTTP             |
| [`src/identifiers.ts`](src/identifiers.ts)   | Identifier shape, judged against the world builder's rule                 |
| [`src/vocabulary.ts`](src/vocabulary.ts)     | The Drive/Disk split, the collided word, the prefixes                     |
| [`src/wiring.ts`](src/wiring.ts)             | Whether this suite is reached at all                                      |
| [`src/backend.ts`](src/backend.ts)           | The served endpoint list, and the repository's own sources                |
