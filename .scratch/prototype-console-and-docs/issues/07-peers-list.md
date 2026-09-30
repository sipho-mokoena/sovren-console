# 07: Peers list — who is on the overlay

**What to build:** The operator sees every enrolled machine on the overlay in one table — name, address, operating system, groups, and when it was last seen — so a peer that dropped off is obvious at a glance rather than discovered when something stops resolving. A stale peer and a live peer are distinguishable without opening anything.

Serves R22, R23, R38, R41, R45, R46, R58. `Peer`, `Group`, and `Policy` are NetBird's nouns adopted verbatim.

**Blocked by:** 05 — Fleet → Nodes list, the list archetype complete. 06 — Three scopes, and Settings where the connections live.

**Status:** ready-for-agent

- [ ] The Peers list shows name, overlay address, OS, groups, and last-seen per row.
- [ ] A peer not seen recently is visually distinguishable from a live one without opening a detail page.
- [ ] Groups are rendered in NetBird's own vocabulary, not a sovren synonym.
- [ ] The list is sortable and filterable by group and by staleness, and the filter state lives in the URL.
- [ ] Pagination, refresh, and last-updated behave exactly as on the Nodes list, from the same archetype.
- [ ] `Peer` operations are added to the document, and regenerating produces this list with no hand-written client code.
- [ ] A browser test asserts the list renders seeded peers and that the staleness filter narrows it.
