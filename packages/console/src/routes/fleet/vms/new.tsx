import { createFileRoute } from "@tanstack/react-router";

import { VmCreateForm } from "./-vm-create-form";

/**
 * Fleet → VMs → create.
 *
 * A page of its own, which is what R39 asks for and what makes it an address an
 * operator can paste into a chat, bookmark, and come back to with the back
 * button. It was already a route; what it was *not* was a page, because a layout
 * route above it kept a list mounted behind it and the form rendered as a panel
 * over that list. That layout is gone.
 *
 * So the list's state is carried in this route's own search rather than held by a
 * still-mounted list, and the form's way out is that same search pointed at the
 * list (`-vm-paths.ts`). Three ways out exist and all three agree: the browser's
 * back button, because the operator arrived here on a link that carried their
 * view; the breadcrumb; and Cancel, which is the breadcrumb's href again.
 *
 * Deep-linked cold, with no list behind it, this is still the form and the way
 * out is a real list rather than a dead end.
 */
export const Route = createFileRoute("/fleet/vms/new")({
  component: FleetVmCreate,
});

function FleetVmCreate() {
  return <VmCreateForm />;
}
