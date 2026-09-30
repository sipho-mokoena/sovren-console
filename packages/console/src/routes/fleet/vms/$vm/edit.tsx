import { createFileRoute } from "@tanstack/react-router";

import { VmEditForm } from "../-vm-edit-form";

/**
 * Fleet → VMs → one VM → edit.
 *
 * A page of its own, for the same reason the create form is one: R39, and the
 * fact that an operator can link to a colleague's form or reach it with the back
 * button. Its search carries the list the operator was reading, and the form's
 * breadcrumb and Cancel are that address reversed -- see `-vm-paths.ts` for the
 * one place that is written down.
 *
 * The ref accepts a name or an id, because every path parameter in the contract
 * does (R32) and this one is no exception -- a row's edit link carries the name a
 * human would type, and a shared link with an id works just as well.
 */
export const Route = createFileRoute("/fleet/vms/$vm/edit")({
  component: FleetVmEdit,
});

function FleetVmEdit() {
  const { vm } = Route.useParams();
  return <VmEditForm vm={vm} />;
}
