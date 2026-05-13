import { Command } from "commander";
import { resolveExistingDirectory } from "../fs/path.js";
import { ProjectRegistryStore } from "../registry/store.js";
import { getProjectStatus } from "../project/status.js";
import { auditHarness } from "../harness/audit.js";
import { initHarness } from "../harness/init.js";
import { writeChangeIndex } from "../ecl/index.js";
import { printJson, printTable } from "./output.js";
import { readPromptInput } from "../codex/prompt.js";
import { closeChange, createChange, getChangeStatus } from "../change/manager.js";
import { listRuns, readRun, startLocalCommandRun } from "../run/manager.js";
import { startCodexReadonlyRun } from "../run/codex.js";
import { getMemoryStatus } from "../memory/status.js";
import { assertWritableMemory, resolveMemory, resolveProjectMemory } from "../memory/resolver.js";
import { readProjectMarker } from "../project/marker.js";
import { createWorktree, getWorktreeStatus, listWorktreeStatuses, removeWorktree } from "../worktree/manager.js";
import type { ManagedProject, MemoryMode, ResolvedMemory } from "../types/index.js";

async function resolveRegisteredOrPath(store: ProjectRegistryStore, query: string): Promise<{ project: Awaited<ReturnType<ProjectRegistryStore["resolveProject"]>>; path: string }> {
  const project = await store.resolveProject(query);
  if (project) return { project, path: project.path };
  return { project: null, path: await resolveExistingDirectory(query) };
}

async function resolveManagedProject(store: ProjectRegistryStore, query: string): Promise<ManagedProject> {
  const project = await store.resolveProject(query);
  if (!project) {
    throw new Error("Project must be registered with `aho project add` before using managed project commands.");
  }
  const audit = await auditHarness(project.path);
  if (!audit.managed) {
    throw new Error("Project must be initialized with `aho harness init` before using change commands.");
  }
  if (audit.readiness !== "ready") {
    throw new Error(`Project Harness is not ready (${audit.readiness}); run \`aho harness audit ${project.id}\`.`);
  }
  return project;
}

async function resolveManagedMemoryProject(store: ProjectRegistryStore, query: string, action: string): Promise<{ project: ManagedProject; memory: ResolvedMemory }> {
  const project = await store.resolveProject(query);
  if (!project) {
    throw new Error("Project must be registered with `aho project add` before using worktree commands.");
  }
  const marker = await readProjectMarker(project.path);
  if (!marker) {
    throw new Error("Project must be initialized with `aho harness init` before using worktree commands.");
  }
  const memory = resolveMemory({ ...project, marker });
  assertWritableMemory(memory, action);
  return { project, memory };
}

export function createProgram(): Command {
  const program = new Command();
  const store = new ProjectRegistryStore();

  program.name("aho").description("Agent Harness Orchestrator").version("0.1.0");

  const project = program.command("project").description("Manage registered projects");

  project
    .command("add")
    .argument("<path>", "local project path")
    .option("--name <name>", "display name")
    .option("--json", "print JSON")
    .action(async (pathInput: string, options: { name?: string; json?: boolean }) => {
      const path = await resolveExistingDirectory(pathInput);
      const added = await store.addProject(path, options.name);
      if (options.json) printJson(added);
      else console.log(`Registered ${added.name} (${added.id}) at ${added.path}`);
    });

  project
    .command("list")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const projects = await store.listProjects();
      const statuses = await Promise.all(projects.map((item) => getProjectStatus(item, item.path)));
      const rows = statuses.map((status) => ({
        id: status.project?.id,
        name: status.project?.name,
        path: status.path,
        exists: status.pathExists,
        git: status.isGitRepo,
        harness: status.harness.readiness,
        managed: status.managed,
      }));
      if (options.json) printJson(statuses);
      else printTable(rows);
    });

  project
    .command("status")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const status = await getProjectStatus(resolved.project, resolved.path);
      if (options.json) printJson(status);
      else {
        printTable([
          {
            project: status.project?.id ?? "(unregistered)",
            path: status.path,
            exists: status.pathExists,
            git: status.isGitRepo,
            branch: status.branch ?? "",
            dirty: status.dirty ?? "",
            managed: status.managed,
            harness: status.harness.readiness,
            active: status.harness.activeChanges.map((change) => change.name).join(", "),
            pendingEvolution: status.harness.pendingEvolution,
          },
        ]);
      }
    });

  const harness = program.command("harness").description("Inspect and initialize project Harness memory");

  harness
    .command("audit")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const audit = await auditHarness(resolved.path);
      const result = { registered: resolved.project !== null, ...audit };
      if (options.json) printJson(result);
      else {
        printTable(audit.components.map((component) => ({
          component: component.name,
          path: component.path,
          location: component.location,
          exists: component.exists,
        })));
        console.log(`Readiness: ${audit.readiness}; managed: ${audit.managed}; registered: ${resolved.project !== null}`);
      }
    });

  harness
    .command("init")
    .argument("<name-or-path>", "registered project id/name/path")
    .option("--memory <mode>", "memory mode: repo-local or external-local", "repo-local")
    .option("--json", "print JSON")
    .action(async (query: string, options: { memory?: string; json?: boolean }) => {
      const registered = await store.resolveProject(query);
      if (!registered) {
        throw new Error("Project must be registered with `aho project add` before `aho harness init`.");
      }
      const memoryMode = parseHarnessInitMemoryMode(options.memory);
      const result = await initHarness(registered, { memoryMode });
      if (options.json) printJson(result);
      else {
        console.log(`Harness initialized for ${registered.name} (${memoryMode}).`);
        console.log(`Created: ${result.created.length}; skipped existing: ${result.skipped.length}`);
      }
    });

  harness
    .command("reindex")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const marker = await readProjectMarker(resolved.path);
      const memory = resolveMemory(resolved.project ? { ...resolved.project, marker } : { path: resolved.path, marker });
      assertWritableMemory(memory, "Harness reindex");
      const index = await writeChangeIndex(memory);
      if (options.json) printJson(index);
      else console.log(`Rebuilt harness/changes/INDEX.json for ${resolved.path}`);
    });

  const memory = program.command("memory").description("Diagnose AHO memory resolution");

  memory
    .command("status")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const status = await getMemoryStatus(resolved.project, resolved.path);
      if (options.json) printJson(status);
      else {
        printTable([{
          registered: status.registered,
          managed: status.managed,
          mode: status.memoryMode,
            memoryAvailable: status.memoryAvailable,
            harnessReady: status.harnessReady,
            artifactBase: status.artifactBase,
            harnessRoot: status.roots.harnessRoot,
            runsRoot: status.roots.runsRoot,
          reason: status.unsupportedReason ?? "",
        }]);
      }
    });

  const change = program.command("change").description("Manage structured ECL changes");

  change
    .command("new")
    .argument("<project>", "registered project id/name/path")
    .requiredOption("--title <title>", "change title")
    .option("--body <text>", "raw user request or context")
    .option("--json", "print JSON")
    .action(async (query: string, options: { title: string; body?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await createChange(project, { title: options.title, body: options.body });
      if (options.json) printJson(result);
      else {
        console.log(`Created change ${result.change.id} at ${result.path}`);
        console.log(`ACs: ${result.acMap.acceptanceCriteria.length}; tasks: ${result.acMap.tasks.length}`);
      }
    });

  change
    .command("status")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await getChangeStatus(project);
      if (options.json) printJson(status);
      else {
        printTable([
          {
            active: status.change?.id ?? status.activeChanges.map((item) => item.name).join(", "),
            review: status.reviewStatus,
            acs: status.acMap?.acceptanceCriteria.length ?? 0,
            tasks: status.acMap?.tasks.length ?? 0,
            warnings: status.closeGate.warnings.length,
            blocking: status.closeGate.blockingIssues.length,
            ready: status.closeGate.ready,
          },
        ]);
        for (const issue of status.closeGate.blockingIssues) console.log(`BLOCKING: ${issue}`);
        for (const warning of status.closeGate.warnings) console.log(`WARNING: ${warning}`);
      }
    });

  change
    .command("close")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await closeChange(project);
      if (options.json) printJson(result);
      else console.log(`Archived change ${result.change.id} at ${result.archivePath}`);
    });

  const worktree = program.command("worktree").description("Manage AHO-owned Git worktrees");

  worktree
    .command("create")
    .argument("<project>", "registered project id/name/path")
    .option("--base <ref>", "base ref for the worktree")
    .option("--json", "print JSON")
    .action(async (query: string, options: { base?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const memory = await resolveProjectMemory(project);
      const status = await getChangeStatus(project);
      if (status.activeChanges.length !== 1 || !status.change) {
        throw new Error("Cannot create worktree: expected exactly one active change.");
      }
      const result = await createWorktree(project, memory, status.change.id, { baseRef: options.base });
      if (options.json) printJson(result);
      else {
        console.log(`Created worktree ${result.metadata.worktreeId}`);
        console.log(`Branch: ${result.metadata.branchName}`);
        console.log(`Checkout: ${result.metadata.checkoutPath}`);
        for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
      }
    });

  worktree
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const { memory } = await resolveManagedMemoryProject(store, query, "Worktree list");
      const items = await listWorktreeStatuses(memory);
      if (options.json) printJson(items);
      else printTable(items.map((item) => ({
        id: item.worktreeId,
        change: item.changeId,
        branch: item.branch,
        dirty: item.dirty ?? "",
        exists: item.exists,
        checkout: item.checkoutPath,
      })));
    });

  worktree
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { json?: boolean }) => {
      const { memory } = await resolveManagedMemoryProject(store, query, "Worktree show");
      const item = await getWorktreeStatus(memory, worktreeId);
      if (options.json) printJson(item);
      else printTable([{
        id: item.worktreeId,
        change: item.changeId,
        branch: item.branch,
        dirty: item.dirty ?? "",
        head: item.headCommit ?? "",
        checkout: item.checkoutPath,
      }]);
    });

  worktree
    .command("remove")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--force", "remove even if the worktree is dirty")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { force?: boolean; json?: boolean }) => {
      const { memory } = await resolveManagedMemoryProject(store, query, "Worktree remove");
      const result = await removeWorktree(memory, worktreeId, options.force === true);
      if (options.json) printJson(result);
      else console.log(`Removed worktree ${result.removed.worktreeId}`);
    });

  const run = program.command("run").description("Run local commands and record artifacts");

  run
    .command("start")
    .argument("<project>", "registered project id/name/path")
    .argument("[commandArgs...]", "command and arguments after --")
    .allowUnknownOption(true)
    .option("--worktree", "run the command in a new AHO-managed worktree")
    .option("--json", "print JSON")
    .action(async (query: string, commandArgs: string[], options: { worktree?: boolean; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startLocalCommandRun(project, commandArgs, { worktree: options.worktree === true });
      if (options.json) printJson(result);
      else {
        console.log(`Run ${result.run.id}: ${result.run.status}`);
        console.log(`Exit code: ${result.run.exitCode ?? ""}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        if (result.run.worktree) console.log(`Worktree: ${result.run.worktree.checkoutPath}`);
      }
      if (result.run.status === "failed") {
        process.exitCode = result.run.exitCode ?? 1;
      }
    });

  run
    .command("codex")
    .argument("<project>", "registered project id/name/path")
    .option("--prompt <text>", "prompt to send to Codex")
    .option("--prompt-file <path>", "file containing the prompt to send to Codex, resolved from the current AHO cwd")
    .option("--model <model>", "Codex model to pass through")
    .option("--profile <profile>", "Codex config profile to pass through")
    .option("--json", "print JSON")
    .action(async (query: string, options: { prompt?: string; promptFile?: string; model?: string; profile?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const prompt = await readPromptInput({ prompt: options.prompt, promptFile: options.promptFile });
      const result = await startCodexReadonlyRun(project, { prompt, model: options.model, profile: options.profile });
      if (options.json) printJson(result);
      else {
        console.log(`Run ${result.run.id}: ${result.run.status}`);
        console.log(`Exit code: ${result.run.exitCode ?? ""}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        console.log("Codex output is a proposal only; it has not been accepted or applied.");
      }
      if (result.run.status === "failed") {
        process.exitCode = result.run.exitCode ?? 1;
      }
    });

  run
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const runs = await listRuns(project);
      if (options.json) printJson(runs);
      else {
        printTable(runs.map((item) => ({
          id: item.id,
          change: item.changeId,
          command: item.command.join(" "),
          status: item.status,
          exitCode: item.exitCode ?? "",
          startedAt: item.startedAt,
          finishedAt: item.finishedAt ?? "",
        })));
      }
    });

  run
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<run-id>", "run id")
    .option("--json", "print JSON")
    .action(async (query: string, runId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const item = await readRun(project, runId);
      if (options.json) printJson(item);
      else {
        printTable([
          {
            id: item.id,
            change: item.changeId,
            command: item.command.join(" "),
            status: item.status,
            exitCode: item.exitCode ?? "",
            artifacts: item.artifacts.directory,
          },
        ]);
      }
    });

  return program;
}

function parseHarnessInitMemoryMode(input: string | undefined): Exclude<MemoryMode, "remote"> {
  if (!input || input === "repo-local") return "repo-local";
  if (input === "external-local") return "external-local";
  throw new Error("Unsupported harness memory mode. Use `repo-local` or `external-local`.");
}
