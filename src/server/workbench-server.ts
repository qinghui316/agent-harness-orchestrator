import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ProjectRegistryStore } from "../registry/store.js";
import { recoverApplyApprovalReceipts, recoverDiscardApprovalReceipts } from "../apply/manager.js";
import { recoverIntegrationCheckApprovalReceipts } from "../integration-check/manager.js";
import { recoverSpecTestApprovalReceipts } from "../spec-test/proposal.js";
import type { WorkbenchProjectInput } from "../workbench/read-model-types.js";
import type { ManagedProject } from "../types/index.js";
import { TerminalRuntime } from "./terminal/terminal-runtime.js";
import { handleApi } from "./workbench/api-router.js";
import { restoreDirectProjectInput } from "./workbench/direct-project.js";
import { sendJson, statusForError } from "./workbench/http.js";
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
  const turnRouter = createConversationTurnRouter({
    skillContext,
    providerRegistry,
    projectRuntimeCoordinator,
    turnControl,
  });
  await projectRuntimeCoordinator.reconcileStartup();
  const restoredInput = await restoreDirectProjectInput(input, store);
  const composedInput = restoredInput
    ? {
      ...restoredInput,
      runtimeStateResolver: (project: ManagedProject) => projectRuntimeCoordinator.resolve(project),
      turnControlStateResolver: (projectId: string, conversationId: string, attemptId?: string) => turnControl.state(projectId, conversationId, attemptId),
    }
    : restoredInput;
  await recoverWorkbenchProjects(store, composedInput, projectRuntimeCoordinator, providerRegistry);
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
  };
  const server = createServer((request, response) => {
    handleRequest(context, request, response).catch((error: unknown) => {
      sendJson(response, statusForError(error), { error: error instanceof Error ? error.message : String(error) });
    });
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
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await cleanupRuntime();
    },
  };
}

export async function recoverWorkbenchProjects(
  store: ProjectRegistryStore,
  directInput: WorkbenchProjectInput | null,
  projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve"> = new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  }),
  providerRegistry = defaultProviderRegistry,
): Promise<void> {
  const projects = await store.listProjects();
  if (directInput?.project && !projects.some((project) => project.id === directInput.project?.id || project.path === directInput.project?.path)) {
    projects.push(directInput.project);
  }
  for (const project of projects) {
    const runtime = await projectRuntimeCoordinator.resolve(project);
    await reconcileStaleAgentMainAttempts({ project, providerRegistry, runtimeState: runtime });
    await reconcileStaleAgentNativeChildren({ project, providerRegistry });
    const runtimePaths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
    await reconcileStaleProviderInputRequests({ runtime: runtimePaths, providerRegistry });
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
    await handleApi(context, request, response, url);
    return;
  }
  await serveStatic(context.staticRoot, url.pathname, response);
}
