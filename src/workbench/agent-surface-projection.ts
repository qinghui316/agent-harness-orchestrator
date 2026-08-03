import { createHash } from "node:crypto";
import { readBundledAgentCatalog, type AgentCatalog } from "../agent/catalog.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { resolveRegisteredAgentExecutionProfile } from "./agent-execution-profile-resolver.js";
import { canonicalPlanDocumentFromEntry } from "./plan-documents.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import type { StoredProviderAttempt, StoredProviderThreadLink, StoredTopicMessage } from "./persistence/contracts.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { WorkbenchProjectInput } from "./read-model-types.js";
import type { AgentSurfaceProjection, AgentSurfaceProjectionItem, AgentSurfaceStatus } from "./agent-surface-contract.js";

const TERMINAL_PLAN_STATUSES = new Set(["accepted", "revision-requested", "skipped", "superseded", "planner-proposal-invalid"]);

export async function getAgentSurfaceProjection(
  input: WorkbenchProjectInput,
  conversationId: string,
): Promise<AgentSurfaceProjection> {
  if (!input.project) throw notFound("Agent surfaces are unavailable for this project.");
  const state = await resolveProjectRuntimeState(input.project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw notFound("Agent surfaces are unavailable for this project.");
  const { paths } = state.resolution;
  const catalog = readBundledAgentCatalog();
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    return store.transaction(() => {
      const conversation = store.conversations.readConversation(paths.projectId, conversationId);
      if (!conversation) throw notFound("Agent surface conversation was not found.");
      const graphScopeId = conversation.currentGraphScopeId ?? "";
      const scopeStatus = graphScopeId && store.conversations.isConversationGraphScopeTerminal(paths.projectId, graphScopeId)
        ? "terminal" as const
        : "active" as const;
      const links = store.providerAttempts.listProviderThreads(paths.projectId, conversationId);
      const attempts = store.providerAttempts.listProviderAttempts(paths.projectId, conversationId);
      const messages = store.timeline.listConversationMessages(paths.projectId, conversationId);
      return buildAgentSurfaceProjection({
        conversationId,
        graphScopeId,
        scopeStatus,
        conversationCreatedAt: conversation.createdAt,
        links,
        attempts,
        messages,
        catalog,
      });
    });
  } finally {
    store.close();
  }
}

export function buildAgentSurfaceProjection(input: {
  conversationId: string;
  graphScopeId: string;
  scopeStatus: "active" | "terminal";
  conversationCreatedAt: string;
  links: StoredProviderThreadLink[];
  attempts: StoredProviderAttempt[];
  messages: StoredTopicMessage[];
  catalog: AgentCatalog;
}): AgentSurfaceProjection {
  const catalogByRole = new Map(input.catalog.agents.map((entry) => [entry.roleId, entry]));
  const attemptsById = new Map(input.attempts.map((attempt) => [attempt.attemptId, attempt]));
  const validLinks = input.links.filter((link) => {
    const attempt = attemptsById.get(link.attemptId);
    return attemptMatchesLink(attempt, link)
      && (link.roleId === "main-agent"
        || resolveRegisteredAgentExecutionProfile(input.catalog, link.roleId)?.operationProfile === attempt.operationProfile);
  });
  const mainAttempt = input.attempts
    .filter((attempt) => attempt.roleId === "main-agent" && attempt.graphScopeId === input.graphScopeId)
    .sort(compareAttempts)
    .at(-1);
  const activeAttention = input.scopeStatus === "active"
    ? interactionAttention(input.messages, input.graphScopeId, validLinks)
    : { main: false, agents: new Set<string>() };
  const surfaces: AgentSurfaceProjectionItem[] = [{
    agentSurfaceId: "main-agent",
    kind: "main-agent",
    roleId: "main-agent",
    roleDisplayName: "主 Agent",
    label: "主 Agent",
    description: "协调当前对话并将工作派发给专业 Agent。",
    skills: ["orchestration", "delegation", "synthesis"],
    parentAgentSurfaceId: null,
    graphScopeId: input.graphScopeId,
    scopeRange: "current",
    status: activeAttention.main ? "waiting-user" : mainAttempt ? mapAttemptStatus(mainAttempt.status) : "idle",
    readOnly: input.scopeStatus === "terminal",
    createdAt: mainAttempt?.createdAt ?? input.conversationCreatedAt,
  }];
  const linkedSurfaceScopes = new Set(validLinks.map((link) => `${link.graphScopeId ?? ""}\u0000${surfaceIdForLink(link)}`));
  const children = validLinks
    .filter((link) => link.roleId !== "main-agent"
      && Boolean(link.graphScopeId)
      && Boolean(link.parentAgentSurfaceId)
      && (link.parentAgentSurfaceId === "main-agent"
        || linkedSurfaceScopes.has(`${link.graphScopeId ?? ""}\u0000${link.parentAgentSurfaceId}`)))
    .map((link): AgentSurfaceProjectionItem => {
      const attempt = attemptsById.get(link.attemptId)!;
      const agentSurfaceId = surfaceIdForLink(link);
      const role = catalogByRole.get(link.roleId)!;
      const scopeRange = link.graphScopeId === input.graphScopeId ? "current" as const : "historical" as const;
      const status = scopeRange === "current" && activeAttention.agents.has(agentSurfaceId)
        ? "waiting-user" as const
        : mapAttemptStatus(attempt.status);
      return {
        agentSurfaceId,
        kind: "agent",
        roleId: link.roleId,
        roleDisplayName: role.displayName,
        label: composeDisplayLabel(role.displayName, link.displayName),
        description: role.description,
        skills: [...role.allowedSkills],
        parentAgentSurfaceId: link.parentAgentSurfaceId,
        graphScopeId: link.graphScopeId!,
        scopeRange,
        status,
        readOnly: scopeRange === "historical" || input.scopeStatus === "terminal" || status === "terminated",
        createdAt: attempt.createdAt,
      };
    });
  surfaces.push(...numberDuplicateLabels(children).sort((left, right) => (
    left.createdAt.localeCompare(right.createdAt) || left.agentSurfaceId.localeCompare(right.agentSurfaceId)
  )));
  const canonical = {
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    scopeStatus: input.scopeStatus,
    surfaces,
  };
  return {
    ...canonical,
    projectionHash: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
  };
}

function interactionAttention(
  messages: StoredTopicMessage[],
  graphScopeId: string,
  links: StoredProviderThreadLink[],
): { main: boolean; agents: Set<string> } {
  const agents = new Set<string>();
  let main = false;
  const surfaceByProviderThread = new Map(links.map((link) => [
    `${link.providerId}\u0000${link.providerThreadId}`,
    surfaceIdForLink(link),
  ]));
  for (const message of messages) {
    const entry = fromStoredThreadMessage(message);
    if (entry.graphScopeId !== graphScopeId) continue;
    const request = entry.providerUserInput;
    if (request
      && (request.status === "pending" || request.status === "submitting")
      && (!request.expiresAt || Date.parse(request.expiresAt) > Date.now())) {
      const surface = request.threadId
        ? surfaceByProviderThread.get(`${request.providerId}\u0000${request.threadId}`)
        : undefined;
      if (!surface || surface === "main-agent") main = true;
      else agents.add(surface);
    }
    const clarification = entry.clarification as { status?: string } | undefined;
    if (clarification?.status === "pending") main = true;
    if (entry.agentRoleId === "planning-agent"
      && canonicalPlanDocumentFromEntry(entry)
      && !TERMINAL_PLAN_STATUSES.has(entry.status ?? "")) main = true;
  }
  return { main, agents };
}

function attemptMatchesLink(
  attempt: StoredProviderAttempt | undefined,
  link: StoredProviderThreadLink,
): attempt is StoredProviderAttempt {
  return Boolean(attempt
    && attempt.conversationId === link.conversationId
    && attempt.providerId === link.providerId
    && attempt.roleId === link.roleId
    && attempt.graphScopeId === link.graphScopeId
    && attempt.nativeSessionId === link.providerThreadId);
}

function mapAttemptStatus(status: StoredProviderAttempt["status"]): AgentSurfaceStatus {
  switch (status) {
    case "queued": return "queued";
    case "running": return "running";
    case "completed": return "completed";
    case "blocked": return "needs-change";
    case "failed": return "failed";
    case "interrupted": return "interrupted";
    case "terminated": return "terminated";
  }
}

function surfaceIdForLink(link: StoredProviderThreadLink): string {
  return link.roleId === "main-agent" ? "main-agent" : agentThreadSurfaceId(link.providerId, link.providerThreadId);
}

function compareAttempts(left: StoredProviderAttempt, right: StoredProviderAttempt): number {
  return left.createdAt.localeCompare(right.createdAt) || left.attemptId.localeCompare(right.attemptId);
}

function numberDuplicateLabels(surfaces: AgentSurfaceProjectionItem[]): AgentSurfaceProjectionItem[] {
  const bases = new Map(surfaces.map((surface) => [surface.agentSurfaceId, surface.label]));
  const totals = new Map<string, number>();
  for (const base of bases.values()) totals.set(base, (totals.get(base) ?? 0) + 1);
  const indexById = new Map<string, number>();
  const nextByBase = new Map<string, number>();
  for (const surface of [...surfaces].sort((left, right) => left.agentSurfaceId.localeCompare(right.agentSurfaceId))) {
    const base = bases.get(surface.agentSurfaceId) ?? surface.roleDisplayName;
    const next = (nextByBase.get(base) ?? 0) + 1;
    nextByBase.set(base, next);
    indexById.set(surface.agentSurfaceId, next);
  }
  return surfaces.map((surface) => {
    const base = bases.get(surface.agentSurfaceId) ?? surface.roleDisplayName;
    return (totals.get(base) ?? 0) > 1
      ? { ...surface, label: `${base} ${indexById.get(surface.agentSurfaceId)}` }
      : { ...surface, label: base };
  });
}

function composeDisplayLabel(roleDisplayName: string, providerDisplayName: string | null | undefined): string {
  const provider = providerDisplayName?.trim();
  if (!provider || normalizedLabel(provider) === normalizedLabel(roleDisplayName)) return roleDisplayName;
  return `${roleDisplayName} · ${provider}`;
}

function normalizedLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}
