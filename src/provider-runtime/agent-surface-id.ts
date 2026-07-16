export function agentThreadSurfaceId(providerId: string, threadId: string): string {
  return `agent:${encodeIdentityPart(providerId, "providerId")}:thread:${encodeIdentityPart(threadId, "threadId")}`;
}

function encodeIdentityPart(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Agent surface ${field} must not be empty.`);
  return encodeURIComponent(normalized);
}
