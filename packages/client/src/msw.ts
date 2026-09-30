/**
 * The generated mock backend, gathered behind one import.
 *
 * Orval emits one `<tag>.msw.ts` per tag, and none of them re-export each
 * other. A consumer that wants the mock backend should not have to know the tag
 * list -- that list is generated too, and it changes without warning.
 *
 * This file is a hand-written *index* of generated modules, and it is the one
 * thing in this package allowed to name them: it holds no logic and no data.
 * It lives outside `src/generated/` because `pnpm run generate` recreates that
 * directory wholesale, so anything authored there is destroyed on the next run.
 */
export * from "./generated/connection/connection.msw";
export * from "./generated/disk/disk.msw";
export * from "./generated/drive/drive.msw";
export * from "./generated/node/node.msw";
export * from "./generated/peer/peer.msw";
export * from "./generated/snapshot/snapshot.msw";
export * from "./generated/task/task.msw";
export * from "./generated/vm/vm.msw";
