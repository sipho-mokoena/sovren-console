# 04: Every error speaks sovren, and every error is reproducible

**What to build:** When something is wrong, the operator is told what went wrong in sovren's words, not Proxmox's or NetBird's, and the same failure can be reproduced on demand. Every error carries a stable sovren code and a `requestId`; the same `requestId` appears in the audit trail, so a problem an operator reports is traceable end to end. Error paths are driven by a sentinel the operator types, not by hidden request interception, so the failure is reproducible in the dev server and a test asserts the same thing. An action that cannot be taken explains which sovren code is holding it back, rather than disappearing.

Serves R34, R35, R36, R43, R56, R101.

**Blocked by:** 03 — One estate description seeds every mock.

**Status:** ready-for-agent

**Delivered.**

- [ ] Every error the mock backend can return carries a sovren error code and a `requestId`; no upstream error body reaches the console untranslated.
- [ ] Each error state a screen can show — not found, unauthorised, upstream unavailable, malformed request, conflict, action not permitted — has its own fixed code, and a test asserts the codes.
- [ ] The console renders the code, the message, and the `requestId`, and offers a way to act on the failure rather than only reporting it.
- [ ] A failure is triggered by a sentinel the operator types, and the same sentinel produces the same failure in the dev server and in a test.
- [ ] The `requestId` in an error is the same value recorded in the audit trail for that request.
- [ ] A disabled action explains why it is disabled, and the reason is one of the fixed codes rather than free text.
- [ ] The generated client returns a discriminated result union and never throws on an HTTP failure, so a call site that ignores failure does not type-check.
- [ ] An unknown upstream error is translated to the closest sovren code rather than passed through as an untyped body.

## Comments

Delivered. Ten fixed codes, and sentinels are a **query parameter or a path value** -- `?sentinel=upstream-unavailable`, `/nodes/~not-found` -- because a header is invisible in a screenshot of the bug and an env var does not exist in a test. An unknown sentinel name is a `400` listing the valid ones, so a typo in the reproduction never looks like the bug not happening. `requestId` is minted once and written to an audit log the test can query.
