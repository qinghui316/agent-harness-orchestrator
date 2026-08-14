import { resolve } from "node:path";
import { z } from "zod";
import { defaultCodexAppServerHostRegistry } from "./app-server-host.js";

interface CodexCollaborationModeRequester {
  requestMetadata(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const responseSchema = z.object({
  data: z.array(z.object({
    name: z.string(),
    mode: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    reasoning_effort: z.unknown().optional(),
  }).passthrough()),
}).passthrough();

export async function codexPlanModeAvailable(
  projectPath: string,
  requester: CodexCollaborationModeRequester = defaultCodexAppServerHostRegistry.hostFor(resolve(projectPath)),
): Promise<boolean> {
  const response = responseSchema.parse(await requester.requestMetadata("collaborationMode/list", {}));
  return response.data.some((item) => item.mode === "plan");
}
