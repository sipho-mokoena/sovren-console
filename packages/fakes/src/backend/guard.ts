/**
 * Answering a request that failed, without hand-writing an endpoint.
 *
 * Every operation the document declares is served by the handler orval generated
 * for it: the generated handler owns the method, the path, the status, and the
 * JSON serialisation, and the estate supplies the body. That is the property
 * that makes the mocks incapable of drifting from the client, and it is worth
 * being precise about how it survives the parts a generated handler cannot do.
 *
 * **A generated handler cannot serve a failure.** Orval emits one handler per
 * declared success status, each of which always answers with that status. A 404
 * that is not a name anything answers to, a 409 from a Task that already
 * finished, a 422 from an action the estate forbids -- none of those is a
 * response the generated handler will produce, and asking it to would mean
 * writing the status by hand and calling that generated.
 *
 * So failures go through a **guard**, and the guard does not declare an endpoint.
 * It takes the generated handler and reads the method and the path off it --
 * `RequestHandler.info` is public MSW API, not an internal -- and builds its own
 * handler from those. There is one path in the codebase, and it was written by
 * the generator. Move `/nodes/{node}` in the document, regenerate, and the guard
 * follows it to the new path without anyone editing this file.
 *
 * **The guard answers only when it has something to say.** Returning `undefined`
 * hands the request to the next handler, and MSW takes the first one that
 * produces a response, so a normal request is served by the generated handler
 * and only by it. The guard's whole job is the three things the generated
 * handler cannot know: a sentinel the operator typed, a ref nothing answers to,
 * and an action the estate forbids.
 */

import { HttpResponse, http, type HttpHandler } from "msw";

import { auditLog } from "../errors/audit-log";
import { sentinelIn } from "../errors/sentinels";
import { fail, mintRequestId, type SovrenErrorDetail } from "../errors/vocabulary";
import { statusForCode } from "../errors/vocabulary";
import type { ErrorCode } from "@sovren/client";

/** What a resolver is handed. MSW's own shape, named once so it is not repeated. */
/**
 * What a resolver is handed, named once so it is not restated at every read.
 *
 * `params` keeps MSW's own shape -- a value can be a repeated segment or absent,
 * because that is what a path matcher can produce. Nothing in this contract
 * repeats a segment, and `refOf` narrows once rather than every caller guessing.
 */
export interface ResolverInfo {
  request: Request;
  params: Record<string, string | readonly string[] | undefined>;
}

/** MSW's resolver info, which is what both a generated handler and a guard hand over. */
export type MswResolverInfo = Parameters<Parameters<typeof http.get>[1]>[0];

/**
 * The method and path a generated handler serves.
 *
 * Read off the handler rather than written down, so the endpoint is declared
 * exactly once -- by the generator. `RequestHandler.info` is public in MSW's own
 * type declarations; `info.path` is a predicate in general and a path string in
 * practice, and a predicate would mean orval had generated something this cannot
 * mirror, which is worth failing on rather than guessing at.
 */
export const endpointOf = (handler: HttpHandler): { method: string; path: string } => {
  const { method, path } = handler.info;
  if (typeof path !== "string" || typeof method !== "string") {
    throw new Error(
      `The generated handler serves a predicate rather than a path, so its endpoint cannot be mirrored: ${String(handler.info.header)}`,
    );
  }
  return { method, path };
};

/** MSW's verb table, reached by name because `endpointOf` returns a string. */
const verbs: Record<string, "get" | "post" | "put" | "patch" | "delete" | "head" | "options"> = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
  HEAD: "head",
  OPTIONS: "options",
};

/**
 * What a guard decides about one request.
 *
 * `Response` answers, `undefined` declines. Declining is the common case and the
 * one worth being able to express: a guard that cannot say "not my business" is a
 * guard that shadows the generated handler for every request.
 */
export type GuardDecision = Response | undefined | Promise<Response | undefined>;

/**
 * Build the guard for one operation, from its generated handler.
 *
 * @param operation the operationId, which is also the audit trail's operation name
 * @param generated the handler orval generated, used only for its method and path
 * @param decide what to do about this request
 */
export const guard = (
  generated: HttpHandler,
  decide: (info: ResolverInfo) => GuardDecision,
): HttpHandler => {
  const { method, path } = endpointOf(generated);
  const verb = verbs[method];
  if (verb === undefined) {
    throw new Error(`The generated handler uses a method this guard cannot mirror: ${method}`);
  }
  return http[verb](path, async (info: MswResolverInfo) =>
    decide({ request: info.request, params: info.params }),
  ) as unknown as HttpHandler;
};

/**
 * The failure a request asked for by typing a sentinel.
 *
 * R56: the failure is triggered by a value in the URL, so the dev server and a
 * test take the identical path from the identical input. Nothing here inspects
 * the test runner, the environment, or a header a browser would not send.
 *
 * An unrecognised sentinel is an `invalid_request` rather than a shrug. A typo in
 * the one mechanism meant to reproduce a bug must not look like the bug did not
 * happen, and the error says what the mechanism accepts.
 */
export const sentinelResponse = (request: Request, operation: string): Response | undefined => {
  const url = new URL(request.url);
  const found = sentinelIn(url);
  if (found.kind === "none") return undefined;

  if (found.kind === "unknown") {
    return failure(
      request,
      operation,
      "invalid_request",
      `\`${found.value}\` is not a sentinel this build knows.`,
      [
        {
          path: "sentinel",
          constraint: "notFound",
          message:
            "Append ?sentinel=<name> to any request. The names are the error codes, kebab-cased: not-found, unauthorised, forbidden, conflict, invalid-request, upstream-unavailable, upstream-unauthenticated, action-not-permitted, task-failed, internal.",
        },
      ],
    );
  }

  return failure(
    request,
    operation,
    found.directive.code,
    `${messageFor(found.directive.code)} The sentinel asked for this.`,
    undefined,
    found.directive.name,
  );
};

const messageFor = (code: ErrorCode): string => {
  switch (code) {
    case "not_found":
      return "Nothing answers to that name or id.";
    case "unauthorised":
      return "The console's session was rejected.";
    case "forbidden":
      return "A credential sovren holds is not permitted to do this.";
    case "conflict":
      return "The estate is already in a state that refuses this action.";
    case "invalid_request":
      return "That request could not be accepted as written.";
    case "upstream_unavailable":
      return "Proxmox, NetBird, or Dokploy is not answering.";
    case "upstream_unauthenticated":
      return "An upstream rejected the credential sovren holds.";
    case "action_not_permitted":
      return "This action is not permitted for this resource right now.";
    case "task_failed":
      return "The Task this depended on failed.";
    case "internal":
      return "The control plane failed in a way sovren has no code for.";
  }
};

/**
 * A sovren failure, served and recorded.
 *
 * R34: the `requestId` in the body and the `requestId` in the audit trail are
 * the same value, minted once here. That agreement is the whole of the
 * requirement, and it is only maintainable if one function produces both -- a
 * handler that minted a second id on the way out would produce an error the
 * operator could quote and an audit entry nobody could find.
 *
 * The status is read from the code rather than passed in, so a handler cannot
 * serve `action_not_permitted` as a 404 and teach the console something false
 * about its own vocabulary.
 */
export const failure = (
  request: Request,
  operation: string,
  code: ErrorCode,
  message: string,
  details?: SovrenErrorDetail[],
  /**
   * The sentinel that caused this, when one did.
   *
   * Recorded so a test can tell a staged failure from a real one. Without it a
   * sentinel test and a genuine outage are indistinguishable in the trail, and
   * the one thing the trail exists for -- tracing a report -- becomes ambiguous
   * for every failure the mock can stage.
   */
  sentinel?: string,
): Response => {
  const requestId = mintRequestId();
  const sovren = fail(code, message, requestId, details);
  const url = new URL(request.url);
  auditLog.record({
    requestId,
    request: { method: request.method, path: `${url.pathname}${url.search}`, operation },
    status: statusForCode(code),
    code,
    message,
    ...(sentinel === undefined ? {} : { sentinel }),
  });
  return errorResponse(sovren.body, statusForCode(code), requestId);
};

/**
 * The response for a sovren error, carrying the `requestId` in the header too.
 *
 * The header is not decoration: the client's mutator prefers `x-request-id` over
 * the body, so putting it in both places means a proxy that rewrites a body
 * cannot detach an error from its trail.
 */
export const errorResponse = (
  body: ReturnType<typeof fail>["body"],
  status: number,
  requestId: string,
): Response => HttpResponse.json(body, { status, headers: { "x-request-id": requestId } });

/**
 * A success, recorded in the audit trail.
 *
 * Every request is recorded, not only the failures. A log that contains only
 * errors cannot answer "did that succeed?", and the interesting question about a
 * destructive action is usually about the request that preceded it.
 */
export const recordSuccess = (request: Request, operation: string, status: number): void => {
  const url = new URL(request.url);
  auditLog.record({
    requestId: mintRequestId(),
    request: { method: request.method, path: `${url.pathname}${url.search}`, operation },
    status,
  });
};

/**
 * The guard for a list: sentinel only, so the generated handler serves the page.
 *
 * A list cannot fail on a ref -- there is no ref in a list -- so this is the whole
 * of what can go wrong before the estate is consulted.
 */
export const listGuard = (operation: string, generated: HttpHandler): HttpHandler =>
  guard(generated, (info) => sentinelResponse(info.request, operation));

/**
 * The value a path parameter carried.
 *
 * A repeated segment takes its first value and an absent one takes the empty
 * string, both of which then fail the `NameOrId` lookup and become a
 * `not_found` naming what was asked for -- rather than a crash on `undefined`.
 */
export const refOf = (info: ResolverInfo, key: string): string => {
  const value = info.params[key];
  if (value === undefined) return "";
  return Array.isArray(value) ? (value[0] ?? "") : String(value);
};

/** A query parameter, or null. */
export const param = (request: Request, key: string): string | null =>
  new URL(request.url).searchParams.get(key);

/** A query parameter narrowed to one of a fixed set, or null. */
export const enumParam = <T extends string>(
  request: Request,
  key: string,
  allowed: readonly T[],
): T | null => {
  const raw = param(request, key);
  if (raw === null) return null;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
};

/**
 * An enum filter that may be repeated, because some questions are not one value.
 *
 * `purpose=infrastructure&purpose=service` is the estate's own machines; a
 * single-valued filter could not ask for that, because a Dokploy host is
 * infrastructure by the spec's reading and would otherwise sit in a list beside
 * the operator's own machines -- which is the confusion this exists to remove.
 *
 * A value outside the vocabulary is ignored rather than fatal, exactly as
 * `enumParam` ignores one: a stale bookmark narrows less than it used to, and
 * says nothing false about what it found.
 */
export const enumListParam = <T extends string>(
  request: Request,
  key: string,
  allowed: readonly T[],
): readonly T[] | null => {
  const values = new URL(request.url).searchParams.getAll(key);
  const accepted = values.filter((value) => (allowed as readonly string[]).includes(value)) as T[];
  return accepted.length === 0 ? null : accepted;
};
