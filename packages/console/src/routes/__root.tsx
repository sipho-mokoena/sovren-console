import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AppProviders } from "@/components/sovren/app-providers";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "sovren",
      },
      {
        name: "description",
        content:
          "Sovereign control plane and console. This build renders entirely from the mock backend.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The 404.
 *
 * It states where the operator is and offers the way back, because a console
 * whose 404 is a sentence about absence teaches an operator that the console is
 * empty rather than that the address is wrong.
 */
function NotFound() {
  return (
    <main className="mx-auto flex max-w-prose flex-col gap-2 p-8">
      <h1 className="font-heading text-base font-medium">Nothing at this address</h1>
      <p className="text-xs text-muted-foreground">
        sovren serves the estate, not arbitrary paths. The fleet starts at the Nodes list.
      </p>
      <a href="/fleet/nodes" className="text-xs underline underline-offset-4">
        Go to Fleet → Nodes
      </a>
    </main>
  );
}
