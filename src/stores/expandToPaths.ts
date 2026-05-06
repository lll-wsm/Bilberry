import { writable } from "svelte/store";

export interface ExpandRequest {
  /** Incrementing revision — triggers re-processing */
  rev: number;
  /** File paths whose parent directories should be expanded */
  paths: string[];
}

function createExpandToPaths() {
  const { subscribe, set, update } = writable<ExpandRequest>({ rev: 0, paths: [] });

  return {
    subscribe,
    /** Signal that the given paths should be revealed in the tree */
    reveal(paths: string[]) {
      update((s) => ({ rev: s.rev + 1, paths }));
    },
  };
}

export const expandToPaths = createExpandToPaths();
