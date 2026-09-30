# 05: Fleet → Nodes list, the list archetype complete

**What to build:** The operator opens the console and sees the estate at a glance: one dense table of physical machines with name, CPU, cores, memory, drives, and overlay status, so a degraded PC is obvious. Every list page in sovren has this shape — header, refresh with a last-updated stamp, create action, table, pagination bar — so the console is learned once. Pagination is server-side on an opaque token, so a page stays correct when the underlying list changes underneath it, and the state lives in the URL so a filtered view is linkable and the back button works.

Serves R33, R38, R40, R41, R42, R45, R46, R55. `Node` is Proxmox's noun adopted verbatim; `Drive` keeps `Disk` unambiguous for VM storage.

**Blocked by:** 03 — One estate description seeds every mock. 04 — Every error speaks sovren, and every error is reproducible.

**Status:** ready-for-agent

- [ ] The Nodes list shows name, CPU, cores, memory, drive count and capacity, and overlay status per row, and an operator can spot a machine with no overlay address.
- [ ] The page has the fixed archetype — header, refresh control with last-updated, create action, table, pagination bar — and that archetype is a reusable page rather than a one-off.
- [ ] Row heights are fixed, the identity column and the action column are sticky, and the table is dense enough to see a whole lab at once.
- [ ] Pagination is server-side, driven by an opaque token; a page remains correct when the underlying list changes, and the token is never an offset.
- [ ] Filters, sort, and page state live in the URL; the view is linkable, reloadable, and the back button returns to the previous view.
- [ ] The last-updated stamp distinguishes a stale view from a broken one, and a failed refresh is never presented as fresh.
- [ ] A browser test runs against the generated mock backend and asserts the table renders seeded rows.
- [ ] The list renders from the generated react-query hook and the generated types, with no hand-written client call in the component.
