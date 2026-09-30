import { createFileRoute } from "@tanstack/react-router";

import { TasksList } from "./-tasks-list";

/**
 * Fleet → Tasks.
 *
 * The route is three lines: the screen. Everything the screen needs comes from
 * the archetype, and everything the archetype needs comes from the generated hook
 * and the URL -- including the two filters, which are in the query string so the
 * view is a link an operator can hand to a colleague.
 *
 * The screen and the log stream live beside this file rather than in
 * `src/screens/`, under the `-` prefix the router's own generator skips. Nothing
 * in this directory is a route except this file and `$task.tsx`.
 */
export const Route = createFileRoute("/fleet/tasks/")({
  component: FleetTasks,
});

function FleetTasks() {
  return <TasksList />;
}
