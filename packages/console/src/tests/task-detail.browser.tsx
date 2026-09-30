/**
 * Fleet → Tasks → one Task, in a browser, against the generated mock backend.
 *
 * This is the capability the project rests on, so the seam is the whole console:
 * the estate is seeded by the world builder, the log is served by the fakes' SSE
 * branch over the same `Accept: text/event-stream` a browser sends, the resume is
 * the `Last-Event-ID` the document declares, and the only thing under test is
 * what the screen does with the lines.
 *
 * **The one thing a test has to add is `EventSource` itself**, which jsdom does
 * not have. The shim in `task-stream.event-source.ts` is a transport, not a mock:
 * it speaks the real protocol over a real `fetch` to the real handler, and the
 * only controls it exposes are the awkward cases the ticket names by name -- a
 * malformed line, a dropped connection, and the line after them.
 *
 * **Nothing here asserts a timer.** The console is forbidden from calling a Task
 * finished before a terminal state has actually been received, so most of these
 * tests are the negative form of that: after the whole log has been delivered and
 * the stream has gone quiet, the page must still refuse to name an outcome.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderConsole } from "../test/render-console";
import { installEventSource, removeEventSource } from "./task-stream.event-source";

/** The Task page, once it has rendered. */
const taskPage = async (name: string): Promise<HTMLElement> =>
  await screen.findByRole("region", { name });

/** The transcript's event rows, in order. */
const eventRows = (page: HTMLElement): HTMLElement[] =>
  [...page.querySelectorAll("li[data-log-event]")] as HTMLElement[];

/** The transcript's unreadable lines. */
const faultRows = (page: HTMLElement): HTMLElement[] =>
  [...page.querySelectorAll("li[data-log-fault]")] as HTMLElement[];

/** The `seq` of every event row, in the order the transcript shows them. */
const seqsOf = (page: HTMLElement): (string | null)[] =>
  eventRows(page).map((row) => row.getAttribute("data-seq"));

/** Every message in the transcript, joined -- which is what a log is. */
const transcriptOf = (page: HTMLElement): string =>
  [...page.querySelectorAll("li[data-log-event]")].map((row) => row.textContent).join("\n");

/** The page, as an operator reads it. */
const main = (): HTMLElement => screen.getByRole("main");

describe("Fleet → Tasks → one Task", () => {
  beforeEach(() => {
    installEventSource();
  });

  afterEach(() => {
    removeEventSource();
  });

  it("opens with the identity block, and says which section is on screen in the URL", async () => {
    const { router } = await renderConsole("/fleet/tasks/tk_01hq2t0005");
    const page = await taskPage("create-grafana-canary");

    // R40: id, created, updated, on every detail page, identical every time.
    const identity = page.querySelector('[data-identity="true"]');
    expect(identity?.querySelector("code")?.textContent).toBe("tk_01hq2t0005");
    expect(identity?.textContent).toContain("Created");
    expect(identity?.textContent).toContain("Updated");

    // The section is a link, not a piece of local state: the tab is in the URL so
    // the page can be handed to a colleague as the thing being looked at.
    const sections = within(page).getByRole("navigation", { name: "Task sections" });
    const overview = within(sections).getByRole("link", { name: "Overview" });
    expect(overview.getAttribute("aria-current")).toBe("page");
    expect(overview.getAttribute("href")).toContain("tab=overview");

    const log = within(sections).getByRole("link", { name: "Log" });
    expect(log.getAttribute("href")).toContain("tab=log");
    expect(log.getAttribute("aria-current")).toBeNull();

    fireEvent.click(log);
    await waitFor(() => {
      expect(
        new URL(router.state.location.href, window.location.origin).searchParams.get("tab"),
      ).toBe("log");
    });
    expect(
      within(within(page).getByRole("navigation", { name: "Task sections" }))
        .getByRole("link", { name: "Log" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("replays a finished Task's whole log from the beginning, line by step, to its result", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0001?tab=log");
    const page = await taskPage("create-netbird");

    await waitFor(() => {
      expect(eventRows(page)).toHaveLength(5);
    });

    // From the beginning: the first line is the first thing the provisioner wrote.
    expect(seqsOf(page)).toEqual(["1", "2", "3", "4", "5"]);
    expect(transcriptOf(page)).toContain("plan: 3 to add, 0 to change, 0 to destroy");
    expect(transcriptOf(page)).toContain(
      "Apply complete. Resources: 1 added, 0 changed, 0 destroyed.",
    );

    // A step transition is rendered as a transition, not as another line of
    // output: the shape of a run is plan, then boot, then cloud-init, then enrol.
    const steps = [...page.querySelectorAll("li[data-log-step]")].map((row) =>
      row.getAttribute("data-log-step"),
    );
    expect(steps).toEqual(["plan", "boot", "cloud-init", "enrol"]);

    // And a result is not a log line. It is the terminal line, and it carries the
    // state the work reached.
    const results = eventRows(page).filter(
      (row) => row.getAttribute("data-log-event") === "result",
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.textContent).toContain("succeeded");
    expect(page.querySelectorAll('li[data-log-event="log"]')).toHaveLength(4);

    // So the outcome is observable, and it says where it came from.
    expect(page.querySelector('[data-outcome="succeeded"]')).not.toBeNull();
    expect(page.textContent).toContain("observed: the result event on the log stream.");
  });

  it("never calls a running Task finished, however quiet the stream goes", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0005?tab=log");
    const page = await taskPage("create-grafana-canary");

    // Four lines, all of them `log`, and no result among them.
    await waitFor(() => {
      expect(eventRows(page)).toHaveLength(4);
    });
    expect(page.querySelectorAll('li[data-log-event="log"]')).toHaveLength(4);
    expect(page.querySelectorAll('li[data-log-event="result"]')).toHaveLength(0);
    // The whole log, held.
    expect(page.querySelector('[data-lines="held"]')?.textContent).toBe("4 of 4 events held");

    // And nothing on the page says the work is done. Not on the strength of the
    // log looking finished, not on a timer, not because the state is the last
    // thing the page heard: there is no outcome strip at all, because an empty
    // one would claim the work finished and the console had nothing to say.
    expect(page.querySelector("[data-outcome]")).toBeNull();
    expect(main().textContent).not.toContain("succeeded");
    expect(main().textContent).not.toContain("This Task succeeded");
    expect(within(page).getAllByText("running").length).toBeGreaterThan(0);
  });

  it("says a Task has emitted nothing rather than opening a stream that will stay empty", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0010?tab=log");
    const page = await taskPage("restore-grafana-canary");

    expect(await screen.findByText("This Task has emitted nothing yet")).toBeDefined();
    // A queued Task has not been claimed, so the stream is not opened at all
    // rather than opened and left reconnecting to nothing.
    expect(page.querySelector("[data-stream]")?.getAttribute("data-stream")).toBe("idle");
    expect(page.querySelector("ol[data-log]")).toBeNull();
  });

  it("shows a failure that names what failed, not merely that something did", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0013?tab=log");
    const page = await taskPage("snapshot-grafana-canary-base");

    const outcome = page.querySelector('[data-outcome="failed"]');
    expect(outcome).not.toBeNull();
    // What failed, specifically -- the agent that did not answer, the operation
    // that could not be quiesced.
    expect(outcome?.querySelector('[data-outcome-reason="true"]')?.textContent).toBe(
      "the guest agent did not answer within 30s, so the snapshot could not be quiesced",
    );
    // The result line carries the terminal state, and the log shows the line that
    // went wrong at the level it went wrong at.
    const result = eventRows(page).find((row) => row.getAttribute("data-log-event") === "result");
    expect(result?.textContent).toContain("failed");
    expect(transcriptOf(page)).toContain("the guest agent did not answer within 30s");

    // And on the overview, as a property: a failure is diagnosable after the fact.
    fireEvent.click(within(page).getByRole("link", { name: "Overview" }));
    const table = await within(page).findByRole("table", { name: "Task properties" });
    expect(table.querySelector('[data-property="Failure reason"]')?.textContent).toContain(
      "the guest agent did not answer within 30s",
    );
    expect(table.querySelector('[data-property="Terminal state"]')?.textContent).toContain(
      "failed",
    );
  });

  it("shows a cancellation as a cancellation, which is not a failure", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0007?tab=log");
    const page = await taskPage("create-lab-build-02");

    const outcome = page.querySelector('[data-outcome="cancelled"]');
    expect(outcome).not.toBeNull();
    expect(outcome?.querySelector('[data-outcome-reason="true"]')?.textContent).toBe(
      "Cancelled by an operator from the console.",
    );
    // Not dressed as a fault, and with no failure reason invented for it.
    expect(page.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(outcome?.querySelector('[data-state="cancelled"]')?.getAttribute("data-tone")).not.toBe(
      "bad",
    );

    fireEvent.click(within(page).getByRole("link", { name: "Overview" }));
    const table = await within(page).findByRole("table", { name: "Task properties" });
    // The two reasons are separate properties, and only one of them is set: this
    // is what "visibly distinct" means on a properties table.
    expect(table.querySelector('[data-property="Cancellation reason"]')?.textContent).toContain(
      "Cancelled by an operator",
    );
    expect(table.querySelector('[data-property="Failure reason"]')?.textContent).not.toContain(
      "did not answer",
    );
  });

  it("cancels a running Task, stops the stream, and keeps every line", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0005?tab=log");
    const page = await taskPage("create-grafana-canary");
    await waitFor(() => {
      expect(eventRows(page)).toHaveLength(4);
    });

    fireEvent.click(within(page).getByRole("button", { name: "Cancel" }));

    // What was observed is the request, not the outcome: a `202` means the
    // cancellation was accepted, and the state it reached is a later fact.
    expect(
      await screen.findByText("Cancellation requested for create-grafana-canary"),
    ).toBeDefined();
    expect(screen.getByTestId("toasts").textContent).toContain("202 · tk_01hq2t0005");

    // The state the control plane returned is what the page now shows, and it is
    // a cancellation rather than a failure.
    await waitFor(() => {
      expect(page.querySelector('[data-outcome="cancelled"]')).not.toBeNull();
    });
    expect(page.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(
      within(page)
        .getAllByText("cancelled")
        .filter((node) => node.getAttribute("data-state") === "cancelled").length,
    ).toBeGreaterThan(0);

    // The stream stopped, and stopping it lost nothing: every line the operator
    // was watching is still on screen.
    expect(page.querySelector("[data-stream]")?.getAttribute("data-stream")).toBe("closed");
    expect(eventRows(page)).toHaveLength(4);
    expect(seqsOf(page)).toEqual(["1", "2", "3", "4"]);

    // And the control is now the refusal it has become: the Task is cancelled, so
    // there is no process left to signal, and the console says so with the code
    // rather than dropping the control (R43).
    const after = within(page).getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    expect(within(page).getByText("action_not_permitted")).toBeDefined();
  });

  it("shows the code when the control plane refuses a cancel, and changes nothing", async () => {
    await renderConsole("/fleet/tasks/tk_01hq2t0010");
    const page = await taskPage("restore-grafana-canary");

    // The contract lets a queued Task be cancelled; this one has not been claimed
    // by a provisioner, so there is no process to signal. The console offered the
    // control, the control plane refused, and the refusal is what is shown -- the
    // code and the requestId it is traced by.
    fireEvent.click(within(page).getByRole("button", { name: "Cancel" }));

    const toast = await screen.findByText(
      "The control plane will not cancel restore-grafana-canary",
    );
    expect(toast).toBeDefined();
    const toasts = screen.getByTestId("toasts");
    expect(toasts.textContent).toContain("action_not_permitted");
    expect(toasts.textContent).toMatch(/req_/);

    // No state was invented: the Task is still queued, and no outcome is claimed.
    expect(page.querySelector("[data-outcome]")).toBeNull();
    expect(
      within(page)
        .getAllByText("queued")
        .filter((node) => node.getAttribute("data-state") === "queued").length,
    ).toBeGreaterThan(0);
  });

  it("shows a malformed line rather than dropping it, and keeps the lines around it", async () => {
    // Two different kinds of broken, because they break in different places: a
    // payload truncated mid-write is not JSON at all, and a well-formed line the
    // contract does not describe parses and is still wrong.
    installEventSource({ corruptEvent: 2, invalidEvent: 3 });
    await renderConsole("/fleet/tasks/tk_01hq2t0005?tab=log");
    const page = await taskPage("create-grafana-canary");

    await waitFor(() => {
      expect(faultRows(page)).toHaveLength(2);
    });

    // Two lines the console could not read, said out loud rather than skipped: a
    // run that shows clean over a broken stream is the failure this screen exists
    // to prevent.
    expect(page.querySelector('[data-faults="2"]')?.textContent).toBe("2 unreadable lines");
    const [truncated, unknownTag] = faultRows(page);
    expect(truncated?.querySelector("[data-fault-why]")?.textContent).toBe("it is not JSON");
    // The raw line is shown, because an operator reading a failure needs the line
    // the provisioner actually wrote.
    expect(truncated?.textContent).toContain('{"seq":1,"tag":"log","messa');
    expect(unknownTag?.querySelector("[data-fault-why]")?.textContent).toContain("tag");

    // The lines that did arrive are all still there, once each, in order -- the
    // broken ones cost their own row and nothing else.
    expect(seqsOf(page)).toEqual(["1", "4"]);
    expect(page.querySelectorAll('li[data-log-event="log"]')).toHaveLength(2);
  });

  it("survives a dropped connection: it resumes, and neither loses nor duplicates a line", async () => {
    // The wire goes away after two events. The console has to reconnect *and*
    // continue -- not restart, not leave a gap, and not show the two events twice
    // when the server replays from the beginning.
    installEventSource({ dropAfterEvents: 2 });
    await renderConsole("/fleet/tasks/tk_01hq2t0005?tab=log");
    const page = await taskPage("create-grafana-canary");

    // The resume is visible, which is the point: the console had two events and
    // asked to continue from the second rather than from the start.
    await waitFor(() => {
      expect(page.querySelector('[data-resumed-from="2"]')).not.toBeNull();
    });
    expect(page.querySelector('[data-resumed-from="2"]')?.textContent).toBe("resumed from #2");

    // And the whole log is on screen, once each, in order -- with no refresh
    // pressed and no line missing.
    await waitFor(() => {
      expect(eventRows(page)).toHaveLength(4);
    });
    expect(seqsOf(page)).toEqual(["1", "2", "3", "4"]);
    expect(page.querySelectorAll("ol[data-log] > li")).toHaveLength(
      // Four events, and the step transition before each: plan, apply, boot,
      // cloud-init. Every line of this run opens a new step, so the transcript is
      // half markers by coincidence rather than by construction.
      8,
    );
    expect(page.querySelector("[data-lines='held']")?.textContent).toBe("4 of 4 events held");
    // Still no outcome: the resumed lines are not a terminal state.
    expect(page.querySelector("[data-outcome]")).toBeNull();
  });

  it("offers a retry when the control plane refuses the stream, rather than spinning", async () => {
    // A refusal is a status, not a lost wire, and the two are handled differently
    // on purpose: a dropped stream is reconnected and resumed, a refused one is
    // left alone and offered to the operator as a control. Retrying a refusal on a
    // timer is the poller this screen is not allowed to be.
    installEventSource({ refuse: true });
    await renderConsole("/fleet/tasks/tk_01hq2t0005?tab=log");
    const page = await taskPage("create-grafana-canary");

    await waitFor(() => {
      expect(page.querySelector("[data-stream]")?.getAttribute("data-stream")).toBe("refused");
    });
    expect(screen.getByText("the control plane refused this stream")).toBeDefined();
    const retry = within(page).getByRole("button", { name: /Reconnect/ });
    expect(retry).toBeDefined();
    // Nothing arrived, so nothing is claimed: no lines, and no outcome.
    expect(page.querySelector("ol[data-log]")).toBeNull();
    expect(page.querySelector("[data-outcome]")).toBeNull();
  });

  it("says a Task nothing answers to is not found, rather than showing a blank page", async () => {
    await renderConsole("/fleet/tasks/tk_nosuchtask");

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(alert.textContent).toMatch(/requestId\s*req_/);
    expect(within(alert).getByRole("link", { name: /Back to the tasks/ })).toBeDefined();
  });
});
