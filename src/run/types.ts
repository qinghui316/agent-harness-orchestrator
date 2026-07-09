import type { RunMetadata } from "../types/index.js";

export interface RunStartResult {
  run: RunMetadata;
}

export interface LocalCommandRunOptions {
  worktree?: boolean;
}
