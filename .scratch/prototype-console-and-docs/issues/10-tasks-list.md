# 10: Tasks list — find the run that stuck

**What to build:** The operator can find a run from last week. A Tasks table shows what kind of work it was, what it targeted, what state it reached, and when it started — so a stuck run is found by scanning rather than by remembering. A task that failed is visibly failed, with its reason, not merely absent.

Serves R46, R48, R50, R51. `Task` is sovren's own noun: the unit of asynchronous work.

**Blocked by:** 05 — Fleet → Nodes list, the list archetype complete. 06 — Three scopes, and Settings where the connections live.

**Status:** ready-for-agent

- [ ] The Tasks list shows kind, target, state, and start time per row.
- [ ] States are the fixed task vocabulary — queued, running, succeeded, failed, cancelled — and a failed task is visibly distinct from one that never ran.
- [ ] The list is filterable by state and by kind, and the filter state lives in the URL.
- [ ] A task that ended in failure shows its failure reason in the row, not only on the detail page.
- [ ] A cancelled task is distinguishable from a failed one, because they mean different things to an operator.
- [ ] Task state is held in the mock backend's store rather than in component state, so it outlives a reload; a test asserts it.
- [ ] A task running on a target that has since been removed is still findable, rather than becoming unreachable.
- [ ] A browser test asserts the list renders seeded tasks and that the state filter narrows it.
