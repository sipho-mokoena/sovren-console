import Link from "next/link";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Card, Cards } from "fumadocs-ui/components/card";
import { source } from "@/lib/source";

/**
 * The one page the site owns outright, so it can point at the sections. It
 * lists no requirement numbers and no decisions -- those are read from the files
 * that hold them, and a section with no pages yet is simply left out.
 */
export default function HomePage() {
  const firstAdr = source.getPages().find((page) => page.path.startsWith("adr/"));

  const sections = [
    {
      title: "Specification",
      href: "/docs/specs/sovren-control-plane",
      body: "The control-plane spec, authoritative on behaviour. Rendered from docs/specs.",
    },
    {
      title: "Requirements",
      href: "/docs/tech-stack",
      body: "R1 to R69 and the stack decisions behind them. Rendered from docs/tech-stack.md.",
    },
    {
      title: "Decisions",
      href: firstAdr?.url,
      body: "Every ADR in docs/adr, gathered by glob. A new one appears on its own.",
    },
    {
      title: "Runbook",
      href: "/docs/guide/runbook",
      body: "A clean clone to a running console and documentation site.",
    },
    {
      title: "Port map",
      href: "/docs/guide/ports",
      body: "Rendered from config/ports.env, the only place a port is written.",
    },
    {
      title: "Glossary",
      href: "/docs/guide/glossary",
      body: "The vocabulary, and the three distinctions that are easy to lose.",
    },
  ].filter((section): section is { title: string; href: string; body: string } =>
    Boolean(section.href),
  );

  return (
    <DocsLayout tree={source.getPageTree()} nav={{ title: "sovren" }} sidebar={{ enabled: false }}>
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold">sovren</h1>
        <p className="text-fd-muted-foreground mt-3 text-lg">
          A control plane and console for an estate of retired university desktops. Proxmox, NetBird
          and Dokploy as one set of nouns rather than three dashboards.
        </p>
        <p className="text-fd-muted-foreground mt-3">
          Every page here is the repository&rsquo;s own markdown, read from where it already lives.
          Nothing on this site is a second copy of anything.
        </p>

        <Cards className="mt-10">
          {sections.map((section) => (
            <Card key={section.href} title={section.title} href={section.href}>
              {section.body}
            </Card>
          ))}
        </Cards>

        <p className="text-fd-muted-foreground mt-10 text-sm">
          New here? Start with{" "}
          <Link className="underline" href="/docs/guide/runbook">
            the runbook
          </Link>
          .
        </p>
      </main>
    </DocsLayout>
  );
}
