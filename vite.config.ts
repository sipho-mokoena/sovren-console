import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // refs/ is vendored upstream material, not ours to reformat.
  // Oxfmt's YAML parser also rejects the multi-line flow sequence in
  // refs/netbird-openapi.yml, which the real YAML spec permits.
  fmt: {
    ignorePatterns: ["refs/**"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
