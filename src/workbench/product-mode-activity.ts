import { readBundledAgentCatalog } from "../agent/catalog.js";
import type { ProductMode } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { buildAgentSurfaceProjection } from "./agent-surface-projection.js";
import { buildConversationInteractionQueue } from "./conversation-interactions.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { getWorkbenchSnapshot } from "./projections/read-model/implementation.js";
import type { AgentSurfaceProjectionItem } from "./agent-surface-contract.js";
import type { WorkbenchProjectInput, WorkbenchSnapshot, WorkbenchWorkpadSummary } from "./read-model-types.js";

export type ProductModeActivityState = "unavailable" | "idle" | "running" | "attention" | "failed";

export interface ProductModeActivityIndicator {
  productMode: ProductMode;
  state: ProductModeActivityState;
  updatedAt: string | null;
}

export interface ProjectProductModeActivitySnapshot {
  projectId: string;
  generatedAt: string;
  agent: ProductModeActivityIndicator;
  harness: ProductModeActivityIndicator;
}

interface AgentConversationActivity {
  state: Exclude<ProductModeActivityState, "unavailable">;
  updatedAt: string | null;
}

export interface ProductModeActivityProjectionPorts {
  now?: () => string;
  readHarnessSnapshot?: (input: WorkbenchProjectInput) => Promise<WorkbenchSnapshot>;
}

export class ProductModeActivityProjectionOwner {
  constructor(private readonly ports: ProductModeActivityProjectionPorts = {}) {}

  async read(input: WorkbenchProjectInput): Promise<ProjectProductModeActivitySnapshot> {
    if (!input.project) throw badRequest("Mode activity requires a selected project.");
    const generatedAt = this.ports.now?.() ?? new Date().toISOString();
    const [agent, harness] = await Promise.all([
      this.readAgent(input),
      this.readHarness(input),
    ]);
    return {
      projectId: input.project.id,
      generatedAt,
      agent: { productMode: "agent", ...agent },
      harness: { productMode: "harness", ...harness },
    };
  }

  private async readAgent(input: WorkbenchProjectInput): Promise<AgentConversationActivity> {
    const project = input.project!;
    const runtime = input.runtimeStateResolver
      ? await input.runtimeStateResolver(project)
      : await resolveProjectRuntimeState(project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
    const paths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    const catalog = readBundledAgentCatalog();
    const active: Array<{
      conversationId: string;
      graphScopeId: string;
      updatedAt: string;
      projectionState: Exclude<ProductModeActivityState, "unavailable" | "attention">;
    }> = [];
    try {
      for (const conversation of database.conversations.listConversations(paths.projectId, "agent")) {
        const graphScopeId = conversation.currentGraphScopeId;
        if (conversation.state !== "active" || !graphScopeId) continue;
        const scopeStatus = database.conversations.isConversationGraphScopeTerminal(paths.projectId, graphScopeId)
          ? "terminal" as const
          : "active" as const;
        const attempts = database.providerAttempts.listProviderAttempts(paths.projectId, conversation.conversationId)
          .filter((attempt) => attempt.productMode === "agent" && attempt.graphScopeId === graphScopeId);
        const links = database.providerAttempts.listProviderThreads(paths.projectId, conversation.conversationId)
          .filter((link) => link.graphScopeId === graphScopeId);
        const projection = buildAgentSurfaceProjection({
          projectId: paths.projectId,
          productMode: "agent",
          conversationId: conversation.conversationId,
          graphScopeId,
          scopeStatus,
          conversationCreatedAt: conversation.createdAt,
          links,
          attempts,
          messages: database.timeline.listConversationMessages(paths.projectId, conversation.conversationId),
          catalog,
        });
        const projectionState = deriveAgentSurfaceActivity(projection.surfaces, scopeStatus);
        active.push({
          conversationId: conversation.conversationId,
          graphScopeId,
          updatedAt: latestTimestamp([
            conversation.updatedAt,
            ...attempts.map((attempt) => attempt.updatedAt),
          ]) ?? conversation.updatedAt,
          projectionState,
        });
      }
    } finally {
      database.close();
    }

    const resolved = await Promise.all(active.map(async (item): Promise<AgentConversationActivity> => {
      const interactions = await buildConversationInteractionQueue(paths, item.conversationId, item.graphScopeId, "agent");
      return {
        state: interactions.items.some((interaction) => interaction.status === "pending" || interaction.status === "submitting")
          ? "attention"
          : item.projectionState,
        updatedAt: item.updatedAt,
      };
    }));
    return aggregateProductModeActivity(resolved);
  }

  private async readHarness(input: WorkbenchProjectInput): Promise<Omit<ProductModeActivityIndicator, "productMode">> {
    const snapshot = await (this.ports.readHarnessSnapshot ?? ((value) => getWorkbenchSnapshot(value, { productMode: "harness" })))(input);
    if (snapshot.harness.harnessReady !== true) {
      return { state: "unavailable", updatedAt: null };
    }
    return {
      ...deriveHarnessActivity(snapshot),
    };
  }
}

export function deriveHarnessActivity(snapshot: WorkbenchSnapshot): AgentConversationActivity {
  const workpads = snapshot.left.workpads.filter((workpad) => workpad.state !== "archive" && workpad.runtimeStatus !== "archived");
  const hasConfirmation = Boolean(snapshot.right.confirmationQueue.primary)
    || snapshot.right.confirmationQueue.current.length > 0
    || snapshot.right.confirmationQueue.otherDemands.length > 0
    || snapshot.right.confirmationQueue.maintenance.length > 0;
  const hasInteraction = snapshot.center.conversationInteractions.items.some((item) => item.status === "pending" || item.status === "submitting");
  const failed = workpads.filter(isFailedWorkpad);
  const attention = workpads.filter((workpad) => !isFailedWorkpad(workpad) && (
    workpad.runtimeStatus === "blocked"
      || workpad.runtimeStatus === "waiting-decision"
      || workpad.waitingDecisionCount > 0
      || workpad.userStatus === "waiting-confirmation"
      || workpad.userStatus === "needs-rework"
  ));
  const running = workpads.filter((workpad) => workpad.runtimeStatus === "running" || workpad.runtimeStatus === "queued");
  if (hasConfirmation || hasInteraction || attention.length > 0) {
    return { state: "attention", updatedAt: latestWorkpadTimestamp(attention) };
  }
  if (failed.length > 0) return { state: "failed", updatedAt: latestWorkpadTimestamp(failed) };
  if (running.length > 0) return { state: "running", updatedAt: latestWorkpadTimestamp(running) };
  return { state: "idle", updatedAt: null };
}

export function aggregateProductModeActivity(items: readonly AgentConversationActivity[]): AgentConversationActivity {
  for (const state of ["attention", "failed", "running"] as const) {
    const matching = items.filter((item) => item.state === state);
    if (matching.length > 0) return { state, updatedAt: latestTimestamp(matching.map((item) => item.updatedAt)) };
  }
  return { state: "idle", updatedAt: null };
}

export function deriveAgentSurfaceActivity(
  surfaces: readonly AgentSurfaceProjectionItem[],
  scopeStatus: "active" | "terminal",
): "idle" | "running" | "failed" {
  const current = surfaces.filter((surface) => surface.scopeRange === "current");
  if (current.some((surface) => surface.status === "failed")) return "failed";
  if (scopeStatus === "active" && current.some((surface) => surface.status === "queued" || surface.status === "running")) return "running";
  return "idle";
}

function isFailedWorkpad(workpad: WorkbenchWorkpadSummary): boolean {
  return isFailureStatus(workpad.latestRunStatus) || isFailureStatus(workpad.queueStatus);
}

function isFailureStatus(status: string | undefined): boolean {
  return status === "failed" || status === "error";
}

function latestWorkpadTimestamp(workpads: readonly WorkbenchWorkpadSummary[]): string | null {
  return latestTimestamp(workpads.map((workpad) => workpad.updatedAt));
}

function latestTimestamp(values: readonly (string | null | undefined)[]): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}
