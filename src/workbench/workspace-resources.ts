import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkbenchAgentWorkspaceAgent, WorkbenchProjectInput } from "./read-model-types.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import { readProjectTextDocument } from "./file-references.js";
import { canonicalPlanDocumentFromEntry, canonicalPlanDocumentText } from "./plan-documents.js";
import { getWorkbenchSnapshot } from "./projections/read-model/implementation.js";
import { WorkbenchStore } from "./store.js";

export type WorkspaceResourceTarget =
  | { kind: "agent"; conversationId: string; agentSurfaceId: string }
  | { kind: "document"; conversationId: string; documentId: string }
  | { kind: "project-file"; relativePath: string };

export interface AgentThreadResource {
  resourceId: string;
  kind: "agent";
  title: string;
  readOnly: false;
  agent: WorkbenchAgentWorkspaceAgent;
  target: Extract<WorkspaceResourceTarget, { kind: "agent" }>;
}

export interface TextDocumentResource {
  resourceId: string;
  kind: "plan" | "markdown-file" | "text-file";
  title: string;
  language: "markdown" | "text";
  content: string;
  revision: string;
  readOnly: true;
  target: Extract<WorkspaceResourceTarget, { kind: "document" | "project-file" }>;
}

export type WorkspaceResource = AgentThreadResource | TextDocumentResource;

export async function resolveWorkspaceResource(
  input: WorkbenchProjectInput & { project: ManagedProject },
  target: WorkspaceResourceTarget,
): Promise<WorkspaceResource> {
  if (target.kind === "agent") {
    const snapshot = await getWorkbenchSnapshot(input, { topicId: target.conversationId });
    const agent = snapshot.right.agentWorkspace.agents.find((candidate) => candidate.id === target.agentSurfaceId);
    if (!agent || agent.roleId === "main-agent") throw notFound("Agent resource is unavailable in the selected conversation.");
    return {
      resourceId: `agent:${agent.id}`,
      kind: "agent",
      title: agent.label,
      readOnly: false,
      agent,
      target,
    };
  }
  if (target.kind === "project-file") {
    const document = await readProjectTextDocument(input.project, target.relativePath);
    return {
      resourceId: `project-file:${document.relativePath}`,
      kind: document.kind,
      title: document.name,
      language: document.language,
      content: document.content,
      revision: document.revision,
      readOnly: true,
      target: { kind: "project-file", relativePath: document.relativePath },
    };
  }

  const memory = await resolveProjectMemory(input.project);
  if (!memory.projectId) throw notFound("Plan document project is unavailable.");
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(memory.projectId, target.conversationId);
    if (!conversation) throw notFound("Plan document conversation is unavailable.");
    const entries = store.listConversationMessages(memory.projectId, target.conversationId).map(fromStoredThreadMessage);
    const source = entries.find((entry) => canonicalPlanDocumentFromEntry(entry)?.documentId === target.documentId);
    const document = source ? canonicalPlanDocumentFromEntry(source) : null;
    const content = source && document ? canonicalPlanDocumentText(source, document) : null;
    if (!source || !document || !content || document.sourceMessageId !== source.id) {
      throw notFound("Plan document is unavailable or failed identity validation.");
    }
    return {
      resourceId: document.documentId,
      kind: "plan",
      title: document.title,
      language: "markdown",
      content,
      revision: document.contentHash,
      readOnly: true,
      target,
    };
  } finally {
    store.close();
  }
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}
