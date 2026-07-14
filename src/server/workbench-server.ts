import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ProjectRegistryStore } from "../registry/store.js";
import { recoverPendingApplyTransactions } from "../apply/manager.js";
import { recoverChangeCloseTransactions } from "../change/manager.js";
import {
  dispatchChangeCloseOutbox,
  recoverExpiredAgentTasks,
  startBackgroundWorker,
  runCodexMaintenanceAssignment,
  type BackgroundWorkerHandle,
} from "../agent-task/manager.js";
import { parseHarnessEngineeringAssignment } from "../agent-task/harness-engineering-contract.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { resolveValidationProfile } from "../validation/profiles.js";
import type { WorkbenchProjectInput } from "../workbench/manager.js";
import { forwardCodexRealtimeEvent } from "../workbench/codex-live-events.js";
import { publishProjectLiveEvent } from "../workbench/project-live-events.js";
import { TerminalRuntime } from "./terminal/terminal-runtime.js";
import { handleApi } from "./workbench/api-router.js";
import { restoreDirectProjectInput } from "./workbench/direct-project.js";
import { sendJson, statusForError } from "./workbench/http.js";
import { defaultStaticRoot, serveStatic } from "./workbench/static.js";
import type { WorkbenchServeOptions, WorkbenchServerContext, WorkbenchServerHandle } from "./workbench/types.js";

export type { WorkbenchServeOptions, WorkbenchServerHandle } from "./workbench/types.js";
export { executeWorkbenchAction } from "./workbench/actions.js";
export { buildNativeFolderDialogCommand, openNativeFolderDialog } from "./workbench/native-dialog.js";

export async function startWorkbenchServer(input: WorkbenchProjectInput | null = null, options: WorkbenchServeOptions = {}): Promise<WorkbenchServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4317;
  const staticRoot = options.staticRoot ?? defaultStaticRoot();
  const store = options.store ?? new ProjectRegistryStore();
  const terminalRuntime = options.terminalRuntime ?? new TerminalRuntime();
  const restoredInput = await restoreDirectProjectInput(input, store);
  await recoverWorkbenchProjects(store, restoredInput);
  const workers = await startProjectBackgroundWorkers(store, restoredInput, options);
  const context: WorkbenchServerContext = {
    input: restoredInput,
    staticRoot,
    store,
    terminalRuntime,
  };
  const server = createServer((request, response) => {
    handleRequest(context, request, response).catch((error: unknown) => {
      sendJson(response, statusForError(error), { error: error instanceof Error ? error.message : String(error) });
    });
  });
  server.on("close", () => {
    void Promise.all(workers.map((worker) => worker.drain())).finally(() => terminalRuntime.cleanup());
  });
  await new Promise<void>((resolvePromise) => server.listen(port, host, resolvePromise));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${host}:${actualPort}`,
    async close() {
      await Promise.all(workers.map((worker) => worker.drain()));
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      terminalRuntime.cleanup();
    },
  };
}

async function startProjectBackgroundWorkers(
  store: ProjectRegistryStore,
  directInput: WorkbenchProjectInput | null,
  options: WorkbenchServeOptions,
): Promise<BackgroundWorkerHandle[]> {
  const projects = await store.listProjects();
  if (directInput?.project && !projects.some((project) => project.id === directInput.project?.id || project.path === directInput.project?.path)) {
    projects.push(directInput.project);
  }
  const workers: BackgroundWorkerHandle[] = [];
  for (const project of projects) {
    const memory = await resolveProjectMemory(project);
    const worker = startBackgroundWorker(memory, project, {
      ...options.backgroundWorker,
      enabled: options.backgroundWorker?.enabled ?? true,
      assignmentFactory: options.backgroundWorker?.assignmentFactory ?? ((task, targetProject) => createServerHarnessAssignment(memory, task, targetProject)),
      runAssignment: options.backgroundWorker?.runAssignment ?? (async ({ task, assignment, signal }) =>
        runCodexMaintenanceAssignment(memory, project, assignment, signal, (event) =>
          forwardCodexRealtimeEvent(event, { emit: (liveEvent) => publishProjectLiveEvent(project.id, liveEvent) }), {
            taskId: task.id,
            conversationId: task.conversationId,
            changeId: task.changeId,
          })),
    });
    workers.push(worker);
    await worker.poll();
  }
  return workers;
}

async function createServerHarnessAssignment(
  memory: import("../types/index.js").ResolvedMemory,
  task: import("../types/index.js").AgentTask,
  project: import("../types/index.js").ManagedProject,
) {
  const mode = task.roleId.startsWith("memory-maintenance-agent:")
    ? "maintain-assigned-closeout"
    : task.roleId === "documentation-agent"
      ? "maintain-assigned-closeout"
    : task.roleId.startsWith("harness-evolution-agent:")
      ? "evolve-assigned-window"
      : null;
  if (!mode) throw new Error(`Unsupported maintenance-policy AgentTask role: ${task.roleId}.`);
  const windowHash = task.inputArtifacts.find((ref) => ref.startsWith("window-sha256:"))?.slice("window-sha256:".length);
  const requiredVerification = await resolveMaintenanceVerification(memory);
  return parseHarnessEngineeringAssignment({
    mode,
    taskId: task.id,
    projectRoot: project.path,
    memoryRoot: memory.memoryRoot,
    evidenceRefs: task.inputArtifacts.length > 0 ? task.inputArtifacts : [`agent-task:${task.id}`],
    ...(mode === "evolve-assigned-window"
      ? { sourceWindow: { hash: windowHash ?? task.id, evidenceRefs: task.inputArtifacts } }
      : {}),
    requiredVerification,
  });
}

async function resolveMaintenanceVerification(memory: import("../types/index.js").ResolvedMemory) {
  try {
    const profile = await resolveValidationProfile(memory);
    return profile.commands.map(({ name, command }) => ({ name, command }));
  } catch {
    return [
      ["lint-ecl", join(memory.scriptsRoot, "lint-ecl.ps1")],
      ["lint-encoding", join(memory.scriptsRoot, "lint-encoding.ps1")],
    ].filter(([, path]) => existsSync(path)).map(([name, path]) => ({
      name,
      command: ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path],
    }));
  }
}

export async function recoverWorkbenchProjects(store: ProjectRegistryStore, directInput: WorkbenchProjectInput | null): Promise<void> {
  const projects = await store.listProjects();
  if (directInput?.project && !projects.some((project) => project.id === directInput.project?.id || project.path === directInput.project?.path)) {
    projects.push(directInput.project);
  }
  for (const project of projects) {
    await recoverPendingApplyTransactions(project);
    await recoverChangeCloseTransactions(project);
    const memory = await resolveProjectMemory(project);
    await dispatchChangeCloseOutbox(memory);
    await recoverExpiredAgentTasks(memory);
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
