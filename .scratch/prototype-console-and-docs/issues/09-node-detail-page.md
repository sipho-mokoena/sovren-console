# 09: Node detail — what one machine is responsible for

**What to build:** The operator opens a node and stays there: overview, drives, the VMs it hosts, and the peers that live on it, on tabs. Every detail page in sovren opens with the same ID/created/updated block, so anything on the page can be referenced and audited, and `Drive` is used for the physical disks so `Disk` never becomes ambiguous.

Serves R24, R38, R40, R47, R48. A `Node` is a physical machine; heterogeneity is the normal case, not an edge case.

**Blocked by:** 08 — VMs list, one row per machine, joined to its node.

**Status:** ready-for-agent

- [ ] The node detail page has overview, drives, VMs, and peers tabs, and the tab is in the URL so it is linkable.
- [ ] The page opens with an ID, created, and updated block, and that block is identical on every detail page.
- [ ] Physical disks are `Drive` and VM storage is `Disk` in the API, the page, and the tests — never the reverse.
- [ ] Key/value content renders as a properties table, the fixed form for every detail page.
- [ ] The VMs and peers tabs show the same machines as the corresponding lists filtered to this node, and the two never disagree.
- [ ] A breadcrumb returns to the list with the operator's filters, sort, and page intact.
- [ ] A heterogeneous node reports what it actually has — differing CPU models, missing features — rather than being normalised into a fiction.
- [ ] The page is reachable by name as well as by id.
