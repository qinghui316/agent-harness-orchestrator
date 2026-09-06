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
import { ProjectRuntimeCoordinator, type ProjectRuntimeCoordinatorPort } from "../project-runtime/coordinator.js";
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
    reviewOwner: conversationReview,
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
  await projectRuntimeCoordinator.reconcileStartup();
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
  await recoverWorkbenchProjects(store, composedInput, projectRuntimeCoordinator, providerRegistry, conversationContext, conversationFork, conversationTurnQueue, conversationLifecycle, conversationReview);
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
  let acceptingRequests = true;
  const server = createServer((request, response) => {
    responses.add(response);
    response.once("close", () => responses.delete(response));
    if (!acceptingRequests) {
      sendJson(response, 503, { error: "Beaver Code is closing." });
      return;
    }
    handleRequest(context, request, response).catch((error: unknown) => {
      sendJson(response, statusForError(error), { error: error instanceof Error ? error.message : String(error) });
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  let runtimeCleanup: Promise<void> | null = null;
  const cleanupRuntime = (): Promise<void> => runtimeCleanup ??= (async () => {
    await providerRegistry.shutdownAll("Workbench server stopped.");
    terminalRuntime.cleanup();
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
      const closing = (async () => {
        await cleanupRuntime();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      })();
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          closing,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Workbench shutdown deadline exceeded.")), Math.max(1, deadlineMs));
          }),
        ]);
      } catch (cause) {
        for (const socket of sockets) socket.destroy();
        throw cause;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
  };
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
  if (activeTurnCount + activeTerminalCount > 0) {
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
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve"> = new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  }),
  providerRegistry = defaultProviderRegistry,
  conversationContext?: ConversationContextLifecycleOwner,
  conversationFork?: ConversationForkLifecycleOwner,
  conversationTurnQueue?: ConversationTurnQueueOwner,
  conversationLifecycle?: ConversationLifecycleOwner,
  conversationReview?: ConversationReviewLifecycleOwner,
): Promise<void> {
  const projects = await store.listProjects();
  if (directInput?.project && !projects.some((project) => project.id === directInput.project?.id || project.path === directInput.project?.path)) {
    projects.push(directInput.project);
  }
  for (const project of projects) {
    if (!existsSync(project.path)) continue;
    const runtime = await projectRuntimeCoordinator.resolve(project);
    await reconcileStaleAgentMainAttempts({ project, providerRegistry, runtimeState: runtime });
    await reconcileStaleAgentNativeChildren({ project, providerRegistry });
    const runtimePaths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
    await reconcileStaleProviderInputRequests({ runtime: runtimePaths, providerRegistry });
    await conversationContext?.reconcileProject(runtimePaths);
    await conversationFork?.reconcileProject(runtimePaths);
    await conversationTurnQueue?.reconcileProject(runtimePaths);
    await conversationLifecycle?.reconcileProject(runtimePaths);
    await conversationReview?.reconcileProject(runtimePaths);
    if (runtime.state !== "ready") continue;
    const reconcileReceipt = (receipt: Parameters<typeof reconcileRecoveredApprovalDecisions>[1][number]) => (
      reconcileRecoveredApprovalDecisions(project, [receipt])
    );
    await recoverApplyApprovalReceipts(project, true, reconcileReceipt);
    await recoverIntegrationCheckApprovalReceipts(project, true, reconcileReceipt);
    await recoverDiscardApprovalReceipts(project, true, reconcileReceipt);
    await recoverSpecTestApprovalReceipts(project, reconcileReceipt);
  }
}

async function handleRequest(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const desktopHost = context.desktopHost;
    if (desktopHost) {
      assertDesktopSession(request, desktopHost.sessionToken, desktopHost.cookieName);
      if ((request.method ?? "GET").toUpperCase() !== "GET") await desktopHost.beforeSideEffect?.();
    }
    await handleApi(context, request, response, url);
    return;
  }
  await serveStatic(context.staticRoot, url.pathname, response);
}
