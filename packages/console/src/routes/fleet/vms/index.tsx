import { createFileRoute } from "@tanstack/react-router";

import { VmsList } from "./-list";

/**
 * Fleet → VMs: the list, on its own route.
 *
 * There used to be a layout route here that rendered the list *and* an `Outlet`
 * the form routes rendered into, and the form was a panel over the still-mounted
 * list. R39 now says a form is a page of its own, and a page has no use for the
 * list behind it -- so the layout is gone, and this route is the list.
 *
 * What replaced "still mounted" is `-vm-paths.ts`: the list's own search is
 * carried onto the link that opens a form, and the form's breadcrumb and Cancel
 * point back at this route with those parameters. So the operator's place is
 * still kept, but it is kept in the address rather than in a mounted component.
 *
 * The Site scope renders the same list from its own route
 * (`/site/$site/vms`), and a create from there goes to the Fleet form -- a create
 * is an estate-wide act -- and comes back to the Site's own list, because the
 * link records which list it was opened from.
 */
export const Route = createFileRoute("/fleet/vms/")({
  component: FleetVms,
});

function FleetVms() {
  return <VmsList scopeLabel="Across every Site." />;
}
