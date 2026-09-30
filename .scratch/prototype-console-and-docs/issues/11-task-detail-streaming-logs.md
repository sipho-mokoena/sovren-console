# 11: Task detail — watch the work happen

**What to build:** The operator navigates to a task and watches it run, without leaving the console. Logs stream while the task is in flight, the state advances visibly, a failure names its reason, and a mistake can be cancelled in seconds rather than waited out in minutes. This is the capability none of the three upstream APIs offer — all three expose logs only by polling — and it is the only progress signal a bare VM will ever have.

Serves R31, R32, R35, R46, R49, R50, R51, R54.

**Blocked by:** 10 — Tasks list, find the run that stuck. 04 — Every error speaks sovren, and every error is reproducible.

**Status:** ready-for-agent

- [ ] The task detail page streams log lines while the task runs, appending without a manual refresh and surviving a dropped connection.
- [ ] The transport is server-sent events end to end, including through the mock backend, not a polling loop dressed as streaming.
- [ ] A running task offers a cancel action that stops the stream and records a cancelled state, visibly distinct from failure.
- [ ] A failed task shows its terminal state and a failure reason that names what failed, not merely that something did.
- [ ] The console never claims completion it has not observed: a task is called succeeded only once the terminal state is actually received.
- [ ] The log view distinguishes a `log` line from a `step` and a `result`, and renders a step transition visibly.
- [ ] A test asserts the log stream handles a malformed line, a reconnect, and a cancel without losing or duplicating earlier lines.
- [ ] Opening a finished task replays its whole log from the beginning, not just the tail.
