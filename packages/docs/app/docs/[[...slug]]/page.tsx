import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "@/components/mdx";
import { source } from "@/lib/source";

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  // Next's own not-found boundary, so a stale link gets the site's tree and
  // search rather than a stack trace.
  if (!page) notFound();

  const { body: Mdx, toc } = page.data;
  const title = page.data.title ?? page.url;

  return (
    <DocsPage toc={toc} tableOfContent={{ enabled: true }}>
      <DocsTitle>{title}</DocsTitle>
      {page.data.description ? (
        <p className="text-fd-muted-foreground mt-2 text-lg">{page.data.description}</p>
      ) : null}
      <DocsBody>
        <Mdx components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata(props: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const { slug = [] } = await props.params;
  const page = source.getPage(slug);

  if (!page) return { title: "Not found" };

  return {
    title: page.data.title ?? page.url,
    description: page.data.description,
    alternates: { canonical: page.url },
  };
}

export function generateStaticParams() {
  return source.generateParams();
}
