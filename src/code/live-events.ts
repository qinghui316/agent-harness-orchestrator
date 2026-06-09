import type { RunMetadata } from "../types/index.js";
import type { CodeRunLiveCallbacks } from "./types.js";

export function emitCodeLiveStatus(live: CodeRunLiveCallbacks | undefined, event: { runId: string; status: string; label?: string }): void {
  try {
    live?.onStatus?.(event);
  } catch (error) {
    emitCodeLiveCallbackError(live, event.runId, error);
  }
}

export function emitCodeLiveRunStarted(live: CodeRunLiveCallbacks | undefined, run: RunMetadata): void {
  try {
    live?.onRunStarted?.(run);
  } catch (error) {
    emitCodeLiveCallbackError(live, run.id, error);
  }
}

export function emitCodeLiveCallbackError(live: CodeRunLiveCallbacks | undefined, runId: string, error: unknown): void {
  try {
    live?.onCallbackError?.({ runId, error });
  } catch {
    // Live callbacks are best-effort and must not affect run lifecycle.
  }
}
