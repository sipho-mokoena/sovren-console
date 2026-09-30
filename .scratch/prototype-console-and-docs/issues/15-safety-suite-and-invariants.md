# 15: The invariants that keep the chain honest

**What to build:** The generation chain is only trustworthy if something refuses to let it drift. A safety suite runs on every change and fails loudly when the committed document differs from a regenerated one, when a generated artefact has been hand-edited, when the document version and the generated client version disagree, or when a fixture identifier is malformed. Drift is caught by the build rather than discovered in a console that quietly disagrees with the server.

Serves R36, R53, R54, R57. The provisional document from ticket 02 is the reason this matters most while the control plane does not exist — there is nothing else to catch the drift.

**Blocked by:** 02 — The contract document, and a client generated from it. 13 — Documentation site carrying all of it.

**Status:** ready-for-agent

**Delivered.**

- [ ] Regenerating the document and the client produces no diff; a deliberate change fails the check with a readable message.
- [ ] A hand-edit to any generated artefact is detected and fails the check.
- [ ] The document version and the generated client version are compared, and a mismatch fails.
- [ ] Every fixture identifier in the estate description is validated for shape, and a malformed one fails rather than rendering a broken row.
- [ ] An operation present in the document with no implementation, or an implementation with no operation, fails the build until someone decides — an unimplemented operation must be acknowledged rather than silently absent.
- [ ] The safety suite runs inside `make check` and in CI, and is fast enough to run on every change.
- [ ] Every failure message names what drifted and how to regenerate it.
- [ ] The suite asserts the naming rules that keep the vocabulary honest: `Drive` is never used for VM storage, `Disk` never for a physical disk, and no sovren noun collides with NetBird's "service".

## Comments

Delivered. Nine invariants, 113 tests, each with a negative control proving the check can fail. Found `tk_pending-`/`vm_pending-` -- ids minted per request for a create the mock deliberately does not perform, outside the id rule on purpose because they resolve to nothing, which is true.
