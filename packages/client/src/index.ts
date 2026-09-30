/**
 * The client package's public surface.
 *
 * Three layers, and the third is here for a reason that is easy to miss: the
 * generated entrypoint re-exports the operations and nothing else, because
 * orval emits one module per tag. The models -- `Node`, `Vm`, `Task`, `ErrorCode`
 * and the rest -- are generated into a sibling barrel that nothing else pulls in,
 * so a consumer that reaches for a type by name gets "no exported member" for
 * every one of them, including the ones that have always been there. A world's
 * fixtures and a screen's props both need those names, so the barrel is
 * re-exported here rather than left for each consumer to reach around.
 */
export * from "./safe-fetch";
export * from "./generated";
export * from "./generated/model";
