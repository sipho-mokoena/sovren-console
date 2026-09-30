import Link from "next/link";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";

/**
 * A page that does not exist resolves here.
 *
 * The useful part is not the apology, it is the way back: the whole tree, so a
 * reader who followed a stale link can see what the site does have, and the
 * search box in the header.
 */
export default function NotFound() {
  return (
    <DocsLayout tree={source.getPageTree()} nav={{ title: "sovren" }}>
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold">Not found</h1>
        <p className="text-fd-muted-foreground mt-3 text-lg">
          There is no page at this address. That is usually a link that has moved, or an
          architecture decision record that has not been written yet.
        </p>
        <p className="text-fd-muted-foreground mt-3">
          The sidebar has everything the site carries, and the search box covers the contents of
          every page. If you followed a link from the repository, the file it pointed at has
          probably moved.
        </p>
        <p className="mt-6">
          <Link className="underline" href="/">
            Back to the front page
          </Link>
        </p>
      </main>
    </DocsLayout>
  );
}
