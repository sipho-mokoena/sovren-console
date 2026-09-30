import { createFileRoute } from "@tanstack/react-router";

import { TaskDetail } from "./-task-detail";

/**
 * Fleet → Tasks → one Task.
 *
 * The ref in the path goes to the generated hook untouched. A `Task` is the one
 * deliberate exception to name-or-id in the whole contract: it is never renamed,
 * its `name` is a label like `create web-01` rather than a key, and so the path
 * accepts an id or the `id:target` form an operator would remember instead. The
 * console does not second-guess which one arrived.
 */
export const Route = createFileRoute("/fleet/tasks/$task")({
  component: FleetTask,
});

function FleetTask() {
  const { task } = Route.useParams();
  return <TaskDetail task={task} />;
}
