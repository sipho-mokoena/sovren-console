# 08: VMs list — one row per machine, joined to its node

**What to build:** The operator sees every VM in the estate with the thing that previously took hand-correlating: its node, its overlay address, its CPU model, its memory, and its run state on one row. A VM whose create task is still running reads as in flight rather than broken, and a VM that failed reads as failed rather than stopped, so a failure is never mistaken for intent.

Serves R2, R13, R27, R38, R41, R42, R51, R63, R64. `VM` carries a `purpose` of `infrastructure`, `service`, or `workload`.

**Blocked by:** 05 — Fleet → Nodes list, the list archetype complete. 06 — Three scopes, and Settings where the connections live.

**Status:** ready-for-agent

- [ ] The VMs list shows name, node, overlay address, CPU model, memory, and run state on one row, with no manual join.
- [ ] A VM whose create task is running shows a transitional state, visibly distinct from both running and stopped.
- [ ] A VM whose task failed shows an explicit failed state, distinct from stopped, and names the reason.
- [ ] The CPU model shown is the fleet's floor, and a VM is not offered a migration action that its CPU model cannot support.
- [ ] The list is sortable by node, run state, and purpose, and the filter state lives in the URL.
- [ ] Pagination, refresh, and last-updated behave exactly as on the Nodes list.
- [ ] A VM with no overlay address yet is visibly without one rather than rendering as an empty healthy cell.
- [ ] `purpose` is rendered and filterable, so a Service host is distinguishable from a machine being experimented on.
- [ ] `VM` operations are added to the document, and regenerating produces this list with no hand-written client code.
