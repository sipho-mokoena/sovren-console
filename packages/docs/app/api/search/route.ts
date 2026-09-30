import { flexsearchFromSource } from "fumadocs-core/search/flexsearch";
import { source } from "@/lib/source";

/**
 * Search over the whole content tree, built from the same loader the pages use --
 * so a page that is on the site is searchable, and one that is not, is not found.
 */
export const { GET } = flexsearchFromSource(source);
