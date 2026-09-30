import { createFileRoute } from "@tanstack/react-router";

import { VmDetail } from "@/routes/fleet/vms/-vm-detail";

/**
 * Fleet → VMs → one VM.
 *
 * The route is the ref and nothing else. `VMView` accepts a name or an id (R32),
 * and so does every list this page makes, so the console has no opinion about
 * which one the operator has and never has to redirect between them.
 *
 * It sits under `/fleet/vms` rather than beside it, which is where the router
 * puts every child of that layout -- and that layout renders the VMs list and an
 * `Outlet`. So the detail page opens *over* a list that is still mounted, the
 * same arrangement the edit form uses, and the list's filters, sort and page are
 * still in the URL when the operator arrives. That is why the breadcrumb on this
 * page can hand them back the view they left.
 */
export const Route = createFileRoute("/fleet/vms/$vm/")({
  component: FleetVm,
});

function FleetVm() {
  const { vm } = Route.useParams();
  return <VmDetail vm={vm} />;
}
