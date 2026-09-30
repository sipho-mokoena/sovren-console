import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ListChecks, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{ title: "sovren" }}
      sidebar={{ collapsible: true }}
      links={[
        {
          text: "Control-plane spec",
          url: "/docs/specs/sovren-control-plane",
          icon: <ScrollText />,
        },
        { text: "Requirements", url: "/docs/tech-stack", icon: <ListChecks /> },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
