import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/sovren/console-shell";
import { SiteScopeProvider } from "@/nav/site-scope";
import { SitePicker, useSitePicker } from "@/screens/site-picker";

/**
 * The Site scope: one physical lab at a time.
 *
 * **A Site is a latency and failure boundary, not a tenancy and not a security
 * one** (R28). Nothing here isolates anything: the same operator sees every Site,
 * a credential held for one Site is held for the estate, and the sidebar says so
 * in as many words. An operator who reads "Site" as a boundary will eventually
 * rely on one that does not exist.
 *
 * The scope spans both `/site` -- the index, where a lab is chosen -- and
 * `/site/$site`, where one is being worked on, so the shell and the picker are
 * the same in both. The site itself is read from the path once and handed down
 * through a context, which is how two pages in the same lab cannot end up
 * disagreeing about which lab they are in.
 *
 * A site nothing answers to is a 404 rather than an empty list, because "this
 * lab does not exist" and "this lab has no machines" are different sentences and
 * only one of them is true.
 */
export const Route = createFileRoute("/site")({
  component: SiteLayout,
});

function SiteLayout() {
  const { site, sites, unknown } = useSitePicker();

  return (
    <SiteScopeProvider site={site}>
      <ConsoleShell
        scope="site"
        context={
          site === "" ? null : (
            <>
              {unknown && (
                <p className="px-1 text-[11px] text-amber-700 dark:text-amber-300">
                  No Site is called “{site}”.
                </p>
              )}
              <SitePicker sites={sites} current={site} />
            </>
          )
        }
      >
        <Outlet />
      </ConsoleShell>
    </SiteScopeProvider>
  );
}
