import type { Error as SovrenError, ErrorCode } from "./generated/model";

/**
 * The mutator every generated call goes through.
 *
 * R35: the client never throws on an HTTP failure, and what it returns instead
 * is a discriminated union -- discriminated on `status` -- so a call site that
 * ignores failure cannot mistake an error body for a resource. `NodePage` and
 * `SovrenError` have nothing in common, so a page that renders `response.data`
 * without narrowing is a type error, not a blank screen in production.
 *
 * The second job here is R34/R27: a fixed sovren error vocabulary. Whatever the
 * control plane or an upstream sends, what crosses this boundary is sovren's
 * own code, message and requestId. The console keys off `code` and can never be
 * broken by an upstream string it has not seen.
 */

/**
 * The shape orval's fetch client hands a mutator, after the URL: the request's
 * own `RequestInit`, plus the method lifted out of it.
 */
export type FetchOptions = RequestInit & { method?: string };

/** The envelope every call resolves to, success or failure. Never a throw. */
export interface SovrenResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/**
 * The control plane is served same-origin as the console, so the URL is built
 * from `location.origin` -- which keeps the session cookie first-party and
 * keeps one absolute form that MSW's handlers match in the browser and in node
 * alike. Node has no origin, so a test resolves against a placeholder host; the
 * interceptor is what actually answers.
 */
const origin = (): string =>
  typeof globalThis.location?.origin === "string" && globalThis.location.origin !== "null"
    ? globalThis.location.origin
    : "http://control-plane.test";

/** The versioned path every control-plane operation hangs off. */
export const API_BASE = "/api/v1";

/**
 * The absolute URL for a control-plane path, resolved the same way `safeFetch`
 * resolves it.
 *
 * Exported because a consumer that opens its own connection to the control plane
 * — an `EventSource` for a log stream, for instance — needs the same origin and
 * the same prefix, and a second copy of `/api/v1` typed into another file is a
 * second thing to be wrong when the prefix moves.
 */
export const apiUrl = (path: string): string => `${origin()}${API_BASE}${path}`;

/**
 * Turn anything that is not already a sovren error into one.
 *
 * An upstream body is data about the failure, not a shape to pass through. If
 * Proxmox renames an error string, the console keeps working because it never
 * saw the string.
 */
export const translateError = (status: number, body: unknown, requestId: string): SovrenError => {
  if (body && typeof body === "object" && "code" in body && "message" in body) {
    const candidate = body as Partial<SovrenError>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return {
        code: candidate.code as ErrorCode,
        message: candidate.message,
        requestId: candidate.requestId ?? requestId,
        ...(candidate.retryable === undefined ? {} : { retryable: candidate.retryable }),
        // `details` is what puts a validation error on the control that caused
        // it. Dropping it here leaves every form with a sentence and nowhere to
        // hang it, so the console can only colour the whole form red.
        ...(candidate.details === undefined ? {} : { details: candidate.details }),
      };
    }
  }

  const byStatus: Record<number, SovrenError> = {
    400: {
      code: "invalid_request",
      message: "The control plane could not accept that request as written.",
      requestId,
      retryable: false,
    },
    401: {
      code: "unauthorised",
      message: "The control plane rejected these credentials.",
      requestId,
      retryable: false,
    },
    403: {
      code: "forbidden",
      message: "The configured credentials may not do this.",
      requestId,
      retryable: false,
    },
    404: {
      code: "not_found",
      message: "Nothing here answers to that name or id.",
      requestId,
      retryable: false,
    },
    409: {
      code: "conflict",
      message: "Something else already claims that name.",
      requestId,
      retryable: false,
    },
    422: {
      code: "invalid_request",
      message: "The control plane could not accept that request as written.",
      requestId,
      retryable: false,
    },
  };

  if (status === 0 || status >= 500) {
    return {
      code: "upstream_unavailable",
      message: "The control plane is not answering. It may be starting.",
      requestId,
      retryable: true,
    };
  }

  return (
    byStatus[status] ?? {
      code: "internal",
      message: "The control plane returned something sovren does not recognise.",
      requestId,
      retryable: false,
    }
  );
};

const mintRequestId = (): string =>
  `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const safeFetch = async <T>(path: string, config: FetchOptions): Promise<T> => {
  const requestId = mintRequestId();
  const url = apiUrl(path);

  let response: globalThis.Response;
  try {
    // orval hands the mutator an already-stringified body, so re-stringifying
    // would send a JSON string literal where an object belongs. Anything that
    // is not yet a string is serialised here.
    response = await fetch(url, {
      ...config,
      method: config.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...Object.fromEntries(new Headers(config.headers)),
      },
      ...(config.body === undefined
        ? {}
        : { body: typeof config.body === "string" ? config.body : JSON.stringify(config.body) }),
    });
  } catch {
    // The request never reached the control plane. Still a sovren error: the
    // console has one error vocabulary, not one per transport.
    return {
      data: translateError(0, undefined, requestId),
      status: 0,
      headers: new Headers(),
    } as T;
  }

  const requestIdHeader = response.headers.get("x-request-id") ?? requestId;

  let body: unknown;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  if (!response.ok) {
    return {
      data: translateError(response.status, body, requestIdHeader),
      status: response.status,
      headers: response.headers,
    } as T;
  }

  return { data: body, status: response.status, headers: response.headers } as T;
};
