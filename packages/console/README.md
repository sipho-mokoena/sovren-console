# @sovren/console

The operator's console. Three scopes, three screen archetypes, and a dense table
that is the same table on every list page.

Everything it renders comes from the mock backend. There is no control plane and
no Proxmox, NetBird or Dokploy anywhere in this prototype, so a screen that works
against this works against a document — and a screen that does not was never
working.

```sh
pnpm run dev      # the console, against the mock backend
pnpm run build    # the production build
pnpm run test     # the browser tests (see "Testing" below for why they are separate)
```

---

## The list archetype

**`ListPage` from `@/components/sovren/list-page` is the deliverable of the Nodes
list, not the Nodes list.** Peers, VMs and Tasks are the same component with a
different column set, and three lists that each grew their own refresh, pagination
and error handling would be three consoles.

A screen supplies five things and nothing else:

```tsx
const list = useListState({ key: "fleet/vms", owned: OWNED, sortable: SORTABLE });
const query = useVMList({ page: list.token ?? undefined, size: list.size });

<ListPage<VM>
  title="VMs"
  icon={HardDrive}
  description="Every guest, and the Node that hosts it."
  query={query}                     // the generated hook's result, untouched
  list={list}                       // the URL state
  columns={vmColumns}               // the column set
  rowKey={(vm) => vm.id}
  rowHref={(vm) => `/fleet/vms/${vm.name}`}
  rowActions={(vm) => <DisabledActionButton action="migrate" refusal={…} />}
  create={<CreateVMButton />}
  empty={{ title: "No VM in this estate" }}
/>
```

| Prop           | What it is                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `title`        | The screen's noun, in the contract's words.                                                                                          |
| `icon`         | A lucide icon, the same one the sidebar uses for this list.                                                                          |
| `description`  | One line: what this list answers.                                                                                                    |
| `query`        | The generated react-query hook's result. `data` is the response union, `status`-narrowed inside the archetype. Nothing hand-written. |
| `list`         | `useListState({ key, owned, sortable })` — filters, sort, page token, all in the URL.                                                |
| `columns`      | `readonly ListColumn<TRow>[]` — see below.                                                                                           |
| `rowKey`       | The row's stable key from the contract. Never the array index.                                                                       |
| `rowHref`      | Optional. Where the identity cell links.                                                                                             |
| `rowActions`   | Optional. The sticky right-hand column.                                                                                              |
| `create`       | Optional. The header's create action.                                                                                                |
| `filters`      | Optional. Controls beside the refresh control.                                                                                       |
| `empty`        | `{ title, body?, action? }` — the screen's own words, and the way out.                                                               |
| `banner`       | Optional. Anything above the table.                                                                                                  |
| `actionsWidth` | Optional. The width of the sticky action column, in pixels.                                                                          |

### A column set

```ts
interface ListColumn<TRow> {
  key: string; // stable, and the sort key in the URL
  header: string; // the noun, in the contract's words
  width: number; // REQUIRED, in pixels — this is what keeps rows aligned
  align?: "start" | "end";
  identity?: boolean; // exactly one per set; pinned left
  sortable?: boolean; // requires sortValue
  sortValue?: (row: TRow) => string | number;
  numeric?: boolean; // right-aligned, tabular figures
  className?: string;
  render: (row: TRow) => ReactNode;
}
```

Two rules the archetype warns about in development rather than enforcing: exactly
one `identity` column, and no `sortable` column without a `sortValue`.

### What the archetype owns, so no two lists differ

Header with icon and title · refresh with a last-updated stamp · the estate and
sentinel pickers · the create action · the table (fixed `h-8` rows, sticky identity
column, sticky action column, sortable headers) · the pagination bar · the four
states: **pending** (skeleton rows), **error** (code, message, `requestId`, and
something to do), **empty**, and **stale** (rows kept, the stamp keeps the time of
the last _good_ answer, the failure stated as a failure).

### Sorting is client-side, and that is the contract's fault

No list operation declares a sort parameter, so there is nothing to send. The
archetype reorders the page it was given, and says so in the header's title. A
screen that needs server-side ordering needs a change to `openapi/sovren.json` and
a regeneration — not a workaround here.

### Pagination is an opaque token, both ways

`nextPage` goes in the URL as `?page=`, and the archetype asks the generated hook
for it. "Back" walks a token stack in `sessionStorage`, keyed by the list and its
filters, because an opaque token cannot be inverted — the console cannot ask for
page 40 and cannot work out which page it is on after a deep link. The bar
therefore says "19 rows on this page", never "page 3 of 7".

---

## Scopes

`src/nav/scopes.ts` is the only place a scope's navigation is written down. Three
scopes, each with its own sidebar, each a path:

- `/fleet/…` — the whole estate. "Is anything broken."
- `/site` and `/site/$site/…` — one physical lab. **A Site is a latency and failure
  boundary, not a tenancy and not a security one** (R28), and the sidebar says so.
- `/settings/…` — the integrations and the credentials, outside the fleet view.

**Adding a scope entry is one line.** Add a `NavEntry` to the scope's `entries`
and create the route file under that scope's directory:

```ts
ready("VMs", "vms", HardDrive, "Every guest, joined to the Node that hosts it."),
```

`ready` renders a link; `planned(…, ticket)` renders the entry greyed out with the
ticket that owns it, which is the same treatment a disabled action gets. The VMs,
Peers, Tasks and Audit-log entries are already declared and waiting.

`ConsoleShell` rebuilds the sidebar from the registry on every navigation, so a
scope switch cannot leave a stale link behind. The top bar's scope switcher keeps
the current Site when you leave it and come back, and every link is an ordinary
navigation, so the browser's history holds your place in the scope you left.

---

## Two controls that are not features

The mock backend reads two values out of the URL — `?estate=` and `?sentinel=` —
and the console carries them from its own address bar into every API request
(`src/lib/mock-backend.ts`). So a failure path is reproducible by editing a URL,
in the dev server and in a test, from one mechanism (R56).

The pickers sit in every list's refresh control, and **`d` cycles the sentinels**
on any list. `Settings → Console` lists all ten with what each one yields, and has
a box for typing one that this build does not know — which answers with an
`invalid_request` naming the valid ones, so a mistyped reproduction never looks
like the bug silently not happening.

---

## Reading a response

The generated client never throws (R35). A failure is a resolved value, and the
one place a list or a detail screen narrows it is `readList` / `readOne` in
`@/lib/sovren`:

```ts
const read = readList<VM>(query.data);
if (read.kind === "error") return <ErrorState error={read.error} onRetry={…} />;
// read.page.items, read.page.nextPage
```

The narrow is on `status`, which is the contract's own discriminant — **not** on
the shape of the body. `ConnectionTestResult` carries a `code` and a `requestId`
too, so a console that told a failed connection test apart by its body would
report "the test did not run" for a test that ran and came back `ok: false`.

---

## A credential is never returned

`Connection.credentials[]` carries `held`, `heldSince` and `lastRotatedAt`, and
there is no field for the value. Settings says which credential is held and when
it last changed, and cannot say more, because the document gives it nothing to
say. The Proxmox row renders **both** of its requirements with the requirement's
own label, from `requirements[]`, so it never presents itself as a
single-credential integration; the detail page renders each requirement's `why`.

---

## Testing

The browser tests are `src/tests/*.browser.tsx` and run with:

```sh
pnpm run test    # or: vp run test, from this directory
```

**They are not collected by `vp test` at the repository root, and that is a known
seam rather than a preference.** The root `vp test` is a single node-environment
project over the whole workspace: it ignores per-package Vite configs, so it would
collect these files and then fail to give them a DOM or the `@/` alias — a failure
that says nothing about the console. The fix belongs in the root `vite.config.ts`,
which is not this package's: a `test.projects` entry for `packages/console`, after
which the `.browser` naming and the `include` in `vitest.config.ts` can go.

`src/test/render-console.tsx` renders the whole route tree on the browser's own
history, which is what makes "the back button returns to the previous view"
assertable. `src/test/setup.ts` starts the mock backend with the same wrapped
handlers the browser worker gets, so a test and the dev server take the identical
path from the identical URL.

Tests use `@testing-library/react` directly (`fireEvent`); no `user-event`
dependency was added, because the lockfile is shared and a new dependency is not a
decision one package should make on its own.
