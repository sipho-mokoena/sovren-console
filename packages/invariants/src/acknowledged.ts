/**
 * The decisions a person made, written down.
 *
 * Two lists, and the difference between them is the whole point.
 *
 * `ACKNOWLEDGED_OPERATIONS` is for operations the document declares that the
 * mock backend **does not serve**. There is exactly one at the moment, and the
 * reason is in its entry. The alternative to a list is silence, and silence here
 * means a document operation that 404s in the dev server and shows up as a blank
 * screen -- which is the failure mode this entire package exists to convert into
 * a build failure.
 *
 * `ACKNOWLEDGED_SERVING` is for operations that **are** served but not the way the
 * generated handler alone would serve them. `TaskLogStream` is the case: the
 * document declares `text/event-stream`, orval's return type cannot express a
 * stream, and the backend answers both callers from one endpoint by branching on
 * the `Accept` header. The JSON branch is the generated handler; the SSE branch
 * is not, and a hand-written response to a declared operation is exactly the
 * thing that ought to be named rather than discovered.
 *
 * `ACKNOWLEDGED_IDENTIFIER_PREFIXES` is for identifiers the backend serves that
 * are not sovren identifiers. One family, minted per request for a create the
 * mock deliberately does not perform.
 *
 * **All three lists are pruned from the other side.** `staleAcknowledgementViolations`
 * fails the build if an acknowledged operation has since been implemented, and
 * `servingViolations` fails it if a listed divergence is no longer in the
 * document. A list that is only ever added to stops being a record of decisions
 * and becomes a list of things somebody once gave up on.
 *
 * **A reason is required, and a noun is not one.** The coverage check treats an
 * entry with an empty reason as an outstanding decision rather than a made one,
 * because "out of scope" without saying what for is the sentence that lets a gap
 * outlive the prototype.
 */

/**
 * Declared by the document, deliberately not served by the mock backend.
 *
 * `VMDelete` — the prototype has no delete path for a VM. The console's three
 * archetypes are built around a list, a detail and a form over a still-mounted
 * list, and the one form the prototype implements is the create form; a delete
 * confirmation dialog and the transitional state behind it are unbuilt screens
 * rather than unbuilt mocks. The operation is in the document because the
 * document is the contract and the contract is not narrowed to what the console
 * happens to render today — that narrowing is what ADR 0001 exists to prevent.
 * The generated handler exists and is the one that would serve it; nothing pairs
 * it with an estate, because the estate is a description of what exists and a
 * delete would make it a thing that changes under a reader.
 */
export const ACKNOWLEDGED_OPERATIONS: Readonly<Record<string, string>> = {
  VMDelete:
    "No delete path for a VM exists in the prototype: the create form is the only write form built, and a delete needs a confirmation and a transitional state behind it. The operation stays in the document because the document is the contract, not a rendering of the console's current screens. The generated handler exists; nothing pairs it with an estate, because the estate is a description of what exists and a delete would make it change under a reader.",
};

/**
 * Served by the mock backend in a way the generated handler alone does not.
 *
 * `TaskLogStream` — the document declares `text/event-stream`, because that is
 * what a browser's `EventSource` asks for and R49 wants logs streamed rather
 * than polled. The generated client goes through the same mutator as every other
 * call, which reads the body as JSON, so it cannot consume a stream; orval emits
 * one `TaskLogEvent` for it because a return type cannot express a stream. Both
 * callers are therefore served from one endpoint, chosen by the one thing that
 * genuinely distinguishes them: what they said they accept. The JSON branch is
 * the generated handler, so the generated client's declared type is honoured;
 * the SSE branch is written by hand, so the document is honoured. A queued Task
 * has emitted nothing, and an `EventSource` is content with an empty stream
 * where the generated client is refused in a fixed code.
 */
export const ACKNOWLEDGED_SERVING: Readonly<Record<string, string>> = {
  TaskLogStream:
    "Served in two forms from one endpoint, branched on the Accept header. The document declares text/event-stream, which the generated client cannot consume because orval's return type cannot express a stream, so the JSON branch is the generated handler and the SSE branch is hand-written. Both are needed: one honours the document, the other honours the type the generator produced.",
};

/**
 * Identifiers the mock backend serves that are not sovren identifiers.
 *
 * Matched by prefix rather than by whole value, because the values are minted
 * per request from the name in the body: `tk_pending-accra-golden-02` is one of
 * them today and `tk_pending-anything` is tomorrow's. Matching exactly would make
 * a list that is wrong the moment somebody types a different VM name, which is a
 * list that stops being read.
 *
 * These are the Task and VM ids the backend mints for a create it does not
 * perform. The estate is a description of what exists, and a mock that invented a
 * finished VM would be teaching the console to render a success nobody observed.
 * So the create answers with a Task the operator can watch and cancel, and that
 * Task has no row in the estate to take an id from — hence a synthesised one.
 *
 * The synthesised id is deliberately outside the id rule, and that is worth
 * saying plainly rather than hiding: an operator who copies it out of the console
 * and pastes it into a path parameter gets a `not_found`, because nothing in the
 * estate answers to it. That is honest. A well-formed id that resolves to nothing
 * would be worse — it would look like a real resource and render a detail page
 * for a VM that does not exist. The safety suite found these by reading the wire,
 * which the world builder's own check cannot do: they never pass through it.
 */
export const ACKNOWLEDGED_IDENTIFIER_PREFIXES: Readonly<Record<string, string>> = {
  "tk_pending-":
    "A Task id for a create the mock backend deliberately does not perform, minted per request from the name in the body. The estate is a description of what exists, so a create that invented a VM would teach the console to render a success nobody observed, and the Task returned has no estate row to take an id from. The id is outside the id rule on purpose: it resolves to nothing, which is true, rather than being well-formed and resolving to a machine that does not exist, which would be a lie a detail page could render.",
  "vm_pending-":
    "The VM id inside that Task's target, minted the same way and for the same reason. A Task's target is a link to a resource, and this one links to a resource that does not exist yet because the create is queued rather than performed. The generated client never resolves it -- the target is rendered as a link, and a queued create's link is followed after the Task completes against the real control plane.",
};
