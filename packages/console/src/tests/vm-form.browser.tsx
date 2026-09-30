/**
 * Create and edit as routes, in a browser, against the generated mock backend.
 *
 * The estate is seeded by the world builder, the handlers are the ones orval
 * generated from the document, the client is the one orval generated, and the
 * only thing between them is the console and the form archetype. A form that
 * behaves here is a form that behaves in the dev server.
 *
 * ## What these tests are actually pinning
 *
 * Five claims, each of which is a way a console can be wrong in a way nobody
 * notices until somebody loses an afternoon:
 *
 *  1. **A form is a page, not a panel.** It is the whole screen, it is an
 *     address, and the list is not behind it.
 *  2. **The operator gets back to the list they were reading** -- filtered,
 *     sorted, on page three, with a repeated filter key -- because that state
 *     lives in the URL and is carried there and back by the console, not held by
 *     a component that used to stay mounted. This is the claim the change to a
 *     full page put at risk, and it is most of this file.
 *  3. **A create is a `202`, not a `200`.** The document answers 202 with a
 *     `Task`, and reading that the other way round reports a Task body as an
 *     error.
 *  4. **A refusal belongs on the control that caused it**, with the constraint
 *     the control plane named and the rest of the form still filled in.
 *  5. **Nothing is claimed before it is observed.** No row appears for a VM whose
 *     create Task has not finished, and no toast says "created".
 *
 * ## Two places where the estate says no, and the test says so out loud
 *
 * The mock backend does not create VMs and does not perform deletes -- both by
 * design, and both acknowledged by the invariants suite. So:
 *
 *  - a create returns a real `202` with a `queued` Task that the estate does not
 *    hold, and the task page reports `not_found` honestly rather than inventing
 *    progress. That is asserted below, including the assertion that it is not a
 *    blank page, because a create that navigates into a dead end is the failure
 *    mode here and the estate's silence is what exposed it.
 *  - `VMDelete` is not served at all, so the confirmation is asserted here and
 *    the 202 handling is asserted in the archetype's own test, against the same
 *    `Task` shape a create carries. A screen test that clicked through could not
 *    be written: `src/test/setup.ts` owns the only `setupServer`, exposes no
 *    `use`, and msw shares one set of interceptors, so a test cannot add a
 *    handler -- and an unserved request leaves the worker unable to finish.
 *
 * ## One ordering constraint, and the reason for it
 *
 * **The confirmation test is last in this file, and must stay last.** Opening and
 * closing a `ConfirmDialog` and then unmounting leaves the worker unable to
 * finish the *next* test: with a dialog test anywhere but last, this file hangs
 * rather than failing, and the hang is in teardown rather than in anything a test
 * asserts. It was found by bisection -- a dialog test followed by a navigation
 * hangs; a navigation test followed by a dialog does not -- and it is recorded
 * here because an unexplained hang in a suite is how a real failure stops being
 * believed.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { claimsCompletion } from "@/components/sovren/toast";
import { renderConsole } from "../test/render-console";

/**
 * The VMs list's table.
 *
 * Found by being *the table in the page*, not by the page's title: the list is
 * another screen's, and what it calls itself -- "VMs", "Infrastructure",
 * "Workloads" -- is that screen's business and not this file's. The shell's
 * sidebar also renders a table, so the two are told apart by where they are.
 */
const vmsTable = async (): Promise<HTMLElement> =>
  await within(screen.getByRole("main")).findByRole("table");

/** The rows of a table, header excluded. */
const rowsOf = (grid: HTMLElement): HTMLElement[] =>
  [...grid.querySelectorAll("tr[data-row]")] as HTMLElement[];

/** One row, found by the name in its identity column. */
const rowNamed = (grid: HTMLElement, name: string): HTMLElement => {
  const found = rowsOf(grid).find(
    (row) => row.querySelector('[data-column="name"]')?.textContent === name,
  );
  if (found === undefined)
    throw new Error(`no row named ${name} among ${String(rowsOf(grid).length)}`);
  return found;
};

const hasRow = (grid: HTMLElement, name: string): boolean =>
  rowsOf(grid).some((row) => row.querySelector('[data-column="name"]')?.textContent === name);

const currentUrl = (router: { state: { location: { href: string } } }): URL =>
  new URL(router.state.location.href, window.location.origin);

/**
 * The form page, by its own title.
 *
 * A `region` and not a `dialog`: the archetype is a page, and a test that found
 * it by `role="dialog"` would be asserting the design this change removed.
 */
const formPage = (name: string): HTMLElement => screen.getByRole("region", { name });

/** The breadcrumb's link to the list, with the address the console built. */
const crumb = (page: HTMLElement): HTMLAnchorElement =>
  within(within(page).getByRole("navigation", { name: "Breadcrumb" })).getByRole("link");

/**
 * The Node picker, by role.
 *
 * By the combobox and not by its label text, because the create page's second
 * column is a table called "Node facts" and `^Node` matches that too -- a query
 * that means two things is a query that finds the wrong one on the day it starts
 * matching both.
 */
const nodePicker = (): HTMLSelectElement =>
  screen.getByRole("combobox", { name: /^Node/ }) as HTMLSelectElement;

/** Everything the toasts are saying, as one string. */
const toasts = (): string => screen.getByTestId("toasts").textContent ?? "";

/**
 * A control's accessible description, which may be more than one element: a hint
 * and a problem, side by side.
 */
const describedBy = (control: HTMLElement): string =>
  (control.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

/** Fill the create form. The values are literals, not recomputations. */
async function fillCreateForm(values: {
  node?: string;
  name?: string;
  purpose?: string;
  cores?: string;
  memoryMib?: string;
}) {
  // The Node picker is populated from the estate, so it has to have arrived
  // before a Node can be chosen.
  await screen.findByRole("option", { name: /^accra-server-02/ });
  if (values.node !== undefined) {
    fireEvent.change(nodePicker(), { target: { value: values.node } });
  }
  if (values.purpose !== undefined) {
    fireEvent.change(screen.getByLabelText(/^Purpose/), { target: { value: values.purpose } });
  }
  for (const [label, value] of [
    ["Name", values.name],
    ["Cores", values.cores],
    ["Memory", values.memoryMib],
  ] as const) {
    if (value !== undefined) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
  }
}

const submit = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Create the VM" }));
};

/**
 * The list's own pagination bar, as text.
 *
 * Read off the bar's own marker rather than with `getByText`, because the text
 * sits in a span inside a div inside the nav and every one of them carries the
 * same string -- a text query for "page 2" finds three elements and answers none
 * of them. A `getByRole` with a name would be worse: it computes an accessible
 * name for every element in a table of twenty-seven rows, on every poll.
 */
const paginationText = (): string => document.querySelector("[data-pagination]")?.textContent ?? "";

/**
 * The rows the list is showing, wherever they are.
 *
 * Counted off the DOM rather than found by role, so that "has this page arrived
 * yet" costs nothing on every poll.
 */
const rowsOnScreen = (): number => document.querySelectorAll("main [data-row]").length;

/**
 * The list's own "Next page", waited until it is a control and not a ghost.
 *
 * A list that has just been paged re-renders its pagination while its next
 * request is still in flight, and the bar's text has already moved on by then.
 * A click on a control that is disabled at that instant is a click that does
 * nothing at all, which reads afterwards as a list that will not page.
 */
const nextPageControl = async (): Promise<HTMLButtonElement> =>
  await waitFor(() => {
    const button = screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    return button;
  });

/**
 * One page forward, and wait for that page to have *arrived*.
 *
 * The three conditions are all read off the same settled render: the bar names
 * page two, the rows are in, and the controls are live again. Waiting on the bar's
 * text alone is the race -- the back stack is memory, so the page number changes
 * the instant the click is handled, while the rows of the new page arrive a
 * request later. One page and not three: what this has to prove is that an opaque
 * token the console could not have reconstructed survives the trip, and paging
 * three times deep adds nothing to that claim and two more chances to race a list
 * this console does not own.
 */
const goToTheSecondPage = async (): Promise<void> => {
  const next = await nextPageControl();
  fireEvent.click(next);
  await waitFor(() => {
    expect(paginationText()).toContain("page 2");
    expect(rowsOnScreen()).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
};

describe("the create form, as a page", () => {
  it("is an address an operator can paste into a chat", async () => {
    // A form that can only be reached by clicking a button on the list is not a
    // route; it is a boolean. So the address is the assertion: paste it in, and
    // it is the form.
    const { router } = await renderConsole("/fleet/vms/new");
    expect(currentUrl(router).pathname).toBe("/fleet/vms/new");

    // And it is a page: a heading of its own, and no dialog anywhere. R39 asks for
    // a form that is a page of its own, and the accessibility tree is part of the
    // page -- a `role="dialog"` here would tell a screen reader this is a modal
    // and send an operator looking for something to dismiss.
    expect(screen.getByRole("heading", { level: 1, name: "Create VM" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(formPage("Create VM").getAttribute("data-page")).toBe("form");
  });

  it("has the list nowhere behind it, because it is a page and not a panel", async () => {
    await renderConsole("/fleet/vms/new");
    await screen.findByRole("option", { name: /^accra-server-02/ });

    // The drawer kept the list mounted behind it, and that was the whole of how
    // the operator's place survived. A page has to carry it instead, so there is
    // nothing behind this one -- and the width beside the fields is spent on the
    // Node the guest will land on rather than on a table of every Node.
    expect(document.querySelector("main [data-row]")).toBeNull();
    const aside = screen.getByRole("complementary", {
      name: "The Node this guest lands on",
    });
    expect(
      within(aside).getByText(/Choose a Node and this column says what it has\./),
    ).toBeDefined();
  });

  it("puts the Node it is about to use in the column beside the field that picks it", async () => {
    await renderConsole("/fleet/vms/new");
    await screen.findByRole("option", { name: /^accra-server-02/ });
    fireEvent.change(nodePicker(), { target: { value: "accra-server-02" } });

    // The picker offered a name, a core count and a memory, which is enough to
    // choose a machine and not enough to reason about one. What the machine
    // actually has is beside the field, in the machine's own words -- and the
    // machine's CPU is reported as the machine's, with the guest's floor said
    // beside it rather than silently substituted for it (R63). A create form that
    // reported the host's CPU as the VM's would be reporting a fiction, and this
    // column is where an operator would believe it.
    const aside = screen.getByRole("complementary", { name: "The Node this guest lands on" });
    const facts = within(aside).getByRole("table", { name: "Node facts" });
    expect(facts.textContent).toContain("accra-lab");
    expect(facts.textContent).toContain("Intel Xeon Gold 6248R");
    expect(facts.textContent).toContain("192 GiB");
    expect(within(aside).getByText(/guest on it still runs the fleet floor/)).toBeDefined();
  });
});

describe("the operator's place survives the round trip", () => {
  /**
   * A list filtered two ways at once, sorted, and on its second page, with the
   * create form open.
   *
   * Two purposes at once is one question with two answers -- the estate's own
   * machines -- and it is the case a search parameter carried as a single string
   * gets wrong. A page beyond the first is a position inside an opaque token
   * (R33), which the console cannot construct and could not reconstruct from
   * anything, so a round trip that returns there cannot be faked by remembering a
   * page number. One page forward rather than three: the claim is the token, and
   * every extra click is another chance to race a list this console does not own.
   */
  const openTheFormFromALaterPage = async (): Promise<{
    router: Awaited<ReturnType<typeof renderConsole>>["router"];
    page: HTMLElement;
    listedRows: readonly string[];
    token: string;
  }> => {
    const { router } = await renderConsole(
      "/fleet/vms?purpose=infrastructure&purpose=service&sort=-runState&size=7",
    );
    await vmsTable();
    await goToTheSecondPage();
    // The rows of the page being left, so that coming back to it can be asserted
    // against something rather than against a remembered count.
    const listedRows = rowsOf(await vmsTable()).map((row) => row.textContent ?? "");
    const token = currentUrl(router).searchParams.get("page") ?? "";
    expect(token).toMatch(/^pt_/);
    expect(paginationText()).toContain("page 2");

    fireEvent.click(screen.getByRole("link", { name: "Create VM" }));
    const page = await screen.findByRole("region", { name: "Create VM" });
    return { router, page, listedRows, token };
  };

  it("carries the list's view onto the form, and points both ways out at it", async () => {
    const { router, page, token } = await openTheFormFromALaterPage();

    // The list is gone. That is the change, and everything below is what replaced
    // "still mounted". Asserted by the rows a list renders rather than by "no
    // table", because this page has a table of its own beside the fields.
    expect(document.querySelector("main [data-row]")).toBeNull();
    expect(currentUrl(router).pathname).toBe("/fleet/vms/new");

    // The form's own address still holds the operator's view, repeated key and
    // all: `purpose` twice, the sort, the size and the token.
    const onTheForm = currentUrl(router);
    expect(onTheForm.searchParams.getAll("purpose")).toEqual(["infrastructure", "service"]);
    expect(onTheForm.searchParams.get("sort")).toBe("-runState");
    expect(onTheForm.searchParams.get("size")).toBe("7");
    expect(onTheForm.searchParams.get("page")).toBe(token);

    // Three ways out, and they agree. The browser's back button works because the
    // operator arrived on a link that carried their view; the breadcrumb and
    // Cancel are the same href, asserted as a string rather than as a navigation
    // so a divergence between them would be legible rather than a race.
    const away = new URL(crumb(page).getAttribute("href") ?? "", "http://console.test");
    const cancel = within(page).getByRole("link", { name: "Cancel" });
    expect(cancel.getAttribute("href")).toBe(crumb(page).getAttribute("href"));
    expect(away.pathname).toBe("/fleet/vms");
    expect(away.searchParams.getAll("purpose")).toEqual(["infrastructure", "service"]);
    expect(away.searchParams.get("sort")).toBe("-runState");
    expect(away.searchParams.get("size")).toBe("7");
    expect(away.searchParams.get("page")).toBe(token);
  });

  it("puts the operator back on that page of that list, rebuilt from the address", async () => {
    const { router, page, listedRows } = await openTheFormFromALaterPage();

    fireEvent.click(within(page).getByRole("link", { name: "Cancel" }));
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms");
    });

    // The same rows, on the same page, still filtered and still sorted --
    // re-read from the address rather than remembered, because a page has nothing
    // left to remember them with.
    const after = await vmsTable();
    expect(rowsOf(after).map((row) => row.textContent)).toEqual([...listedRows]);
    expect(paginationText()).toContain("page 2");
  });

  it("is reachable by the back button, on the same view it was opened over", async () => {
    const { router } = await renderConsole("/fleet/vms?purpose=service");
    await vmsTable();
    fireEvent.click(screen.getByRole("link", { name: "Create VM" }));
    await screen.findByRole("region", { name: "Create VM" });
    expect(currentUrl(router).pathname).toBe("/fleet/vms/new");
    // The operator's view is on the way in, so it is on the way back too.
    expect(currentUrl(router).searchParams.get("purpose")).toBe("service");

    router.history.back();
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms");
    });
    expect(screen.queryByRole("region", { name: "Create VM" })).toBeNull();
    expect(currentUrl(router).searchParams.get("purpose")).toBe("service");
    expect(await vmsTable()).toBeDefined();
  });

  it("comes back to the Site's own list, not the Fleet's", async () => {
    /**
     * A create is an estate-wide act, so a Site's list sends the operator to the
     * Fleet form -- and the way out of it has to be the Site they were working
     * in. The link records which list it was opened from, and the form's way back
     * is built from that rather than from an assumption about which list that was.
     */
    const { router } = await renderConsole("/site/accra-lab/vms?purpose=workload");
    await vmsTable();

    const create = screen.getByRole("link", { name: "Create VM" });
    const href = new URL(create.getAttribute("href") ?? "", "http://console.test");
    expect(href.pathname).toBe("/fleet/vms/new");
    expect(href.searchParams.get("from")).toBe("/site/accra-lab/vms");
    expect(href.searchParams.get("purpose")).toBe("workload");

    fireEvent.click(create);
    const page = await screen.findByRole("region", { name: "Create VM" });
    const back = new URL(crumb(page).getAttribute("href") ?? "", "http://console.test");
    expect(back.pathname).toBe("/site/accra-lab/vms");
    expect(back.searchParams.get("purpose")).toBe("workload");

    fireEvent.click(within(page).getByRole("link", { name: "Cancel" }));
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/site/accra-lab/vms");
    });
    expect(await vmsTable()).toBeDefined();
  });

  it("works deep-linked, with nothing but the form, and has somewhere to go back to", async () => {
    const { router } = await renderConsole("/fleet/vms/new?estate=compact");

    // No navigation, no prior list, no filter to inherit: the form is on its own
    // and is still a form. A cold address is how an operator shares one.
    const form = formPage("Create VM");
    const backHref = new URL(crumb(form).getAttribute("href") ?? "", "http://console.test");
    expect(backHref.pathname).toBe("/fleet/vms");
    // Even the mock backend's own controls ride out with the form, so a create
    // that went wrong against one estate can be retried against it (R56).
    expect(backHref.searchParams.get("estate")).toBe("compact");

    // And the Nodes to create on came from the estate named in the URL, which is
    // the whole reason the controls inherit it: the compact estate's three
    // machines, not the fleet's nineteen.
    await screen.findByRole("option", { name: /^accra-desk-01/ });
    expect(screen.queryByRole("option", { name: /^accra-server-02/ })).toBeNull();

    // Leave, and the way back is a real list rather than a dead end.
    fireEvent.click(within(form).getByRole("link", { name: "Cancel" }));
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms");
    });
    expect(await vmsTable()).toBeDefined();
  });
});

describe("a create the control plane refuses", () => {
  it("puts each detail on the control that caused it, names the constraint, and keeps the form", async () => {
    const { router } = await renderConsole("/fleet/vms/new");

    // Three constraint violations, produced by typing -- which is the point: the
    // failure is reachable by a value the operator controls, so it is reproducible
    // in the dev server and not only here.
    await fillCreateForm({
      node: "accra-server-02",
      name: "Web-07",
      purpose: "workload",
      cores: "0",
      memoryMib: "128",
    });
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("invalid_request");
    expect(alert.textContent).toMatch(/requestId\s*req_/);

    // Each on its own control, with the constraint the control plane named. The
    // constraint is a code, and it is the same code an operator would find in the
    // audit log under that requestId.
    const name = screen.getByLabelText(/^Name/);
    const cores = screen.getByLabelText(/^Cores/);
    const memory = screen.getByLabelText(/^Memory/);
    for (const control of [name, cores, memory]) {
      expect(control.getAttribute("aria-invalid")).toBe("true");
    }
    expect(describedBy(name)).toContain("pattern");
    expect(describedBy(name)).toContain("A name is a DNS label");
    expect(describedBy(cores)).toContain("atLeast1");
    expect(describedBy(cores)).toContain("at least one core");
    expect(describedBy(memory)).toContain("atLeast536870912");
    expect(describedBy(memory)).toContain("512 MiB");

    // The detail sits on the control, not only in a banner: a summary that names
    // the fields is not the same thing as a form that marks them, and only one of
    // the two survives a keyboard.
    const nameProblem = document.querySelector('[data-field-error="name"]');
    expect(nameProblem?.getAttribute("data-constraint")).toBe("pattern");

    // And the focus went to the first of them in reading order, which on a full
    // page is the difference between correcting a field and reading the page
    // looking for the one that was refused.
    expect(document.activeElement).toBe(name);

    // Nothing was lost. Eight fields, one wrong name and two impossible numbers.
    expect((name as HTMLInputElement).value).toBe("Web-07");
    expect((cores as HTMLInputElement).value).toBe("0");
    expect((memory as HTMLInputElement).value).toBe("128");
    expect(nodePicker().value).toBe("accra-server-02");
    expect(formPage("Create VM")).toBeDefined();

    // And nothing was claimed about the outcome.
    expect(currentUrl(router).pathname).toBe("/fleet/vms/new");
    expect(toasts()).toContain("invalid_request");
  });

  it("puts a name the estate already uses on the name field, as a conflict", async () => {
    await renderConsole("/fleet/vms/new");
    await fillCreateForm({ node: "accra-server-02", name: "postgres-main" });
    submit();

    // A 409 is a different thing from a 400: the request was well formed and the
    // estate already holds the name. It is still one field's problem.
    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("conflict");
    expect(describedBy(screen.getByLabelText(/^Name/))).toContain("nameTaken");
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("postgres-main");
  });

  it("reports a Node the estate does not have on the Node field", async () => {
    await renderConsole("/fleet/vms/new");
    await fillCreateForm({ name: "web-07" });
    // A picker cannot offer a Node that is not in the estate, so the only way to
    // reach a refusal on this field is to send a request naming one that is not
    // there. The field still has to be the one that carries the detail -- a page
    // that reported a 404 as a banner would leave the operator looking for a
    // control that is right there.
    fireEvent.change(nodePicker(), { target: { value: "kumasi-rig-09" } });
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(describedBy(nodePicker())).toContain("notFound");
    expect(toasts()).toContain("not_found");
    // And the form is still filled in, including the eight fields the request
    // never had anything to say about.
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("web-07");
  });
});

describe("a create the control plane accepts", () => {
  it("answers 202 with a Task, sends the operator to it, and claims nothing else", async () => {
    const { router } = await renderConsole("/fleet/vms/new");
    await fillCreateForm({
      node: "accra-server-02",
      name: "web-07",
      purpose: "workload",
      cores: "2",
      memoryMib: "2048",
    });
    submit();

    // R44: the observed facts and nothing else. `claimsCompletion` is the
    // console's own rule -- a past-tense completion claim in a toast title is
    // exactly what R44 forbids, and the mock's Task is `queued`, so "created"
    // would be a lie about four minutes of work nobody has watched.
    await waitFor(() => {
      expect(toasts()).toContain("Creating web-07");
    });
    const title = screen.getByText("Creating web-07");
    expect(claimsCompletion(title.textContent ?? "")).toBe(false);
    expect(toasts()).toContain("202 · vm_create · queued · tk_pending-vm_create-web-07");
    expect(toasts()).not.toContain("created");
    expect(toasts()).not.toContain("succeeded");

    // And the operator lands on that Task's own progress, not back on a form.
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/tasks/tk_pending-vm_create-web-07");
    });

    // The destination is a real Task, not a dead end. This used to assert a
    // `not_found`: the mock minted a Task id it did not hold, so a create landed
    // the operator on a 404 at the exact moment they most wanted to watch
    // something. R49 makes the streamed log the only progress channel a bare VM
    // will ever have, and a 404 is the absence of one.
    // The Task is named, its kind and its target, and its state -- queued, because
    // that is what the control plane said. A page that rendered anything stronger
    // would be claiming a future nobody observed.
    expect(await screen.findByRole("heading", { name: "vm_create-web-07" })).toBeDefined();
    expect(screen.getAllByText("queued").length).toBeGreaterThan(0);
    expect(screen.getAllByText("vm_create").length).toBeGreaterThan(0);
    expect(screen.getAllByText("web-07").length).toBeGreaterThan(0);

    // And there is **no outcome strip at all**, because an outcome has not been
    // observed. The tasks screen renders one only when a `result` event or a
    // terminal state has actually arrived; an empty strip would be a claim.
    expect(document.querySelector("[data-outcome]")).toBeNull();
    expect(screen.queryByText(/This Task succeeded/)).toBeNull();
    expect(screen.queryByText(/This Task failed/)).toBeNull();
  });

  it("does not put a VM on the list that the create Task has not finished creating", async () => {
    // The document's own default page, not a page of every VM: this test is about
    // what the list *does not* have, and a bigger table would only make every
    // query over it more expensive for no extra claim.
    const { router } = await renderConsole("/fleet/vms");
    const before = rowsOf(await vmsTable()).length;

    fireEvent.click(screen.getByRole("link", { name: "Create VM" }));
    await screen.findByRole("region", { name: "Create VM" });
    await fillCreateForm({ node: "accra-server-02", name: "web-07" });
    submit();
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/tasks/tk_pending-vm_create-web-07");
    });

    // Back to the estate's own answer about the estate.
    await router.navigate({ to: "/fleet/vms" });
    const grid = await vmsTable();

    // As many rows as before, and nothing called `web-07`. A row added at request
    // time would be a VM the control plane has not created, on a list whose whole
    // job is to say what the control plane believes (R51).
    expect(rowsOf(grid)).toHaveLength(before);
    expect(hasRow(grid, "web-07")).toBe(false);
  });
});

describe("the edit page", () => {
  it("shows the VM's own values, and refuses the save in the contract's code", async () => {
    await renderConsole("/fleet/vms/postgres-main/edit");

    const form = await screen.findByRole("region", { name: "Edit postgres-main" });

    // The values are the control plane's, on the controls the create page uses --
    // which is what a form archetype is for. They are disabled because the
    // console has no save wired to a VM's change, and a form that accepts typing
    // it then throws away is a form that lies twice.
    expect((within(form).getByLabelText(/^Name/) as HTMLInputElement).value).toBe("postgres-main");
    expect((within(form).getByLabelText(/^Node/) as HTMLInputElement).value).toBe(
      "accra-server-02",
    );
    expect((within(form).getByLabelText(/^Purpose/) as HTMLSelectElement).value).toBe("service");
    expect((within(form).getByLabelText(/^Cores/) as HTMLInputElement).value).toBe("8");
    expect((within(form).getByLabelText(/^Memory/) as HTMLInputElement).value).toBe("32768");
    for (const control of [
      ...within(form).getAllByRole("textbox"),
      ...within(form).getAllByRole("spinbutton"),
      ...within(form).getAllByRole("combobox"),
    ]) {
      expect(control).toHaveProperty("disabled", true);
    }

    // R43: the save is rendered, greyed, and labelled with the sovren code.
    const save = within(form).getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(within(form).getByText("action_not_permitted")).toBeDefined();
    expect(
      document.getElementById(save.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toContain("no operation that updates a VM");
  });

  it("spends the width beside the fields on the VM itself", async () => {
    await renderConsole("/fleet/vms/postgres-main/edit");
    const form = await screen.findByRole("region", { name: "Edit postgres-main" });

    // A drawer had no room for this. A page does, and the right thing to put in
    // it is the resource the fields are a description of: R40's identity triple,
    // in the same order as every detail page, and the facts no field shows.
    const aside = within(form).getByRole("complementary", { name: "About postgres-main" });
    const identity = aside.querySelector("[data-identity='true']");
    expect(identity?.textContent).toContain("vm_01hq2v0006");
    expect(identity?.textContent).toContain("Created");
    expect(identity?.textContent).toContain("Updated");

    const facts = within(aside).getByRole("table", { name: "postgres-main facts" });
    expect(facts.textContent).toContain("100.64.0.47");
    expect(facts.textContent).toContain("running");
  });

  it("takes the operator from the row to the page and back with their list intact", async () => {
    // Two purposes at once again, because a row's edit link is the other door into
    // a form and it has to carry the same view the create link does.
    const { router } = await renderConsole(
      "/fleet/vms?purpose=infrastructure&purpose=service&sort=-name",
    );
    const grid = await vmsTable();
    const listed = rowsOf(grid).length;
    const row = rowNamed(grid, "postgres-main");

    const edit = within(row).getByRole("link", { name: "Edit" });
    const editHref = new URL(edit.getAttribute("href") ?? "", "http://console.test");
    expect(editHref.pathname).toBe("/fleet/vms/postgres-main/edit");
    expect(editHref.searchParams.getAll("purpose")).toEqual(["infrastructure", "service"]);
    expect(editHref.searchParams.get("sort")).toBe("-name");

    fireEvent.click(edit);
    const form = await screen.findByRole("region", { name: "Edit postgres-main" });
    expect(currentUrl(router).pathname).toBe("/fleet/vms/postgres-main/edit");
    expect(currentUrl(router).searchParams.get("sort")).toBe("-name");

    // The list did not stay mounted to make room: R39 says a form is a page of
    // its own, so the operator's place is carried in the address rather than
    // retained in a component. Asserted by the rows a list renders, since this
    // page has a properties table of its own beside the fields.
    expect(document.querySelector("main [data-row]")).toBeNull();

    // And the way out is the list as they left it -- the breadcrumb, which is an
    // address a colleague could be sent as well as a link, and Cancel, which is
    // the same href.
    const backHref = new URL(crumb(form).getAttribute("href") ?? "", "http://console.test");
    expect(backHref.pathname).toBe("/fleet/vms");
    expect(backHref.searchParams.getAll("purpose")).toEqual(["infrastructure", "service"]);
    expect(backHref.searchParams.get("sort")).toBe("-name");
    expect(within(form).getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe(
      crumb(form).getAttribute("href"),
    );

    fireEvent.click(within(form).getByRole("link", { name: "Cancel" }));
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms");
    });
    expect(currentUrl(router).searchParams.getAll("purpose")).toEqual([
      "infrastructure",
      "service",
    ]);
    expect(currentUrl(router).searchParams.get("sort")).toBe("-name");

    // The same view, rebuilt from the address: the filtered, sorted list is
    // rendered again rather than remembered. The row count is the assertion that
    // matters -- a link that had dropped one of the two purposes would come back
    // to a *different, wider* list that still contains this VM, so looking for the
    // VM by name would not notice.
    const after = await vmsTable();
    await waitFor(() => {
      expect(rowsOf(after)).toHaveLength(listed);
    });
    expect(
      rowNamed(after, "postgres-main").querySelector('[data-column="node"]')?.textContent,
    ).toBe("accra-server-02");
  });

  it("says a VM nothing answers to is not there, and keeps the way back", async () => {
    const { router } = await renderConsole("/fleet/vms/no-such-vm/edit");

    // A deep link to a VM that does not exist is a page that cannot be filled in,
    // and it is still a page with a way out -- not an error screen that threw away
    // the breadcrumb.
    const form = await screen.findByRole("region", { name: "Edit VM" });
    const alert = await within(form).findByRole("alert");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(crumb(form).getAttribute("href")).toBe("/fleet/vms");

    fireEvent.click(within(form).getByRole("link", { name: "Cancel" }));
    await waitFor(() => {
      expect(currentUrl(router).pathname).toBe("/fleet/vms");
    });
  });
});

it("asks before destroying, and the confirmation names the VM", async () => {
  await renderConsole("/fleet/vms/postgres-main/edit");
  const form = await screen.findByRole("region", { name: "Edit postgres-main" });

  fireEvent.click(within(form).getByRole("button", { name: "Delete VM" }));

  // R53. The confirmation names the resource, and it is the resource an operator
  // would recognise rather than an id -- and it says that what is being asked
  // for is a Task, which is the thing that will actually happen. The 202 the
  // teardown answers with is asserted in the archetype's own test, because the
  // mock backend deliberately does not serve `VMDelete` and a test cannot add a
  // handler of its own.
  const confirm = await screen.findByRole("dialog", { name: "Delete this VM" });
  expect(within(confirm).getByText("postgres-main")).toBeDefined();
  expect(confirm.textContent).toContain("Task");
  expect(within(confirm).getByRole("button", { name: "Delete it" })).toBeDefined();
  expect(within(confirm).getByRole("button", { name: "Cancel" })).toBeDefined();
  // And nothing generic: no "are you sure", which is answered by muscle memory.
  expect(confirm.textContent).not.toMatch(/are you sure/i);

  // Cancelling asks nothing of the control plane and says nothing about it.
  fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Delete this VM" })).toBeNull();
  });
  expect(toasts()).toBe("");
});
