const PREFIX = "BEAVER_CODE_AGENT_OFFICE_DIAGNOSTIC ";
const CATEGORIES = new Set([
  "csp-compatibility",
  "renderer-initialization",
  "context-lost",
  "asset-load",
  "asset-decode",
  "scene-build",
]);
const STAGES = new Set(["application-init", "context-lost", "scene-build"]);

export function parseOfficeRendererConsoleDiagnostic(message: string): string | null {
  if (!message.startsWith(PREFIX) || message.length > 300) return null;
  try {
    const value = JSON.parse(message.slice(PREFIX.length)) as { category?: unknown; stage?: unknown };
    if (typeof value.category !== "string" || !CATEGORIES.has(value.category)) return null;
    if (typeof value.stage !== "string" || !STAGES.has(value.stage)) return null;
    return `category=${value.category} stage=${value.stage}`;
  } catch {
    return null;
  }
}
