export function agentThreadSurfaceId(providerId: string, threadId: string): string {
  return `agent:${encodeIdentityPart(providerId, "providerId")}:thread:${encodeIdentityPart(threadId, "threadId")}`;
}

export function agentRunSurfaceId(providerId: string, runId: string): string {
  return `agent:${encodeIdentityPart(providerId, "providerId")}:run:${encodeIdentityPart(runId, "runId")}`;
}

export function agentSurfaceId(input: {
  providerId: string;
  threadId?: string;
  runId: string;
}): string {
  return input.threadId
    ? agentThreadSurfaceId(input.providerId, input.threadId)
    : agentRunSurfaceId(input.providerId, input.runId);
}

function encodeIdentityPart(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Agent surface ${field} must not be empty.`);
  return encodeURIComponent(normalized);
}
