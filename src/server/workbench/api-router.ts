import type { IncomingMessage, ServerResponse } from "node:http";
import { openNativeFolderDialog } from "./native-dialog.js";
import { matchProjectWorkbenchRoute } from "./routes.js";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { getRuntimeDiagnostics } from "./runtime-diagnostics.js";
import { getRuntimeActivityLog } from "./runtime-activity-log.js";
import { defaultProviderRegistry } from "../../provider-runtime/index.js";
import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import { listProjectFileChildren, readProjectFilePreview, searchProjectFiles } from "../../workbench/file-references.js";
import { resolveWorkspaceResource, type WorkspaceResourceTarget } from "../../workbench/workspace-resources.js";
import { createTopicAttachment, deleteTopicAttachment } from "../../workbench/attachments.js";
import { getProjectGitCommitDetail, getProjectGitCommitDiff, getProjectGitDiff, getProjectGitHistory, getProjectGitStatus } from "../../workbench/git-panel.js";
import { addSkillRoot, listSkillRoots, listSkills, setSkillEnabled, type SkillCatalogResult } from "../../skill/catalog.js";
import { getSystemSkillsRoot } from "../../template-source/paths.js";
import type { ManagedProject } from "../../types/index.js";
import { addExistingProject, createNewProject, listProjectStatuses, prepareRegisteredProjectRemoval, removeRegisteredProject } from "./project-admin.js";
import { handleDirectWorkbenchApi } from "./direct-routes.js";
import { handleProjectWorkbenchApi } from "./project-routes.js";
import { handleTerminalApi } from "./terminal-routes.js";
import { assertConfirmed, assertLocalWorkbenchRequest, assertRegisteredProject, readJsonBody, requireProductMode, sendJson } from "./http.js";
import type { AddExistingProjectRequest, CreateNewProjectRequest, RemoveProjectRequest, WorkbenchServerContext } from "./types.js";

export async function handleApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const trackedProjectId = projectIdForTrackedRequest(url.pathname)
    ?? directProjectIdForTrackedRequest(context, url.pathname);
  const lease = trackedProjectId
    ? context.projectRemoval.beginProjectRequest(trackedProjectId, response, {
      stream: isProjectStreamingRequest(url.pathname),
    })
    : null;
  try {
    await handleApiRequest(context, request, response, url);
  } finally {
    lease?.complete();
  }
}

async function handleApiRequest(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method !== "GET") {
    assertLocalWorkbenchRequest(request);
  }

  const projectWorkbench = matchProjectWorkbenchRoute(url.pathname);
  if (projectWorkbench) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, projectWorkbench.projectId);
    await handleProjectWorkbenchApi(context, input, request, response, projectWorkbench.rest, url);
    return;
  }

  if (await handleTerminalApi(context, request, response, url)) return;

  if (request.method === "GET" && url.pathname === "/api/app/status") {
    sendJson(response, 200, { mode: context.input ? "project" : "app", directProjectId: context.input?.project?.id ?? null });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/runtime/diagnostics") {
    sendJson(response, 200, await getRuntimeDiagnostics(context, null));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/providers/capabilities") {
    const productMode = requireProductMode(url.searchParams.get("productMode"));
    const runtimeSummaries = await Promise.all(context.providerRegistry.list().map((provider) => provider.runtimeSummary(null, productMode)));
    sendJson(response, 200, { providers: runtimeSummaries.map((summary) => summary.snapshot), runtimeSummaries });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/providers") {
    sendJson(response, 200, { providers: context.providerRegistry.list().map((provider) => ({ providerId: provider.id, displayName: provider.displayName })) });
    return;
  }
  const globalProviderSurface = url.pathname.match(/^\/api\/providers\/([^/]+)\/(diagnostics|models)$/);
  if (globalProviderSurface?.[1] && globalProviderSurface[2]) {
    const provider = context.providerRegistry.get(decodeURIComponent(globalProviderSurface[1]));
    if (request.method === "GET" && globalProviderSurface[2] === "diagnostics") {
      sendJson(response, 200, await provider.diagnostics(null));
      return;
    }
    if (globalProviderSurface[2] === "models" && (request.method === "GET" || request.method === "POST")) {
      const selected = request.method === "POST" ? (await readJsonBody<{ selectedModel?: string | null }>(request)).selectedModel ?? null : undefined;
      sendJson(response, 200, selected === undefined ? await provider.models.read() : await provider.models.select(selected));
      return;
    }
  }
  if (request.method === "GET" && url.pathname === "/api/projects") {
    sendJson(response, 200, { projects: await listProjectStatuses(context.store, context.input) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/projects") {
    const result = await addExistingProject(
      context.store,
      await readJsonBody<AddExistingProjectRequest>(request),
      context.projectRuntimeCoordinator,
      context.projectRemoval,
    );
    sendJson(response, 200, result);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/projects/new") {
    const result = await createNewProject(
      context.store,
      await readJsonBody<CreateNewProjectRequest>(request),
      context.projectRuntimeCoordinator,
      context.projectRemoval,
    );
    sendJson(response, 200, result);
    return;
  }
  const projectRemovalConfirmationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/removal-confirmation$/);
  if (request.method === "POST" && projectRemovalConfirmationMatch?.[1]) {
    sendJson(response, 200, await prepareRegisteredProjectRemoval(
      context.projectRemoval,
      decodeURIComponent(projectRemovalConfirmationMatch[1]),
    ));
    return;
  }
  const projectRemoveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/remove$/);
  if (request.method === "POST" && projectRemoveMatch?.[1]) {
    const projectId = decodeURIComponent(projectRemoveMatch[1]);
    sendJson(response, 200, await removeRegisteredProject(context.projectRemoval, projectId, await readJsonBody<RemoveProjectRequest>(request)));
    if (context.input?.project?.id === projectId) context.input = null;
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/dialog/open-folder") {
    sendJson(response, 200, await openNativeFolderDialog());
    return;
  }
  const runtimeDiagnosticsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runtime\/diagnostics$/);
  if (request.method === "GET" && runtimeDiagnosticsMatch?.[1]) {
    sendJson(response, 200, await getRuntimeDiagnostics(context, decodeURIComponent(runtimeDiagnosticsMatch[1])));
    return;
  }
  const runtimeActivityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runtime\/activity$/);
  if (request.method === "GET" && runtimeActivityMatch?.[1]) {
    sendJson(response, 200, await getRuntimeActivityLog(context, decodeURIComponent(runtimeActivityMatch[1]), {
      topicId: url.searchParams.get("topicId"),
      limit: Number(url.searchParams.get("limit") ?? undefined),
    }));
    return;
  }
  const providerCapabilitiesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/providers\/capabilities$/);
  if (request.method === "GET" && providerCapabilitiesMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(providerCapabilitiesMatch[1]));
    const productMode = requireProductMode(url.searchParams.get("productMode"));
    const runtimeSummaries = await Promise.all(context.providerRegistry.list().map((provider) => provider.runtimeSummary(input.project, productMode, input.path)));
    sendJson(response, 200, { providers: runtimeSummaries.map((summary) => summary.snapshot), runtimeSummaries });
    return;
  }
  const projectProviderDefaultMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/provider-default$/);
  if (request.method === "POST" && projectProviderDefaultMatch?.[1]) {
    const projectId = decodeURIComponent(projectProviderDefaultMatch[1]);
    const body = await readJsonBody<{ providerId?: string | null }>(request);
    if (body.providerId) context.providerRegistry.get(body.providerId);
    sendJson(response, 200, { project: await context.store.setDefaultProvider(projectId, body.providerId ?? null) });
    return;
  }
  const projectProviderSurface = url.pathname.match(/^\/api\/projects\/([^/]+)\/providers\/([^/]+)\/(diagnostics|models)$/);
  if (projectProviderSurface?.[1] && projectProviderSurface[2] && projectProviderSurface[3]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(projectProviderSurface[1]));
    const provider = context.providerRegistry.get(decodeURIComponent(projectProviderSurface[2]));
    if (request.method === "GET" && projectProviderSurface[3] === "diagnostics") {
      sendJson(response, 200, await provider.diagnostics(input.project, input.path));
      return;
    }
    if (projectProviderSurface[3] === "models" && (request.method === "GET" || request.method === "POST")) {
      const selected = request.method === "POST" ? (await readJsonBody<{ selectedModel?: string | null }>(request)).selectedModel ?? null : undefined;
      sendJson(response, 200, selected === undefined ? await provider.models.read(input.path) : await provider.models.select(selected, input.path));
      return;
    }
  }
  const projectProviderAction = url.pathname.match(/^\/api\/projects\/([^/]+)\/providers\/([^/]+)\/actions\/([^/]+)$/);
  if (request.method === "POST" && projectProviderAction?.[1] && projectProviderAction[2] && projectProviderAction[3]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(projectProviderAction[1]));
    assertRegisteredProject(input);
    assertConfirmed((await readJsonBody<{ confirm?: boolean }>(request)).confirm);
    const provider = context.providerRegistry.get(decodeURIComponent(projectProviderAction[2]));
    sendJson(response, 200, await provider.projectActions.execute(decodeURIComponent(projectProviderAction[3]), input.project, input.path));
    return;
  }
  const fileSearchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/search$/);
  if (request.method === "GET" && fileSearchMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(fileSearchMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project file search requires a selected project." });
      return;
    }
    const limit = Number(url.searchParams.get("limit") ?? undefined);
    sendJson(response, 200, {
      files: await searchProjectFiles(input.project, {
        query: url.searchParams.get("q") ?? "",
        limit,
      }),
    });
    return;
  }
  const attachmentCreateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/attachments$/);
  if (request.method === "POST" && attachmentCreateMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(attachmentCreateMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Composer attachments require a selected project." });
      return;
    }
    try {
      const body = await readJsonBody<{ fileName?: string; mediaType?: string; data?: string }>(request);
      sendJson(response, 200, { attachment: await createTopicAttachment(input.project, body) });
    } catch (error) {
      sendJson(response, error instanceof Error && error.name === "BadRequest" ? 400 : 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  const attachmentDeleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/attachments\/([^/]+)$/);
  if (request.method === "DELETE" && attachmentDeleteMatch?.[1] && attachmentDeleteMatch?.[2]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(attachmentDeleteMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Composer attachments require a selected project." });
      return;
    }
    try {
      sendJson(response, 200, await deleteTopicAttachment(input.project, decodeURIComponent(attachmentDeleteMatch[2])));
    } catch (error) {
      sendJson(response, error instanceof Error && error.name === "BadRequest" ? 400 : 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  const fileChildrenMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/children$/);
  if (request.method === "GET" && fileChildrenMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(fileChildrenMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project file tree requires a selected project." });
      return;
    }
    try {
      sendJson(response, 200, await listProjectFileChildren(input.project, url.searchParams.get("path") ?? ""));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  const workspaceResourceMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/workspace-resources\/resolve$/);
  if (request.method === "POST" && workspaceResourceMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(workspaceResourceMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Workspace resources require a selected project." });
      return;
    }
    try {
      const body = await readJsonBody<{ target?: WorkspaceResourceTarget }>(request);
      if (!body.target) throw new Error("Workspace resource target is required.");
      sendJson(response, 200, await resolveWorkspaceResource({ ...input, project: input.project }, body.target));
    } catch (error) {
      const status = error instanceof Error && error.name === "NotFound" ? 404 : 400;
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  const filePreviewMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/preview$/);
  if (request.method === "GET" && filePreviewMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(filePreviewMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project file preview requires a selected project." });
      return;
    }
    sendJson(response, 200, await readProjectFilePreview(input.project, url.searchParams.get("path") ?? ""));
    return;
  }
  const gitStatusMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/status$/);
  if (request.method === "GET" && gitStatusMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitStatusMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git status requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitStatus(input.project));
    return;
  }
  const gitDiffMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/diff$/);
  if (request.method === "GET" && gitDiffMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitDiffMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git diff requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitDiff(input.project, url.searchParams.get("path") ?? ""));
    return;
  }
  const gitHistoryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/history$/);
  if (request.method === "GET" && gitHistoryMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitHistoryMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git history requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitHistory(input.project, {
      limit: Number.parseInt(url.searchParams.get("limit") ?? "", 10),
      offset: Number.parseInt(url.searchParams.get("offset") ?? "", 10),
      query: url.searchParams.get("query") ?? "",
    }));
    return;
  }
  const gitCommitMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/commit$/);
  if (request.method === "GET" && gitCommitMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitCommitMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git commit requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitCommitDetail(input.project, url.searchParams.get("sha") ?? ""));
    return;
  }
  const gitCommitDiffMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/git\/commit-diff$/);
  if (request.method === "GET" && gitCommitDiffMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(gitCommitDiffMatch[1]));
    if (!input.project) {
      sendJson(response, 400, { error: "Project Git commit diff requires a selected project." });
      return;
    }
    sendJson(response, 200, await getProjectGitCommitDiff(input.project, url.searchParams.get("sha") ?? "", url.searchParams.get("path") ?? ""));
    return;
  }
  const skillRootsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skill-roots$/);
  if (skillRootsMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillRootsMatch[1]));
    assertRegisteredProject(input);
    if (request.method === "GET") {
      const runtime = await context.projectRuntimeCoordinator.requireReady(input.project);
      sendJson(response, 200, { roots: await listSkillRoots(runtime.paths) });
      return;
    }
    if (request.method === "POST") {
      const body = await readJsonBody<{ rootPath?: string }>(request);
      if (!body.rootPath) {
        sendJson(response, 400, { error: "rootPath is required." });
        return;
      }
      const runtime = await context.projectRuntimeCoordinator.requireReady(input.project);
      sendJson(response, 200, { roots: await addSkillRoot(runtime.paths, body.rootPath) });
      return;
    }
  }
  const skillsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills$/);
  if (skillsMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillsMatch[1]));
    assertRegisteredProject(input);
    if (request.method === "GET") {
      const provider = resolveProjectSkillProvider(input.project, url.searchParams.get("providerId"), context.providerRegistry);
      sendJson(response, 200, catalogResponse(await loadNativeSkillCatalog(context, input.project, provider, false)));
      return;
    }
    if (request.method === "POST") {
      const provider = resolveProjectSkillProvider(input.project, url.searchParams.get("providerId"), context.providerRegistry);
      sendJson(response, 200, catalogResponse(await loadNativeSkillCatalog(context, input.project, provider, true)));
      return;
    }
  }
  const skillEnableMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills\/([^/]+)\/enable$/);
  if (request.method === "POST" && skillEnableMatch?.[1] && skillEnableMatch?.[2]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(skillEnableMatch[1]));
    assertRegisteredProject(input);
    const body = await readJsonBody<{ enabled?: boolean; topic?: string }>(request);
    const provider = resolveProjectSkillProvider(input.project, url.searchParams.get("providerId"), context.providerRegistry);
    const runtime = await context.projectRuntimeCoordinator.requireReady(input.project);
    const catalog = await loadNativeSkillCatalog(context, input.project, provider, false);
    sendJson(response, 200, await setSkillEnabled(
      runtime.paths,
      catalog.snapshot,
      decodeURIComponent(skillEnableMatch[2]),
      { enabled: Boolean(body.enabled), topic: body.topic },
      [runtime.providerInput],
    ));
    return;
  }
  const providerSkillEnableMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills\/([^/]+)\/provider-enable$/);
  if (request.method === "POST" && providerSkillEnableMatch?.[1] && providerSkillEnableMatch[2]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(providerSkillEnableMatch[1]));
    assertRegisteredProject(input);
    const body = await readJsonBody<{ providerId?: string; enabled?: boolean }>(request);
    const provider = resolveProjectSkillProvider(input.project, body.providerId, context.providerRegistry);
    const before = await loadNativeSkillCatalog(context, input.project, provider, false);
    const skillId = decodeURIComponent(providerSkillEnableMatch[2]);
    const skill = before.skills.find((item) => item.skillId === skillId);
    if (!skill) throw new Error(`Unknown native Skill: ${skillId}`);
    if (skill.required || skill.runtimeAssigned) {
      throw new Error(`Skill ${skillId} is assigned by the Runtime and cannot be disabled.`);
    }
    await provider.skills.setEnabled({ projectPath: input.project.path, path: skill.sourcePath, enabled: Boolean(body.enabled) });
    sendJson(response, 200, catalogResponse(await loadNativeSkillCatalog(context, input.project, provider, true)));
    return;
  }

  if (await handleDirectWorkbenchApi(context, request, response, url)) return;
  sendJson(response, 404, { error: "Not found." });
}

export function resolveProjectSkillProvider(project: { defaultProviderId?: string }, requestedProviderId?: string | null, registry: ProviderRegistry = defaultProviderRegistry) {
  const providerId = requestedProviderId || project.defaultProviderId;
  if (providerId) return registry.get(providerId);
  return registry.requireOnly();
}

async function loadNativeSkillCatalog(
  context: WorkbenchServerContext,
  project: ManagedProject,
  provider: ReturnType<typeof resolveProjectSkillProvider>,
  forceReload: boolean,
) {
  const runtime = await context.projectRuntimeCoordinator.requireReady(project);
  const roots = await listSkillRoots(runtime.paths);
  const snapshot = await provider.skills.list({
    projectPath: project.path,
    extraRoots: [getSystemSkillsRoot(), ...roots.map((root) => root.rootPath)],
    forceReload,
  });
  return {
    ...await listSkills(runtime.paths, snapshot, [runtime.providerInput]),
    snapshot,
  };
}

function catalogResponse(result: SkillCatalogResult & { snapshot: unknown }): SkillCatalogResult {
  return { roots: result.roots, skills: result.skills, errors: result.errors };
}

function projectIdForTrackedRequest(pathname: string): string | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2] || match[2] === "remove" || match[2] === "removal-confirmation") return null;
  return decodeURIComponent(match[1]);
}

function directProjectIdForTrackedRequest(context: WorkbenchServerContext, pathname: string): string | null {
  if (!context.input?.project || !pathname.startsWith("/api/workbench/")) return null;
  return context.input.project.id;
}

function isProjectStreamingRequest(pathname: string): boolean {
  return /\/(?:live|settle|events)$/.test(pathname);
}
