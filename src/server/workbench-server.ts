import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { ProjectRegistryStore } from "../registry/store.js";
import { recoverApplyApprovalReceipts, recoverDiscardApprovalReceipts } from "../apply/manager.js";
import { recoverIntegrationCheckApprovalReceipts } from "../integration-check/manager.js";
import { recoverSpecTestApprovalReceipts } from "../spec-test/proposal.js";
import type { WorkbenchProjectInput } from "../workbench/read-model-types.js";
import type { ManagedProject } from "../types/index.js";
import { TerminalRuntime } from "./terminal/terminal-runtime.js";
import { handleApi } from "./workbench/api-router.js";
import { restoreDirectProjectInput } from "./workbench/direct-project.js";
import { assertDesktopSession, sendJson, statusForError } from "./workbench/http.js";
import { defaultStaticRoot, serveStatic } from "./workbench/static.js";
import { defaultProviderRegistry } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import type { WorkbenchServeOptions, WorkbenchServerContext, WorkbenchServerHandle } from "./workbench/types.js";
import {
  ProjectRuntimeCoordinator,
  type ProjectRuntimeCoordinatorPort,
  type ProjectRuntimeStartupResult,
  type ProjectRuntimeStartupState,
} from "../project-runtime/coordinator.js";
import { WorkbenchProjectRemovalService } from "./workbench/project-removal.js";
import { reconcileRecoveredApprovalDecisions } from "../workbench/actions/approval-decision-reconciliation.js";
import { reconcileStaleAgentNativeChildren } from "../workbench/agent-native-child-lifecycle-service.js";
import { ProjectSkillRuntimeContextResolver } from "../skill/project-skill-runtime-context-resolver.js";
import { createConversationTurnRouter } from "../workbench/conversation-turn-router.js";
import { reconcileStaleProviderInputRequests } from "../workbench/provider-input-lifecycle.js";
import { ConversationTurnControlOwner } from "../workbench/conversation-turn-control.js";
import { reconcileStaleAgentMainAttempts } from "../workbench/agent-main-attempt-recovery.js";
import { ConversationTurnRetryOwner } from "../workbench/conversation-turn-retry.js";
import { TurnAttachmentResolver } from "../workbench/turn-attachment-resolver.js";
import { ComposerDraftRecoveryService } from "../workbench/composer-draft-recovery.js";
import { ProductModeActivityProjectionOwner } from "../workbench/product-mode-activity.js";
import { ConversationContextLifecycleOwner } from "../workbench/conversation-context-lifecycle.js";
import { ConversationForkLifecycleOwner } from "../workbench/conversation-fork-lifecycle.js";
import { ConversationTurnQueueOwner } from "../workbench/conversation-turn-queue.js";
import { ConversationLifecycleOwner } from "../workbench/conversation-lifecycle.js";
import { ConversationReviewLifecycleOwner } from "../workbench/conversation-review-lifecycle.js";
import { defaultProjectRuntimeActivityRegistry } from "../project-runtime/activity.js";

export type { WorkbenchServeOptions, WorkbenchServerHandle } from "./workbench/types.js";
export { executeWorkbenchAction } from "./workbench/actions.js";
export { buildNativeFolderDialogCommand, openNativeFolderDialog } from "./workbench/native-dialog.js";

export async function startWorkbenchServer(input: WorkbenchProjectInput | null = null, options: WorkbenchServeOptions = {}): Promise<WorkbenchServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4317;
  const staticRoot = options.staticRoot ?? defaultStaticRoot();
  const store = options.store ?? new ProjectRegistryStore();
  const projectRuntimeCoordinator = options.projectRuntimeCoordinator ?? new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  const providerRegistry = options.providerRegistry ?? defaultProviderRegistry;
  const projectRemoval = options.projectRemoval ?? new WorkbenchProjectRemovalService({ store, providerRegistry });
  for (const project of await store.listProjects()) projectRemoval.activateAfterRegistration(project.id);
  const terminalRuntime = options.terminalRuntime ?? new TerminalRuntime();
  const skillContext = new ProjectSkillRuntimeContextResolver({
    providerRegistry,
    projectRuntimeCoordinator,
  });
  const turnControl = options.turnControl ?? new ConversationTurnControlOwner({
    providerRegistry,
    projectRuntimeCoordinator,
  });
  const conversationContext = options.conversationContext ?? new ConversationContextLifecycleOwner({
    providerRegistry,
    projectRuntimeCoordinator,
  });
  const conversationFork = options.conversationFork ?? new ConversationForkLifecycleOwner({
    providerRegistry,
    projectRuntimeCoordinator,
    turnControl,
    conversationContext,
  });
  const attachmentResolver = new TurnAttachmentResolver({
    resolveRuntimePaths: (projectId) => projectRuntimeCoordinator.runtimePaths(projectId),
  });
  const turnRouter = createConversationTurnRouter({
    skillContext,
    providerRegistry,
    projectRuntimeCoordinator,
    turnControl,
    contextLifecycle: conversationContext,
    attachmentResolver,
  });
  const turnRetry = options.turnRetry ?? new ConversationTurnRetryOwner(turnRouter);
  const conversationReview = options.conversationReview ?? new ConversationReviewLifecycleOwner({
    providerRegistry,
    projectRuntimeCoordinator,
    turnControl,
    contextLifecycle: conversationContext,
  });
  const conversationTurnQueue = options.conversationTurnQueue ?? new ConversationTurnQueueOwner({
    projectRuntimeCoordinator,
    turnRouter,
    reviewDispatch: conversationReview,
  });
  const conversationLifecycle = options.conversationLifecycle ?? new ConversationLifecycleOwner({
    providerRegistry,
    projectRuntimeCoordinator,
    turnControl,
  });
  const composerDraftRecovery = options.composerDraftRecovery ?? new ComposerDraftRecoveryService({
    attachmentResolver,
    providerRegistry,
  });
  const productModeActivity = options.productModeActivity ?? new ProductModeActivityProjectionOwner();
  const startup = await projectRuntimeCoordinator.reconcileStartup();
  const restoredInput = await restoreDirectProjectInput(input, store);
  const composedInput = restoredInput
    ? {
      ...restoredInput,
      runtimeStateResolver: (project: ManagedProject) => projectRuntimeCoordinator.resolve(project),
      turnControlStateResolver: (projectId: string, conversationId: string, attemptId?: string) => turnControl.state(projectId, conversationId, attemptId),
      conversationContextSnapshotResolver: (project: ManagedProject, productMode: import("../provider-runtime/index.js").ProductMode, conversationId: string) => conversationContext.read(project, productMode, conversationId),
      conversationLifecycleSnapshotResolver: (project: ManagedProject, productMode: import("../provider-runtime/index.js").ProductMode, conversationId: string) => conversationLifecycle.read(project, productMode, conversationId),
    }
    : restoredInput;
  await recoverWorkbenchProjects(store, composedInput, projectRuntimeCoordinator, providerRegistry, conversationContext, conversationFork, conversationTurnQueue, conversationLifecycle, conversationReview, startup);
  const context: WorkbenchServerContext = {
    input: composedInput,
    staticRoot,
    store,
    projectRuntimeCoordinator,
    providerRegistry,
    projectRemoval,
    terminalRuntime,
    turnRouter,
    turnControl,
    turnRetry,
    composerDraftRecovery,
    productModeActivity,
    conversationContext,
    conversationFork,
    conversationTurnQueue,
    conversationLifecycle,
    conversationReview,
    desktopHost: options.desktopHost,
  };
  const sockets = new Set<Socket>();
  const responses = new Set<ServerResponse>();
  const inFlightRequests = new Set<Promise<void>>();
  let acceptingRequests = true;
  const server = createServer((request, response) => {
    responses.add(response);
    response.once("close", () => responses.delete(response));
    if (!acceptingRequests) {
      sendJson(response, 503, { error: "Beaver Code is closing." });
      return;
    }
    const operation = handleRequest(context, request, response)
      .catch((error: unknown) => {
        sendJson(response, statusForError(error), { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => inFlightRequests.delete(operation));
    inFlightRequests.add(operation);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  let runtimeCleanup: Promise<void> | null = null;
  const cleanupRuntime = (): Promise<void> => runtimeCleanup ??= (async () => {
    const failures: unknown[] = [];
    try {
      await providerRegistry.shutdownAll("Workbench server stopped.");
    } catch (cause) {
      appendShutdownFailure(failures, cause);
    }
    try {
      terminalRuntime.cleanup();
    } catch (cause) {
      appendShutdownFailure(failures, cause);
    }
    if (failures.length > 0) throw new AggregateError(failures, "Workbench runtime cleanup failed.");
  })();
  server.on("close", () => {
    void cleanupRuntime().catch(() => undefined);
  });
  await new Promise<void>((resolvePromise) => server.listen(port, host, resolvePromise));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${host}:${actualPort}`,
    snapshot: () => readRuntimeSnapshot({
      store,
      directInput: composedInput,
      projectRuntimeCoordinator,
      providerRegistry,
      terminalRuntime,
      productModeActivity,
      turnControl,
      conversationContext,
      conversationLifecycle,
    }),
    async close(deadlineMs = 8_000) {
      acceptingRequests = false;
      for (const response of responses) {
        const contentType = String(response.getHeader("content-type") ?? "");
        if (contentType.startsWith("text/event-stream") && !response.writableEnded) response.end();
      }
      const registered = await store.listProjects();
      const directProject = composedInput?.project;
      const projectIds = new Set(registered.map((project) => project.id));
      if (directProject) projectIds.add(directProject.id);
      for (const projectId of projectIds) defaultProjectRuntimeActivityRegistry.blockProject(projectId);
      const closing = (async () => {
        const failures: unknown[] = [];
        const interruptionResults = await Promise.allSettled([
          turnControl.interruptAll("Beaver Code is closing."),
          ...providerRegistry.listActiveTurns()
            .filter((turn) => turn.roleId !== "main-agent")
            .map((turn) => turn.interrupt("Beaver Code is closing.")),
        ]);
        for (const result of interruptionResults) {
          if (result.status === "rejected") appendShutdownFailure(failures, result.reason);
        }
        if (failures.length === 0) {
          const drainResults = await Promise.allSettled([
            turnControl.drain(),
            ...[...projectIds].map((projectId) => defaultProjectRuntimeActivityRegistry.drainProject(projectId)),
            ...inFlightRequests,
          ]);
          for (const result of drainResults) {
            if (result.status === "rejected") appendShutdownFailure(failures, result.reason);
          }
        }
        try {
          await cleanupRuntime();
        } catch (cause) {
          appendShutdownFailure(failures, cause);
        }
        try {
          await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        } catch (cause) {
          appendShutdownFailure(failures, cause);
        }
        if (failures.length > 0) throw new AggregateError(failures, "Workbench shutdown failed.");
      })();
      let timeout: NodeJS.Timeout | undefined;
      let completed = false;
      try {
        await Promise.race([
          closing,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Workbench shutdown deadline exceeded.")), Math.max(1, deadlineMs));
          }),
        ]);
        completed = true;
      } catch (cause) {
        for (const socket of sockets) socket.destroy();
        throw cause;
      } finally {
        if (timeout) clearTimeout(timeout);
        if (completed) {
          for (const projectId of projectIds) defaultProjectRuntimeActivityRegistry.activateProject(projectId);
        }
      }
    },
  };
}

function appendShutdownFailure(failures: unknown[], cause: unknown): void {
  if (cause instanceof AggregateError) {
    for (const nested of cause.errors) appendShutdownFailure(failures, nested);
    return;
  }
  failures.push(cause);
}

async function readRuntimeSnapshot(input: {
  store: ProjectRegistryStore;
  directInput: WorkbenchProjectInput | null;
  projectRuntimeCoordinator: ProjectRuntimeCoordinatorPort;
  providerRegistry: typeof defaultProviderRegistry;
  terminalRuntime: TerminalRuntime;
  productModeActivity: ProductModeActivityProjectionOwner;
  turnControl: ConversationTurnControlOwner;
  conversationContext: ConversationContextLifecycleOwner;
  conversationLifecycle: ConversationLifecycleOwner;
}): Promise<import("./workbench/types.js").WorkbenchRuntimeSnapshot> {
  const activeTurnCount = input.providerRegistry.listActiveTurns().length;
  const activeTerminalCount = input.terminalRuntime.activeSessionCount();
  const liveProviderHostCount = input.providerRegistry.runtimeLiveness().liveHostCount;
  if (activeTurnCount + activeTerminalCount + liveProviderHostCount > 0) {
    return { state: "active", activeTurnCount, activeTerminalCount, pendingInteractionCount: 0 };
  }
  try {
    const registered = await input.store.listProjects();
    const directProject = input.directInput?.project;
    const projects = directProject && !registered.some((project) => project.id === directProject.id)
      ? [...registered, directProject]
      : registered;
    let pendingInteractionCount = 0;
    let hasBackgroundActivity = false;
    for (const project of projects) {
      const projectInput: WorkbenchProjectInput = {
        project,
        path: project.path,
        runtimeStateResolver: (selected) => input.projectRuntimeCoordinator.resolve(selected),
        turnControlStateResolver: (projectId, conversationId, attemptId) => input.turnControl.state(projectId, conversationId, attemptId),
        conversationContextSnapshotResolver: (selected, productMode, conversationId) => input.conversationContext.read(selected, productMode, conversationId),
        conversationLifecycleSnapshotResolver: (selected, productMode, conversationId) => input.conversationLifecycle.read(selected, productMode, conversationId),
      };
      const activity = await input.productModeActivity.read(projectInput);
      for (const mode of [activity.agent, activity.harness]) {
        if (mode.state === "attention" || mode.state === "failed") pendingInteractionCount += 1;
        if (mode.state === "running") hasBackgroundActivity = true;
      }
    }
    return {
      state: pendingInteractionCount > 0 ? "attention" : hasBackgroundActivity ? "active" : "idle",
      activeTurnCount,
      activeTerminalCount,
      pendingInteractionCount,
    };
  } catch {
    return { state: "unknown", activeTurnCount, activeTerminalCount, pendingInteractionCount: 0 };
  }
}

export async function recoverWorkbenchProjects(
  store: ProjectRegistryStore,
  directInput: WorkbenchProjectInput | null,
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve"> & Partial<Pick<ProjectRuntimeCoordinatorPort, "markUnavailable">> = new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  }),
  providerRegistry = defaultProviderRegistry,
  conversationContext?: ConversationContextLifecycleOwner,
  conversationFork?: ConversationForkLifecycleOwner,
  conversationTurnQueue?: ConversationTurnQueueOwner,
  conversationLifecycle?: ConversationLifecycleOwner,
  conversationReview?: ConversationReviewLifecycleOwner,
  startup?: Pick<ProjectRuntimeStartupResult, "states">,
): Promise<void> {
  const projects = await store.listProjects();
  if (directInput?.project && !projects.some((project) => project.id === directInput.project?.id || project.path === directInput.project?.path)) {
    projects.push(directInput.project);
  }
  const startupByProjectId = new Map(startup?.states.map((state) => [state.project.id, state] as const) ?? []);
  for (const project of projects) {
    if (!existsSync(project.path)) continue;
    let runtime: ProjectRuntimeStartupState | undefined = startupByProjectId.get(project.id);
    try {
      runtime ??= await projectRuntimeCoordinator.resolve(project);
      if (runtime.state !== "ready") continue;
      await reconcileStaleAgentMainAttempts({ project, providerRegistry, runtimeState: runtime });
      await reconcileStaleAgentNativeChildren({ project, providerRegistry });
      const runtimePaths = runtime.resolution.paths;
      await reconcileStaleProviderInputRequests({ runtime: runtimePaths, providerRegistry });
      await conversationContext?.reconcileProject(runtimePaths);
      await conversationFork?.reconcileProject(runtimePaths);
      await conversationTurnQueue?.reconcileProject(runtimePaths);
      await conversationLifecycle?.reconcileProject(runtimePaths);
      await conversationReview?.reconcileProject(runtimePaths);
      const reconcileReceipt = (receipt: Parameters<typeof reconcileRecoveredApprovalDecisions>[1][number]) => (
        reconcileRecoveredApprovalDecisions(project, [receipt])
      );
      await recoverApplyApprovalReceipts(project, true, reconcileReceipt);
      await recoverIntegrationCheckApprovalReceipts(project, true, reconcileReceipt);
      await recoverDiscardApprovalReceipts(project, true, reconcileReceipt);
      await recoverSpecTestApprovalReceipts(project, reconcileReceipt);
    } catch {
      projectRuntimeCoordinator.markUnavailable?.(project, {
        code: "project-recovery-failed",
        summary: "这个项目的协作配置需要处理。",
        recovery: "请检查项目协作配置，然后重新启动 Beaver Code。",
      });
    }
  }
}

async function handleRequest(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const desktopHost = context.desktopHost;
    let endOperation: (() => void) | undefined;
    if (desktopHost) {
      assertDesktopSession(request, desktopHost.sessionToken, desktopHost.cookieName);
      endOperation = await desktopHost.beginOperation?.();
    }
    try {
      await handleApi(context, request, response, url);
    } finally {
      endOperation?.();
    }
    return;
  }
  await serveStatic(context.staticRoot, url.pathname, response);
}
