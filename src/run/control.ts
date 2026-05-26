const stopRequests = new Map<string, { requestedAt: string; reason: string }>();

export function requestRunStop(runId: string, reason = "User requested stop."): void {
  stopRequests.set(runId, { requestedAt: new Date().toISOString(), reason });
}

export function isRunStopRequested(runId: string): boolean {
  return stopRequests.has(runId);
}

export function consumeRunStopRequest(runId: string): { requestedAt: string; reason: string } | null {
  const request = stopRequests.get(runId) ?? null;
  stopRequests.delete(runId);
  return request;
}

export function clearRunStopRequest(runId: string): void {
  stopRequests.delete(runId);
}
