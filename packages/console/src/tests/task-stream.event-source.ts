/**
 * An `EventSource` for jsdom, which has none.
 *
 * **The gap this fills is the browser's, not the console's.** jsdom implements
 * `fetch`, and MSW's node interceptor patches it, so a request this shim makes is
 * answered by the same generated mock backend every other console test talks to
 * -- the estate, the handlers, the `Accept` header that chooses the SSE branch,
 * the `Last-Event-ID` resume. What jsdom does not have is the one API that can
 * hold a response open, so the tests install this in its place and the screen
 * under test is unchanged: it calls `new EventSource(url)`, listens for `log`,
 * `step` and `result`, and reacts to `error`.
 *
 * **It is a transport, not a mock.** It speaks the real protocol -- frames split
 * on a blank line, `id:`/`event:`/`data:` fields, a `message` event when the
 * server named none -- over a real `fetch` to a real handler, and it implements
 * the connection states the HTML standard describes, because the console's
 * reconnect policy is built on the difference between two of them:
 *
 *  - a **dropped** stream (the wire went away) fires `error` and leaves
 *    `readyState` at CONNECTING, and the console reconnects from `Last-Event-ID`;
 *  - a **refused** stream (a status, or a content type that is not
 *    `text/event-stream`) fires `error` and sets `readyState` to CLOSED, and the
 *    console stops, because retrying a refusal is the poller this project is not
 *    building;
 *  - a **clean end** fires nothing at all, because a browser reconnects silently
 *    and the page cannot tell. The console therefore never claims a stream ended
 *    -- it only knows what it received.
 *
 * The three controls at the bottom are the awkward cases the task detail ticket
 * names: a malformed line, a dropped connection, and the line after them. A test
 * that could not produce a broken line could not assert that the console shows
 * one, and a test that could not drop the wire could not assert that the console
 * survives it.
 */

export interface EventSourceControl {
  /**
   * Deliver this many events, then drop the connection the way a lost socket
   * does: `error` with `readyState` still CONNECTING. Nothing further is sent.
   */
  readonly dropAfterEvents?: number;
  /**
   * Report the response as a refusal, whatever it was.
   *
   * A browser refuses a stream that is not a `200` carrying
   * `text/event-stream`, and the console's behaviour differs between the two
   * failures: a dropped wire is retried and a refusal is not. The mock backend's
   * controls are page-wide -- `?sentinel=` refuses every operation, including the
   * `TaskView` this page needs to render at all -- so a refusal staged against
   * *one* operation is not something the URL can express, and this is what stands
   * in for it.
   */
  readonly refuse?: boolean;
  /**
   * Replace this event's payload with a line that is not JSON at all -- a
   * provisioner whose stdout was truncated mid-write, which is the shape this
   * actually arrives in.
   */
  readonly corruptEvent?: number;
  /**
   * Replace this event's payload with well-formed JSON the *document* rejects: a
   * tag outside the fixed vocabulary, so the generated validator refuses it even
   * though it parses.
   */
  readonly invalidEvent?: number;
  /**
   * How long the browser's own silent retry waits after a clean end. Three
   * seconds, which is what a browser uses. No test asserts on it: the console
   * owns its retries, and this is the fallback it is not relying on.
   */
  readonly retryIntervalMs?: number;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

const noop = (): void => undefined;

class ShimEventSource {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSED = CLOSED;

  readonly url: string;
  withCredentials = false;
  readyState: number = CONNECTING;

  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: Event) => void) | null = null;

  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  private readonly control: EventSourceControl;
  private controller: AbortController | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private lastEventId = "";
  private delivered = 0;
  private dropped = false;
  private closedByCaller = false;

  constructor(url: string | URL, _init?: EventSourceInit) {
    this.url = String(url);
    this.control = currentControl;
    void this.connect();
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Route one event to the listeners for its name, and to the `on<type>` handler. */
  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.type === "open") this.onopen?.(event);
    if (event.type === "error") this.onerror?.(event);
    if (event.type === "message") this.onmessage?.(event);
    return true;
  }

  close(): void {
    this.closedByCaller = true;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.controller?.abort();
    this.readyState = CLOSED;
  }

  /** One connection, from the request to the last frame or the drop. */
  private async connect(): Promise<void> {
    this.readyState = CONNECTING;
    this.controller = new AbortController();

    let response: Response;
    try {
      response = await fetch(this.url, {
        headers: {
          // The one thing that genuinely distinguishes an `EventSource` from the
          // generated client, and the mock backend's own comment says so.
          accept: "text/event-stream",
          ...(this.lastEventId === "" ? {} : { "last-event-id": this.lastEventId }),
        },
        signal: this.controller.signal,
      });
    } catch {
      this.fail();
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      this.control.refuse === true ||
      response.status !== 200 ||
      !contentType.includes("text/event-stream")
    ) {
      // A status, not a dropped wire: the browser does not retry this, and
      // neither may the page.
      this.readyState = CLOSED;
      this.dispatchEvent(new Event("error"));
      return;
    }

    this.readyState = OPEN;
    this.dispatchEvent(new Event("open"));

    const body = response.body;
    if (body === null) {
      this.retryLater();
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const chunk = await reader.read();
        if (this.closedByCaller) return;
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n");

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          // The drop takes effect at the frame that crossed the limit, not at the
          // end of the chunk: a reader that kept dispatching would deliver the
          // events *after* the cut, and the resume point would be the last one
          // rather than the one the connection died on.
          if (this.handleFrame(frame)) break;
          boundary = buffer.indexOf("\n\n");
        }

        if (this.dropped) {
          // Reported before the reader is torn down, and not awaited: the
          // interceptor's stream does not settle `cancel()`, and a test that
          // waited for it would wait for ever. The page is what this exists for.
          this.fail();
          void reader.cancel().catch(noop);
          return;
        }
      }
    } catch {
      // An abort, a reset, a socket that went away mid-read. A browser reports
      // that the same way a lost connection is reported, and `close()` is one of
      // the ways to get here -- which is why the caller check comes first.
      this.fail();
      return;
    }

    // The server closed cleanly. A browser reconnects without saying anything,
    // so this shim does too, and the page learns nothing from it -- which is
    // exactly why the console never reports an outcome from the end of a stream.
    this.retryLater();
  }

  /** One frame: comments, fields, and a dispatch if it carried data. */
  private handleFrame(raw: string): boolean {
    let type = "message";
    let id: string | null = null;
    const data: string[] = [];

    for (const line of raw.split("\n")) {
      if (line === "" || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") type = value;
      else if (field === "id") id = value;
      else if (field === "data") data.push(value);
    }

    if (id !== null) this.lastEventId = id;
    if (data.length === 0) return false;

    this.delivered += 1;
    let payload = data.join("\n");
    if (this.control.corruptEvent === this.delivered) payload = '{"seq":1,"tag":"log","messa';
    if (this.control.invalidEvent === this.delivered) {
      payload = JSON.stringify({
        seq: this.delivered,
        tag: "warning",
        at: "2026-03-04T09:00:00Z",
        message: "a tag the contract does not declare",
      });
    }

    this.dispatchEvent(
      new MessageEvent(type, {
        data: payload,
        lastEventId: id ?? "",
        origin: this.url,
      }),
    );

    if (
      this.control.dropAfterEvents !== undefined &&
      !droppedOnce &&
      this.delivered >= this.control.dropAfterEvents
    ) {
      // Once per test, not once per connection: a control plane that drops every
      // stream after two events would make a reconnect loop for ever, and the
      // thing under test is a console that recovers from one drop.
      droppedOnce = true;
      this.dropped = true;
      return true;
    }
    return false;
  }

  /** A dropped wire: `error`, still CONNECTING, and a browser-style silent retry. */
  private fail(): void {
    if (this.closedByCaller) return;
    this.readyState = CONNECTING;
    this.dispatchEvent(new Event("error"));
    this.retryLater();
  }

  /**
   * The browser's own reconnect.
   *
   * Skipped when a listener closed the source in response to the error, which is
   * what the console does: it owns its retries so that it can show them, resume
   * deliberately, and stop once a terminal state has been observed.
   */
  private retryLater(): void {
    if (this.closedByCaller || this.readyState === CLOSED) return;
    this.readyState = CONNECTING;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, this.control.retryIntervalMs ?? 3_000);
  }
}

/** The control the *next* connection will use. Set per test by `installEventSource`. */
let currentControl: EventSourceControl = {};

/** Whether this test's drop has already happened. See `dropAfterEvents`. */
let droppedOnce = false;

/**
 * Put the shim in the global scope, the way a browser has it.
 *
 * A test that forgets to call this gets a screen that cannot open a stream, and
 * the failure says so -- which is the right way round: the shim is the thing that
 * should be noticed when it is missing, not the screen.
 */
export const installEventSource = (control: EventSourceControl = {}): void => {
  currentControl = control;
  droppedOnce = false;
  (globalThis as { EventSource?: unknown }).EventSource = ShimEventSource;
};

/** Take the shim away again, so one test's control cannot leak into the next. */
export const removeEventSource = (): void => {
  (globalThis as { EventSource?: unknown }).EventSource = undefined;
};
