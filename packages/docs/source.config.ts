import { defineConfig } from "fumadocs-mdx/config";
import { remarkStripLeadingTitle } from "./lib/remark-strip-leading-title";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkStripLeadingTitle],
  },
});
