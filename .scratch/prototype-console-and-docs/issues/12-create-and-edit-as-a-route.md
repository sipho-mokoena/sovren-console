# 12: Create and edit as a route you can link to

**What to build:** Creating a VM is a form in a side panel over the list the operator was already reading, so they do not lose their place — and it has its own route, so it can be linked to, bookmarked, and returned to with the back button. Submitting a create returns immediately with a task, and the operator lands on that task's progress, because a four-minute boot cannot complete inside a request. Nothing the console asserts about the outcome is asserted before the task says so.

Serves R31, R39, R44, R49, R50, R51, R52, R53.

**Blocked by:** 09 — Node detail, what one machine is responsible for. 11 — Task detail, watch the work happen.

**Status:** ready-for-agent

- [ ] Create and edit are their own routes, linkable and reachable by the back button, and open as a side panel over the still-mounted list.
- [ ] The list behind the panel keeps its filters, sort, and page; closing the panel returns to exactly where the operator was.
- [ ] Creating a VM returns immediately with a task, and the operator is navigated to that task's progress.
- [ ] The VM shows its transitional state while the create task runs and is not reported as created before the task says so.
- [ ] Validation errors are shown on the field that caused them, name the constraint, and the form does not lose what was typed.
- [ ] A destructive action sits behind a confirmation that names the resource being destroyed, not a generic "are you sure".
- [ ] Success and failure toasts are in the present tense and assert only what has been observed.
- [ ] A create form deep-linked directly, with no list behind it, still works and can still return somewhere sensible.
