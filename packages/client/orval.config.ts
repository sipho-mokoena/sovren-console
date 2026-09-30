import { defineConfig } from "orval";

const input = { target: "../../openapi/sovren.json" };

/**
 * One document in, four artefacts out: a typed client, react-query hooks, Zod
 * validators, and MSW handlers. Nothing downstream of this file is hand-written,
 * which is what makes the console's mocks incapable of drifting from the client
 * and the client incapable of drifting from the server.
 *
 * Two outputs, one document. Orval emits either TypeScript models or Zod
 * schemas per output, not both, and the console wants both: TypeScript types
 * for the client and the components, Zod for validating a form payload and a
 * cached response at runtime. Same document, so they cannot disagree.
 *
 * The mutator is the piece that carries R35: the generated client returns a
 * discriminated union keyed on HTTP status and never throws on a failure, so
 * every call site is forced by the type system to handle failure.
 */
export default defineConfig({
  sovren: {
    input,
    output: {
      target: "src/generated/endpoints.ts",
      schemas: "src/generated/model",
      client: "react-query",
      mode: "tags-split",
      httpClient: "fetch",
      mock: {
        generators: [{ type: "msw", baseUrl: "*/api/v1", generateEachHttpStatus: true }],
      },
      override: {
        mutator: {
          path: "./src/safe-fetch.ts",
          name: "safeFetch",
        },
      },
    },
  },
  "sovren-zod": {
    input,
    output: {
      target: "src/generated/zod/index.ts",
      schemas: { type: "zod", path: "./src/generated/zod" },
      client: "zod",
      mode: "tags-split",
    },
  },
});
