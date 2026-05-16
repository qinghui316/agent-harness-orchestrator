import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyWorktree } from "../apply/manager.js";
import { acceptAudit } from "../audit/manager.js";
import { closeChange } from "../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal } from "../change/proposals.js";
import { resolveExistingDirectory } from "../fs/path.js";
import { initHarness } from "../harness/init.js";
import { getProjectStatus } from "../project/status.js";
import { ProjectRegistryStore } from "../registry/store.js";
import { acceptSpecTestProposal } from "../spec-test/proposal.js";
import {
  createWorkbenchTopic,
  getWorkbenchActionEvents,
  listTopicMessages,
  postTopicMessage,
  recordWorkbenchDecision,
  runWorkbenchWorkflowAction,
  type TopicMessageInput,
  type WorkbenchWorkflowActionRequest,
} from "../workbench/chat.js";
import {
  getWorkbenchSnapshot,
  getWorkbenchStream,
  getWorkbenchTopic,
  listWorkbenchApprovals,
  listWorkbenchTopics,
  type WorkbenchApprovalAction,
  type WorkbenchProjectInput,
} from "../workbench/manager.js";
import type { ManagedProject, MemoryMode } from "../types/index.js";

export interface WorkbenchServeOptions {
  host?: string;
  port?: number;
  staticRoot?: string;
  store?: ProjectRegistryStore;
}

export interface WorkbenchServerHandle {
  server: Server;
  url: string;
}

interface WorkbenchActionRequest {
  action?: WorkbenchApprovalAction;
  actionType?: WorkbenchWorkflowActionRequest["actionType"];
  changeId?: string;
  prompt?: string;
  proposalId?: string;
  worktreeId?: string;
  confirm?: boolean;
  feedback?: string;
  options?: {
    commit?: boolean;
    message?: string;
  };
}

interface WorkbenchServerContext {
  input: WorkbenchProjectInput | null;
  staticRoot: string;
  store: ProjectRegistryStore;
}

interface AddExistingProjectRequest {
  path?: string;
  name?: string;
  confirm?: boolean;
}

interface CreateNewProjectRequest {
  parentPath?: string;
  name?: string;
  git?: boolean;
  readme?: boolean;
  initialCommit?: boolean;
  confirm?: boolean;
}

interface InitProjectHarnessRequest {
  memoryMode?: MemoryMode;
  confirm?: boolean;
}

interface CreateTopicRequest {
  title?: string;
  body?: string;
  confirm?: boolean;
}

interface TopicMessageRequest {
  text?: string;
  message?: string;
  mode?: TopicMessageInput["mode"];
}

interface FolderDialogResult {
  path: string | null;
  canceled: boolean;
  supported: boolean;
  error?: string;
}

interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

const allowedActionIds = new Set([
  "change.spec.accept",
  "change.plan.accept",
  "spec-test.proposal.accept-all-existing",
  "audit.accept",
  "worktree.apply",
  "change.close",
]);

export async function startWorkbenchServer(input: WorkbenchProjectInput | null = null, options: WorkbenchServeOptions = {}): Promise<WorkbenchServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4317;
  const staticRoot = options.staticRoot ?? defaultStaticRoot();
  const context: WorkbenchServerContext = { input, staticRoot, store: options.store ?? new ProjectRegistryStore() };
  const server = createServer((request, response) => {
    handleRequest(context, request, response).catch((error: unknown) => {
      sendJson(response, statusForError(error), { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolvePromise) => server.listen(port, host, resolvePromise));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, url: `http://${host}:${actualPort}` };
}

async function handleRequest(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await handleApi(context, request, response, url);
    return;
  }
  await serveStatic(context.staticRoot, url.pathname, response);
}

async function handleApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method !== "GET") {
    assertLocalWorkbenchRequest(request);
  }

  const projectWorkbench = matchProjectWorkbenchRoute(url.pathname);
  if (projectWorkbench) {
    const input = await resolveProjectInput(context.store, projectWorkbench.projectId);
    await handleProjectWorkbenchApi(input, request, response, projectWorkbench.rest, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/app/status") {
    sendJson(response, 200, { mode: context.input ? "project" : "app", directProjectId: context.input?.project?.id ?? null });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/projects") {
    sendJson(response, 200, { projects: await listProjectStatuses(context.store) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/projects") {
    sendJson(response, 200, await addExistingProject(context.store, await readJsonBody<AddExistingProjectRequest>(request)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/projects/new") {
    sendJson(response, 200, await createNewProject(context.store, await readJsonBody<CreateNewProjectRequest>(request)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/dialog/open-folder") {
    sendJson(response, 200, await openNativeFolderDialog());
    return;
  }
  const initMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/harness\/init$/);
  if (request.method === "POST" && initMatch?.[1]) {
    sendJson(response, 200, await initProjectHarness(context.store, decodeURIComponent(initMatch[1]), await readJsonBody<InitProjectHarnessRequest>(request)));
    return;
  }

  const input = context.input;
  if (request.method === "GET" && url.pathname === "/api/workbench/snapshot") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchSnapshot(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/workbench/topics") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await listWorkbenchTopics(input));
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/topics/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchTopic(input, decodeURIComponent(url.pathname.slice("/api/workbench/topics/".length))));
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/stream/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchStream(input, decodeURIComponent(url.pathname.slice("/api/workbench/stream/".length))));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/workbench/approvals") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await listWorkbenchApprovals(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/actions") {
    assertDirectProjectInput(input);
    const result = await executeWorkbenchAction(input, await readJsonBody<WorkbenchActionRequest>(request));
    sendJson(response, 200, result);
    return;
  }
  sendJson(response, 404, { error: "Not found." });
}

async function handleProjectWorkbenchApi(input: WorkbenchProjectInput, request: IncomingMessage, response: ServerResponse, rest: string, url: URL): Promise<void> {
  if (request.method === "GET" && rest === "snapshot") {
    sendJson(response, 200, await getWorkbenchSnapshot(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return;
  }
  if (request.method === "GET" && rest === "topics") {
    sendJson(response, 200, await listWorkbenchTopics(input));
    return;
  }
  if (request.method === "POST" && rest === "topics") {
    assertRegisteredProject(input);
    const topic = await createWorkbenchTopic(input.project, await readCreateTopicBody(request));
    sendJson(response, 200, { topic, snapshot: await getWorkbenchSnapshot(input, { topicId: topic.changeId }) });
    return;
  }
  const topicMessagesMatch = rest.match(/^topics\/([^/]+)\/messages(?:\/stream)?$/);
  if (topicMessagesMatch?.[1]) {
    assertRegisteredProject(input);
    const changeId = decodeURIComponent(topicMessagesMatch[1]);
    if (rest.endsWith("/stream")) {
      await sendTopicMessageReplay(input.project, changeId, response);
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, { messages: await listTopicMessages(input.project, changeId) });
      return;
    }
    if (request.method === "POST") {
      const message = await readJsonBody<TopicMessageRequest>(request);
      if (typeof (message.message ?? message.text) !== "string" || (message.message ?? message.text ?? "").trim() === "") {
        const error = new Error("Message text is required.");
        error.name = "BadRequest";
        throw error;
      }
      const result = await postTopicMessage(input.project, changeId, message);
      sendJson(response, 200, { result, messages: await listTopicMessages(input.project, changeId), snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }) });
      return;
    }
  }
  if (request.method === "GET" && rest.startsWith("topics/")) {
    sendJson(response, 200, await getWorkbenchTopic(input, decodeURIComponent(rest.slice("topics/".length))));
    return;
  }
  if (request.method === "GET" && rest.startsWith("stream/")) {
    sendJson(response, 200, await getWorkbenchStream(input, decodeURIComponent(rest.slice("stream/".length))));
    return;
  }
  if (request.method === "GET" && rest === "approvals") {
    sendJson(response, 200, await listWorkbenchApprovals(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return;
  }
  if (request.method === "POST" && rest === "actions") {
    sendJson(response, 200, await executeWorkbenchAction(input, await readJsonBody<WorkbenchActionRequest>(request)));
    return;
  }
  const actionEventsMatch = rest.match(/^actions\/([^/]+)\/events$/);
  if (request.method === "GET" && actionEventsMatch?.[1]) {
    assertRegisteredProject(input);
    await sendActionEventReplay(input.project, decodeURIComponent(actionEventsMatch[1]), response);
    return;
  }
  const actionMatch = rest.match(/^actions\/([^/]+)$/);
  if (request.method === "GET" && actionMatch?.[1]) {
    assertRegisteredProject(input);
    sendJson(response, 200, { events: await getWorkbenchActionEvents(input.project, decodeURIComponent(actionMatch[1])) });
    return;
  }
  sendJson(response, 404, { error: "Not found." });
}

export async function executeWorkbenchAction(input: WorkbenchProjectInput, body: WorkbenchActionRequest): Promise<{ result: unknown; snapshot: unknown }> {
  if (!input.project) throw new Error("Workbench actions require a registered project.");
  if (body.actionType) {
    if (body.actionType !== "chat.ask" && body.confirm !== true) {
      const error = new Error("Mutating Workbench workflow actions require confirm: true.");
      error.name = "Conflict";
      throw error;
    }
    const result = await runWorkbenchWorkflowAction(input.project, {
      actionType: body.actionType,
      changeId: body.changeId,
      prompt: body.prompt,
      proposalId: body.proposalId,
      worktreeId: body.worktreeId,
    });
    return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId }) };
  }
  const action = body.action;
  if (!action || !allowedActionIds.has(action.actionId)) {
    const error = new Error("Unknown or unsupported Workbench action.");
    error.name = "BadRequest";
    throw error;
  }
  if (typeof body.feedback === "string" && body.feedback.trim()) {
    await recordWorkbenchDecision(input.project, {
      id: `feedback:${action.actionId}:${action.args.join(":")}:${Date.now()}`,
      changeId: inferChangeIdFromAction(action, null),
      decisionType: action.actionId,
      status: "requested-changes",
      label: `Requested changes: ${action.label}`,
      summary: "User requested changes instead of accepting this decision.",
      targetId: inferTargetIdFromAction(action, null),
      runId: null,
      artifact: null,
      actionId: action.actionId,
      feedback: body.feedback.trim(),
      payload: { action, feedback: body.feedback.trim() },
    });
    return { result: { status: "requested-changes" }, snapshot: await getWorkbenchSnapshot(input) };
  }
  if (action.mutates && body.confirm !== true) {
    const error = new Error("Mutating Workbench actions require confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  const result = await runAllowlistedAction(input.project, action, body.options);
  await recordWorkbenchDecision(input.project, {
    id: `approval:${action.actionId}:${action.args.join(":")}`,
    changeId: inferChangeIdFromAction(action, result),
    decisionType: action.actionId,
    status: "accepted",
    label: action.label,
    summary: `Accepted ${action.label}.`,
    targetId: inferTargetIdFromAction(action, result),
    runId: inferRunIdFromActionResult(result),
    artifact: inferArtifactFromActionResult(result),
    actionId: action.actionId,
    feedback: body.feedback ?? null,
    payload: result,
    completedAt: new Date().toISOString(),
  });
  return { result, snapshot: await getWorkbenchSnapshot(input) };
}

function assertRegisteredProject(input: WorkbenchProjectInput): asserts input is WorkbenchProjectInput & { project: ManagedProject } {
  if (!input.project) throw new Error("This Workbench API requires a registered project.");
}

async function readCreateTopicBody(request: IncomingMessage): Promise<{ title: string; body?: string }> {
  const body = await readJsonBody<CreateTopicRequest>(request);
  if (body.confirm !== true) {
    const error = new Error("Creating a Topic requires confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  if (typeof body.title !== "string" || body.title.trim() === "") {
    const error = new Error("Topic title is required.");
    error.name = "BadRequest";
    throw error;
  }
  return { title: body.title.trim(), body: body.body };
}

async function sendTopicMessageReplay(project: ManagedProject, changeId: string, response: ServerResponse): Promise<void> {
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "close" });
  for (const message of await listTopicMessages(project, changeId)) {
    response.write(`event: message\n`);
    response.write(`data: ${JSON.stringify(message)}\n\n`);
  }
  response.end();
}

async function sendActionEventReplay(project: ManagedProject, actionRunId: string, response: ServerResponse): Promise<void> {
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "close" });
  for (const event of await getWorkbenchActionEvents(project, actionRunId)) {
    response.write(`event: action\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

function matchProjectWorkbenchRoute(pathname: string): { projectId: string; rest: string } | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/workbench(?:\/(.*))?$/);
  if (!match?.[1]) return null;
  return { projectId: decodeURIComponent(match[1]), rest: match[2] ?? "snapshot" };
}

async function resolveProjectInput(store: ProjectRegistryStore, projectId: string): Promise<WorkbenchProjectInput> {
  const project = await store.resolveProject(projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  return { project, path: project.path };
}

function assertDirectProjectInput(input: WorkbenchProjectInput | null): asserts input is WorkbenchProjectInput {
  if (!input) {
    const error = new Error("No project is selected. Use /api/projects/:id/workbench/* or start with `aho workbench serve <project>`.");
    error.name = "BadRequest";
    throw error;
  }
}

async function listProjectStatuses(store: ProjectRegistryStore): Promise<unknown[]> {
  const projects = await store.listProjects();
  return Promise.all(projects.map(async (project) => getProjectStatus(project, project.path)));
}

async function addExistingProject(store: ProjectRegistryStore, body: AddExistingProjectRequest): Promise<{ project: ManagedProject; status: unknown }> {
  assertConfirmed(body.confirm);
  if (typeof body.path !== "string" || body.path.trim() === "") {
    const error = new Error("Project path is required.");
    error.name = "BadRequest";
    throw error;
  }
  const path = await resolveExistingDirectory(body.path);
  const project = await store.addProject(path, body.name);
  return { project, status: await getProjectStatus(project, project.path) };
}

async function createNewProject(store: ProjectRegistryStore, body: CreateNewProjectRequest): Promise<{ project: ManagedProject; status: unknown; createdPath: string }> {
  assertConfirmed(body.confirm);
  if (typeof body.parentPath !== "string" || body.parentPath.trim() === "") {
    const error = new Error("Parent path is required.");
    error.name = "BadRequest";
    throw error;
  }
  const name = assertSafeDirectoryName(body.name);
  const parent = await resolveExistingDirectory(body.parentPath);
  const projectPath = resolve(parent, name);
  if (!isWithinDirectory(projectPath, parent) || existsSync(projectPath)) {
    const error = new Error(`Project path already exists or is unsafe: ${projectPath}`);
    error.name = "Conflict";
    throw error;
  }
  await mkdir(projectPath, { recursive: false });
  if (body.readme !== false || body.initialCommit === true) {
    await writeFile(join(projectPath, "README.md"), `# ${name}\n`, "utf8");
  }
  if (body.git === true || body.initialCommit === true) {
    await runGit(projectPath, ["init"]);
  }
  if (body.initialCommit === true) {
    await runGit(projectPath, ["add", "."]);
    await runGit(projectPath, ["-c", "user.name=AHO", "-c", "user.email=aho@example.local", "commit", "-m", "Initial commit"]);
  }
  const project = await store.addProject(projectPath, name);
  return { project, createdPath: projectPath, status: await getProjectStatus(project, project.path) };
}

async function initProjectHarness(store: ProjectRegistryStore, projectId: string, body: InitProjectHarnessRequest): Promise<{ result: unknown; status: unknown }> {
  assertConfirmed(body.confirm);
  const project = await store.resolveProject(projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  const memoryMode = parseMemoryMode(body.memoryMode);
  const result = await initHarness(project, { memoryMode });
  return { result, status: await getProjectStatus(project, project.path) };
}

function assertConfirmed(value: unknown): void {
  if (value !== true) {
    const error = new Error("Mutating Workbench project actions require confirm: true.");
    error.name = "Conflict";
    throw error;
  }
}

function assertLocalWorkbenchRequest(request: IncomingMessage): void {
  const host = request.headers.host;
  if (!isLocalHostHeader(host)) {
    const error = new Error("Workbench API requests must target a local host.");
    error.name = "Forbidden";
    throw error;
  }

  const origin = request.headers.origin;
  if (typeof origin === "string" && origin.length > 0 && !isAllowedOrigin(origin, host)) {
    const error = new Error("Cross-origin Workbench API request rejected.");
    error.name = "Forbidden";
    throw error;
  }
}

function isAllowedOrigin(origin: string, hostHeader: string | undefined): boolean {
  try {
    const parsed = new URL(origin);
    return isLocalHostname(parsed.hostname) && normalizeHostHeader(parsed.host) === normalizeHostHeader(hostHeader);
  } catch {
    return false;
  }
}

function isLocalHostHeader(hostHeader: string | undefined): boolean {
  const normalized = normalizeHostHeader(hostHeader);
  if (!normalized) return false;
  const hostname = normalized.startsWith("[") ? normalized.slice(1, normalized.indexOf("]")) : normalized.split(":")[0] ?? "";
  return isLocalHostname(hostname);
}

function normalizeHostHeader(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isLocalHostname(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function assertSafeDirectoryName(value: unknown): string {
  if (typeof value !== "string") {
    const error = new Error("Project name is required.");
    error.name = "BadRequest";
    throw error;
  }
  const name = value.trim();
  if (!name || name === "." || name === ".." || /[<>:"/\\|?*]/.test(name) || hasControlCharacter(name)) {
    const error = new Error("Project name is not a safe local directory name.");
    error.name = "BadRequest";
    throw error;
  }
  return name;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32);
}

function parseMemoryMode(value: unknown): Exclude<MemoryMode, "remote"> {
  if (value === undefined || value === null || value === "external-local") return "external-local";
  if (value === "repo-local") return "repo-local";
  const error = new Error("Unsupported memory mode. Use repo-local or external-local.");
  error.name = "BadRequest";
  throw error;
}

function inferTargetIdFromAction(action: WorkbenchApprovalAction, result: unknown): string | null {
  if (action.actionId === "change.close" && isRecord(result) && isRecord(result.change) && typeof result.change.id === "string") {
    return result.change.id;
  }
  if (action.actionId === "change.spec.accept" || action.actionId === "change.plan.accept") return action.args[3] ?? null;
  if (action.actionId === "spec-test.proposal.accept-all-existing") return action.args[3] ?? null;
  if (action.actionId === "audit.accept") return action.args[2] ?? null;
  if (action.actionId === "worktree.apply") return action.args[2] ?? null;
  if (action.actionId === "change.close") return action.args[1] ?? null;
  return null;
}

function inferChangeIdFromAction(action: WorkbenchApprovalAction, result: unknown): string | null {
  if (isRecord(result) && isRecord(result.proposal) && typeof result.proposal.changeId === "string") return result.proposal.changeId;
  if (isRecord(result) && isRecord(result.audit) && typeof result.audit.changeId === "string") return result.audit.changeId;
  if (isRecord(result) && isRecord(result.apply) && typeof result.apply.changeId === "string") return result.apply.changeId;
  if (isRecord(result) && isRecord(result.change) && typeof result.change.id === "string") return result.change.id;
  if (isRecord(result) && typeof result.changeId === "string") return result.changeId;
  return null;
}

function inferRunIdFromActionResult(result: unknown): string | null {
  if (isRecord(result) && isRecord(result.run) && typeof result.run.id === "string") return result.run.id;
  if (isRecord(result) && isRecord(result.proposal) && typeof result.proposal.runId === "string") return result.proposal.runId;
  if (isRecord(result) && isRecord(result.audit) && typeof result.audit.runId === "string") return result.audit.runId;
  if (isRecord(result) && typeof result.runId === "string") return result.runId;
  return null;
}

function inferArtifactFromActionResult(result: unknown): string | null {
  if (isRecord(result) && typeof result.specPath === "string") return result.specPath;
  if (isRecord(result) && typeof result.planPath === "string") return result.planPath;
  if (isRecord(result) && typeof result.reviewPath === "string") return result.reviewPath;
  if (isRecord(result) && typeof result.archivePath === "string") return result.archivePath;
  if (isRecord(result) && isRecord(result.run) && isRecord(result.run.artifacts)) {
    const artifacts = result.run.artifacts;
    if (typeof artifacts.apply === "string") return artifacts.apply;
    if (typeof artifacts.directory === "string") return artifacts.directory;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function openNativeFolderDialog(): Promise<FolderDialogResult> {
  const command = buildNativeFolderDialogCommand();
  if (!command) {
    return { path: null, canceled: false, supported: false, error: "Native folder picker is not supported on this platform." };
  }

  const result = await execFileBuffered(command.command, command.args, 120_000);
  if (result.error) {
    return { path: null, canceled: true, supported: true, error: result.error };
  }
  const selectedPath = result.stdout.trim().replace(/\/$/, "");
  return { path: selectedPath || null, canceled: selectedPath.length === 0, supported: true };
}

export function buildNativeFolderDialogCommand(currentPlatform = platform()): NativeFolderDialogCommand | null {
  if (currentPlatform === "win32") return buildWindowsFolderDialogCommand();
  if (currentPlatform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", 'POSIX path of (choose folder with prompt "Select an AHO project folder")'],
    };
  }
  if (currentPlatform === "linux") {
    return {
      command: "zenity",
      args: ["--file-selection", "--directory", "--title=Select an AHO project folder"],
    };
  }
  return null;
}

export function buildWindowsFolderDialogCommand(): NativeFolderDialogCommand {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$owner = New-Object System.Windows.Forms.Form;",
    "$owner.Text = 'Agent Harness Orchestrator';",
    "$owner.TopMost = $true;",
    "$owner.ShowInTaskbar = $true;",
    "$owner.StartPosition = 'CenterScreen';",
    "$owner.Width = 1;",
    "$owner.Height = 1;",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;",
    "$dialog.Description = 'Select an AHO project folder';",
    "$dialog.ShowNewFolderButton = $false;",
    "try {",
    "  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }",
    "} finally {",
    "  $owner.Dispose();",
    "}",
  ].join(" ");
  return { command: "powershell.exe", args: ["-NoProfile", "-Sta", "-Command", script] };
}

async function execFileBuffered(command: string, args: string[], timeout: number): Promise<{ stdout: string; error?: string }> {
  return new Promise((resolvePromise) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ stdout: typeof stdout === "string" ? stdout : "", error: typeof stderr === "string" && stderr.trim() ? stderr.trim() : error.message });
        return;
      }
      resolvePromise({ stdout: typeof stdout === "string" ? stdout : "" });
    });
  });
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("git", args, { cwd, stdio: "pipe" });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const error = new Error(`git ${args.join(" ")} failed with exit code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`);
      error.name = "BadRequest";
      reject(error);
    });
  });
}

async function runAllowlistedAction(project: NonNullable<WorkbenchProjectInput["project"]>, action: WorkbenchApprovalAction, options: WorkbenchActionRequest["options"]): Promise<unknown> {
  const args = action.args;
  switch (action.actionId) {
    case "change.spec.accept":
      assertArgs(action, "change", ["spec", "accept"], 4);
      return acceptSpecProposal(project, args[3]);
    case "change.plan.accept":
      assertArgs(action, "change", ["plan", "accept"], 4);
      return acceptPlanProposal(project, args[3]);
    case "spec-test.proposal.accept-all-existing":
      assertArgs(action, "spec-test", ["proposal", "accept"], 5);
      return acceptSpecTestProposal(project, args[3], { allExisting: true });
    case "audit.accept":
      assertArgs(action, "audit", ["accept"], 3);
      return acceptAudit(project, args[2]);
    case "worktree.apply":
      assertArgs(action, "worktree", ["apply"], 3);
      return applyWorktree(project, args[2], { commit: options?.commit === true, message: options?.message });
    case "change.close":
      assertArgs(action, "change", ["close"], 2);
      return closeChange(project);
    default:
      throw new Error("Unsupported Workbench action.");
  }
}

function assertArgs(action: WorkbenchApprovalAction, command: string, prefix: string[], minLength: number): void {
  if (action.command !== command || action.args.length < minLength || !prefix.every((part, index) => action.args[index] === part)) {
    const error = new Error(`Invalid args for action ${action.actionId}.`);
    error.name = "BadRequest";
    throw error;
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {} as T;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch (cause) {
    const error = new Error(`Invalid JSON request body: ${cause instanceof Error ? cause.message : String(cause)}`);
    error.name = "BadRequest";
    throw error;
  }
}

async function serveStatic(staticRoot: string, pathname: string, response: ServerResponse): Promise<void> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(staticRoot, `.${safePath}`);
  if (!isWithinDirectory(filePath, staticRoot)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }
  const target = existsSync(filePath) ? filePath : resolve(staticRoot, "index.html");
  if (!isWithinDirectory(target, staticRoot) || !existsSync(target)) {
    sendJson(response, 404, { error: "Workbench web build not found. Run `npm run build` first." });
    return;
  }
  const stats = await stat(target);
  if (!stats.isFile()) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypeFor(target), "Cache-Control": "no-store" });
  response.end(await readFile(target));
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload, null, 2));
}

function statusForError(error: unknown): number {
  if (error instanceof Error && error.name === "BadRequest") return 400;
  if (error instanceof Error && error.name === "Conflict") return 409;
  if (error instanceof Error && error.name === "Forbidden") return 403;
  if (error instanceof Error && error.name === "NotFound") return 404;
  return 500;
}

function isWithinDirectory(path: string, directory: string): boolean {
  const relativePath = relative(resolve(directory), path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(":"));
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function defaultStaticRoot(): string {
  return join(fileURLToPath(new URL("../../dist", import.meta.url)), "web");
}
