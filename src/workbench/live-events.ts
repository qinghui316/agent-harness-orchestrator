import type { WorkbenchAssistantEvent, WorkbenchLiveEvent, WorkbenchLiveSink } from "./types.js";

export function emitLive(live: WorkbenchLiveSink | undefined, event: WorkbenchLiveEvent): void {
  try {
    live?.emit(event);
  } catch {
    // Live transport is best-effort; persisted thread/run artifacts remain canonical.
  }
}

export function emitAssistantEvent(live: WorkbenchLiveSink | undefined, event: WorkbenchAssistantEvent): void {
  emitLive(live, { event: "assistant.event", data: { ...event, timestamp: event.timestamp ?? new Date().toISOString() } });
}
