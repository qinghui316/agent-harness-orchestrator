import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { parseJsonText } from "../fs/json.js";
import type { ProjectHarnessDiscoveryPolicy } from "./contracts.js";
import { resolveProjectRuntimePaths } from "../project-runtime/paths.js";
import { assertRequiredProjectHarnessBindings, discoverProjectHarness } from "./discovery.js";
import {
  closeProjectHarnessChange,
  createProjectHarnessChange,
  listProjectHarnessChanges,
  parkProjectHarnessChange,
  preflightProjectHarnessChange,
  publishProjectHarnessChange,
  readProjectHarnessChangeContext,
  rebuildProjectHarnessChangeIndex,
  resumeProjectHarnessChange,
  searchProjectHarnessChanges,
  type CloseProjectHarnessChangeInput,
  type ProjectHarnessChangeStatus,
  type PublishProjectHarnessChangeInput,
} from "./change.js";
import {
  abortProjectHarnessIntegration,
  completeProjectHarnessIntegration,
  listProjectHarnessIntegrations,
  loadProjectHarnessIntegration,
  resumeProjectHarnessIntegration,
  startProjectHarnessIntegration,
  type CompleteProjectHarnessIntegrationInput,
  type StartProjectHarnessIntegrationInput,
} from "./integration.js";
import { reindexProjectKnowledge } from "./knowledge.js";
import type { ProjectHarnessManifest } from "./manifest.js";
import { resolveProjectHarnessRegistryContext, type ProjectHarnessRegistryContext } from "./registry.js";
import {
  checkProjectHarnessEvolution,
  completeProjectHarnessEvolution,
  readProjectHarnessEvolutionState,
  stageProjectHarnessEvolution,
  type CompleteProjectHarnessEvolutionInput,
  type StageProjectHarnessEvolutionInput,
} from "./evolution.js";
import { SourceFingerprintSnapshot } from "./source-fingerprint.js";

export interface ProjectHarnessDailyArguments {
  action: string | null;
  projectRoot: string;
  sidecarRoot: string;
  options: ReadonlyMap<string, readonly string[]>;
  positionals: readonly string[];
  help: boolean;
}

const BOOLEAN_OPTIONS = new Set([
  "help", "json", "resume", "validation-passed", "confirm-i2", "confirm-e1", "judge-unavailable",
]);
const MULTI_VALUE_OPTIONS = new Set(["paths"]);

export function parseProjectHarnessDailyArguments(
  args: readonly string[],
  projectId: string,
): ProjectHarnessDailyArguments {
  let action: string | null = null;
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      if (action === null) action = value;
      else positionals.push(value);
      continue;
    }
    const name = value.slice(2);
    if (!name) throw new Error("Command option name must not be empty.");
    const values = options.get(name) ?? [];
    if (BOOLEAN_OPTIONS.has(name)) {
      values.push("true");
    } else if (MULTI_VALUE_OPTIONS.has(name)) {
      while (args[index + 1] && !args[index + 1].startsWith("--")) values.push(args[++index]);
    } else {
      const next = args[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`--${name} requires a value.`);
      values.push(next);
      index += 1;
    }
    options.set(name, values);
  }
  const projectRoot = resolve(option(options, "project-root") ?? process.cwd());
  const canonicalSidecar = resolve(resolveProjectRuntimePaths(projectId).sidecarRoot);
  const requestedSidecar = option(options, "sidecar-root");
  if (requestedSidecar && normalizePath(requestedSidecar) !== normalizePath(canonicalSidecar)) {
    throw new Error("--sidecar-root does not match the canonical project runtime sidecar.");
  }
  return {
    action,
    projectRoot,
    sidecarRoot: canonicalSidecar,
    options,
    positionals,
    help: booleanOption(options, "help") === true,
  };
}

export async function runDailyChangeCommand(
  skillRoot: string,
  manifest: ProjectHarnessManifest,
  parsed: ProjectHarnessDailyArguments,
  discoveryPolicy: ProjectHarnessDiscoveryPolicy,
): Promise<unknown> {
  assertOnlyOptions(parsed.options, [
    "project-root", "sidecar-root", "help", "json", "change-id", "input-json", "scope", "paths",
    "status", "validation", "validation-passed", "contract", "completion-commit", "query",
  ]);
  if (parsed.help) return dailyCommandHelp("change");
  assertChangePositionals(parsed);
  await assertDailyProjectBinding(skillRoot, manifest, parsed.projectRoot, discoveryPolicy);
  const context = await registryContext(skillRoot, manifest.project_id, parsed.projectRoot);
  const changeId = option(parsed.options, "change-id") ?? parsed.positionals[0];
  if (parsed.action === "new") {
    return createProjectHarnessChange(context, {
      changeId: requireValue(changeId, "--change-id"),
      scope: option(parsed.options, "scope"),
    });
  }
  if (parsed.action === "publish") {
    const fileInput = await optionalInputJson<Partial<PublishProjectHarnessChangeInput>>(parsed.options);
    const contractPath = option(parsed.options, "contract");
    const input: Partial<PublishProjectHarnessChangeInput> = {
      ...fileInput,
      scope: option(parsed.options, "scope") ?? fileInput.scope,
      paths: options(parsed.options, "paths").length > 0 ? options(parsed.options, "paths") : fileInput.paths,
      status: parseOptionalEnum(option(parsed.options, "status"), ["planning", "active"], "Change publish status") ?? fileInput.status,
      validation: options(parsed.options, "validation").length > 0 ? options(parsed.options, "validation") : fileInput.validation,
      contract: contractPath ? await readJsonFile(contractPath) as PublishProjectHarnessChangeInput["contract"] : fileInput.contract,
    };
    return publishProjectHarnessChange(context, {
      ...input as PublishProjectHarnessChangeInput,
      changeId: requireValue(changeId ?? input.changeId, "--change-id or input changeId"),
    });
  }
  if (parsed.action === "preflight") {
    const snapshot = new SourceFingerprintSnapshot({ projectRoot: parsed.projectRoot });
    return preflightProjectHarnessChange(context, {
      changeId: requireValue(changeId, "--change-id"),
      sourceSnapshot: { fingerprintSources: (paths) => snapshot.fingerprints(paths) },
    });
  }
  if (parsed.action === "park") return parkProjectHarnessChange(context, requireValue(changeId, "--change-id"));
  if (parsed.action === "resume") return resumeProjectHarnessChange(context, requireValue(changeId, "--change-id"));
  if (parsed.action === "close") {
    const fileInput = await optionalInputJson<Partial<CloseProjectHarnessChangeInput>>(parsed.options);
    const snapshot = new SourceFingerprintSnapshot({ projectRoot: parsed.projectRoot });
    const close = await closeProjectHarnessChange(context, {
      ...fileInput,
      changeId: requireValue(changeId ?? fileInput.changeId, "--change-id or input changeId"),
      status: parseRequiredEnum(
        option(parsed.options, "status") ?? fileInput.status,
        ["completed", "blocked", "abandoned"],
        "Change close status",
      ),
      completionCommit: option(parsed.options, "completion-commit") ?? fileInput.completionCommit,
      validation: fileInput.validation ?? options(parsed.options, "validation"),
      validationPassed: booleanOption(parsed.options, "validation-passed") ?? fileInput.validationPassed,
      sourceSnapshot: { fingerprintSources: (paths) => snapshot.fingerprints(paths) },
    });
    const evolution = await checkProjectHarnessEvolution(skillRoot, parsed.sidecarRoot, "change-close");
    return { ...close, evolution };
  }
  if (parsed.action === "status") {
    return changeId
      ? readProjectHarnessChangeContext(skillRoot, changeId, true)
      : { changes: await listProjectHarnessChanges(skillRoot) };
  }
  if (parsed.action === "search") {
    const statuses = options(parsed.options, "status") as ProjectHarnessChangeStatus[];
    return searchProjectHarnessChanges(skillRoot, option(parsed.options, "query") ?? "", statuses);
  }
  if (parsed.action === "context") {
    return readProjectHarnessChangeContext(skillRoot, requireValue(changeId, "--change-id"), true);
  }
  if (parsed.action === "reindex") {
    const [changeIndex, knowledge] = await Promise.all([
      rebuildProjectHarnessChangeIndex(skillRoot),
      reindexProjectKnowledge({
        projectId: manifest.project_id,
        projectRoot: parsed.projectRoot,
        skillRoot,
      }),
    ]);
    return { changeIndex, knowledge };
  }
  throw new Error("Change command requires new, publish, preflight, park, resume, close, status, search, context, or reindex.");
}

export async function runDailyIntegrationCommand(
  skillRoot: string,
  manifest: ProjectHarnessManifest,
  parsed: ProjectHarnessDailyArguments,
  discoveryPolicy: ProjectHarnessDiscoveryPolicy,
): Promise<unknown> {
  assertOnlyOptions(parsed.options, [
    "project-root", "sidecar-root", "help", "json", "integration-id", "input-json", "completion-commit",
    "resume", "confirm-i2", "validation", "validation-passed", "review-report", "integrator-id",
  ]);
  if (parsed.help) return dailyCommandHelp("integrate");
  assertIntegrationPositionals(parsed);
  await assertDailyProjectBinding(skillRoot, manifest, parsed.projectRoot, discoveryPolicy);
  const explicitIntegrationId = option(parsed.options, "integration-id");
  const integrationId = explicitIntegrationId ?? parsed.positionals[0];
  if (parsed.action === "start") {
    const fileInput = await optionalInputJson<Partial<Omit<StartProjectHarnessIntegrationInput, "projectId" | "projectRoot" | "skillRoot" | "sidecarRoot">>>(parsed.options);
    const context = await registryContext(skillRoot, manifest.project_id, parsed.projectRoot);
    const overrides = Object.fromEntries(options(parsed.options, "completion-commit").map((value) => {
      const [id, commit, extra] = value.split("=");
      if (!id || !commit || extra !== undefined) throw new Error("--completion-commit must use <change-id>=<sha>.");
      return [id, commit];
    }));
    return startProjectHarnessIntegration({
      ...fileInput as StartProjectHarnessIntegrationInput,
      integrationId: requireValue(integrationId ?? fileInput.integrationId, "Integration id"),
      projectId: manifest.project_id,
      projectRoot: parsed.projectRoot,
      skillRoot,
      sidecarRoot: parsed.sidecarRoot,
      changeIds: explicitIntegrationId
        ? parsed.positionals.length > 0 ? [...parsed.positionals] : fileInput.changeIds ?? []
        : parsed.positionals.length > 1 ? parsed.positionals.slice(1) : fileInput.changeIds ?? [],
      completionCommits: Object.keys(overrides).length > 0 ? overrides : fileInput.completionCommits,
      integratorId: option(parsed.options, "integrator-id") ?? fileInput.integratorId
        ?? context.branch ?? "integration-main",
    });
  }
  if (parsed.action === "status") {
    if (booleanOption(parsed.options, "resume")) {
      return resumeProjectHarnessIntegration(skillRoot, parsed.sidecarRoot, requireValue(integrationId, "--integration-id"));
    }
    return integrationId
      ? loadProjectHarnessIntegration(skillRoot, integrationId, true)
      : { integrations: await listProjectHarnessIntegrations(skillRoot) };
  }
  if (parsed.action === "complete") {
    const fileInput = await optionalInputJson<Partial<Omit<CompleteProjectHarnessIntegrationInput,
      "projectId" | "projectRoot" | "skillRoot" | "sidecarRoot" | "failureInjection">>>(parsed.options);
    rejectAuthorityField(fileInput, "confirmI2", "I2");
    if (booleanOption(parsed.options, "confirm-i2") !== true) {
      throw new Error("Integration completion requires explicit --confirm-i2 on this invocation.");
    }
    const resolvedIntegrationId = requireValue(integrationId ?? fileInput.integrationId, "Integration id");
    const record = await loadProjectHarnessIntegration(skillRoot, resolvedIntegrationId, true);
    const reviewPath = option(parsed.options, "review-report");
    return completeProjectHarnessIntegration({
      ...fileInput as CompleteProjectHarnessIntegrationInput,
      integrationId: resolvedIntegrationId,
      projectId: manifest.project_id,
      projectRoot: parsed.projectRoot,
      skillRoot,
      sidecarRoot: parsed.sidecarRoot,
      integratorId: option(parsed.options, "integrator-id") ?? fileInput.integratorId ?? record?.integrator_id ?? "",
      confirmI2: true,
      validation: options(parsed.options, "validation").length > 0 ? options(parsed.options, "validation") : fileInput.validation ?? [],
      validationPassed: booleanOption(parsed.options, "validation-passed") ?? fileInput.validationPassed ?? false,
      review: reviewPath ? await readJsonFile(reviewPath) : fileInput.review,
    });
  }
  if (parsed.action === "abort") {
    const fileInput = await optionalInputJson<{ integratorId?: string }>(parsed.options);
    const record = await loadProjectHarnessIntegration(skillRoot, requireValue(integrationId, "--integration-id"), true);
    return abortProjectHarnessIntegration({
      integrationId: requireValue(integrationId, "--integration-id"),
      projectId: manifest.project_id,
      projectRoot: parsed.projectRoot,
      skillRoot,
      sidecarRoot: parsed.sidecarRoot,
      integratorId: option(parsed.options, "integrator-id") ?? fileInput.integratorId ?? record?.integrator_id ?? "",
    });
  }
  throw new Error("Integration command requires start, status, complete, or abort.");
}

export async function runDailyEvolutionCommand(
  skillRoot: string,
  manifest: ProjectHarnessManifest,
  parsed: ProjectHarnessDailyArguments,
  discoveryPolicy: ProjectHarnessDiscoveryPolicy,
): Promise<unknown> {
  assertOnlyOptions(parsed.options, [
    "project-root", "sidecar-root", "help", "json", "input-json", "confirm-e1", "proposal-id", "owner",
    "candidate-root", "source", "mode", "judge-report", "judge-unavailable", "status", "note",
  ]);
  if (parsed.help) return dailyCommandHelp("evolve");
  assertNoPositionals(parsed, "Evolution");
  await assertDailyProjectBinding(skillRoot, manifest, parsed.projectRoot, discoveryPolicy);
  if (parsed.action === "check") return checkProjectHarnessEvolution(skillRoot, parsed.sidecarRoot);
  if (parsed.action === "status") return readProjectHarnessEvolutionState(skillRoot);
  if (parsed.action === "stage") {
    const input = await inputJson<Omit<StageProjectHarnessEvolutionInput, "sourceSnapshot"> & { e1Approved?: unknown }>(parsed.options);
    rejectAuthorityField(input, "e1Approved", "E1");
    if (booleanOption(parsed.options, "confirm-e1") !== true) {
      throw new Error("Evolution staging requires explicit --confirm-e1 on this invocation.");
    }
    return stageProjectHarnessEvolution(skillRoot, parsed.sidecarRoot, {
      ...input,
      e1Approved: true,
      sourceSnapshot: new SourceFingerprintSnapshot({ projectRoot: parsed.projectRoot }),
    });
  }
  if (parsed.action === "mark-complete") {
    const input = await inputJson<Omit<CompleteProjectHarnessEvolutionInput, "sourceSnapshot">>(parsed.options);
    return completeProjectHarnessEvolution(skillRoot, parsed.sidecarRoot, {
      ...input,
      sourceSnapshot: new SourceFingerprintSnapshot({ projectRoot: parsed.projectRoot }),
    });
  }
  throw new Error("Evolution command requires check, status, stage, or mark-complete.");
}

async function registryContext(
  skillRoot: string,
  projectId: string,
  projectRoot: string,
): Promise<ProjectHarnessRegistryContext> {
  return resolveProjectHarnessRegistryContext({
    projectId,
    projectRoot,
    skillRoot,
  });
}

async function inputJson<T>(values: ReadonlyMap<string, readonly string[]>): Promise<T> {
  const path = requireOption(values, "input-json");
  return parseJsonText(await readFile(resolve(path), "utf8"), path) as T;
}

async function readJsonFile(path: string): Promise<unknown> {
  const absolute = resolve(path);
  return parseJsonText(await readFile(absolute, "utf8"), absolute);
}

async function optionalInputJson<T>(values: ReadonlyMap<string, readonly string[]>): Promise<T> {
  return option(values, "input-json") ? inputJson<T>(values) : {} as T;
}

function requireOption(values: ReadonlyMap<string, readonly string[]>, name: string): string {
  return requireValue(option(values, name), `--${name}`);
}

function option(values: ReadonlyMap<string, readonly string[]>, name: string): string | undefined {
  const found = values.get(name) ?? [];
  if (found.length > 1) throw new Error(`--${name} may be provided only once.`);
  return found[0];
}

function options(values: ReadonlyMap<string, readonly string[]>, name: string): string[] {
  return [...(values.get(name) ?? [])];
}

function booleanOption(values: ReadonlyMap<string, readonly string[]>, name: string): boolean | undefined {
  const value = option(values, name);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${name} must be true or false.`);
}

function requireValue(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  return value;
}

export async function assertDailyProjectBinding(
  skillRoot: string,
  manifest: ProjectHarnessManifest,
  projectRoot: string,
  discoveryPolicy: ProjectHarnessDiscoveryPolicy,
): Promise<void> {
  const discovered = await discoverProjectHarness(projectRoot, discoveryPolicy);
  if (!discovered) throw new Error("Project Harness discovery is missing; run the project connector first.");
  const expected = normalizePath(await realpath(skillRoot));
  const actual = normalizePath(await realpath(discovered.handle.skillRoot));
  if (actual !== expected || discovered.handle.projectId !== manifest.project_id) {
    throw new Error("Project root is not bound to this physical project Harness Skill.");
  }
  assertRequiredProjectHarnessBindings(discovered, discoveryPolicy);
}

function assertChangePositionals(parsed: ProjectHarnessDailyArguments): void {
  const action = parsed.action;
  if (["new", "preflight", "park", "resume", "context"].includes(action ?? "")) {
    assertSingleIdentifier(parsed, "change-id", false, `Change ${action}`);
    return;
  }
  if (action === "publish" || action === "close") {
    assertSingleIdentifier(parsed, "change-id", option(parsed.options, "input-json") !== undefined, `Change ${action}`);
    return;
  }
  if (action === "status") {
    assertOptionalIdentifier(parsed, "change-id", "Change status");
    return;
  }
  if (action === "search" || action === "reindex") assertNoPositionals(parsed, `Change ${action}`);
}

function assertIntegrationPositionals(parsed: ProjectHarnessDailyArguments): void {
  const action = parsed.action;
  if (action === "start") {
    const hasIntegrationOption = option(parsed.options, "integration-id") !== undefined;
    const hasStructuredInput = option(parsed.options, "input-json") !== undefined;
    const changeCount = hasIntegrationOption ? parsed.positionals.length : Math.max(parsed.positionals.length - 1, 0);
    const hasIntegrationId = hasIntegrationOption || parsed.positionals.length > 0 || hasStructuredInput;
    if (!hasIntegrationId || (changeCount === 0 && !hasStructuredInput)) {
      throw new Error("Integration start requires one integration id and at least one Change id unless input JSON supplies the missing values.");
    }
    return;
  }
  if (action === "complete") {
    assertSingleIdentifier(parsed, "integration-id", option(parsed.options, "input-json") !== undefined, "Integration complete");
    return;
  }
  if (action === "abort") {
    assertSingleIdentifier(parsed, "integration-id", false, "Integration abort");
    return;
  }
  if (action === "status") assertOptionalIdentifier(parsed, "integration-id", "Integration status");
}

function assertSingleIdentifier(
  parsed: ProjectHarnessDailyArguments,
  optionName: string,
  structuredInputAllowed: boolean,
  label: string,
): void {
  const hasOption = option(parsed.options, optionName) !== undefined;
  if (parsed.positionals.length > 1 || (hasOption && parsed.positionals.length > 0)) {
    throw new Error(`${label} accepts exactly one identifier; do not provide extra or conflicting positional arguments.`);
  }
  if (!hasOption && parsed.positionals.length === 0 && !structuredInputAllowed) {
    throw new Error(`${label} requires exactly one identifier.`);
  }
}

function assertOptionalIdentifier(
  parsed: ProjectHarnessDailyArguments,
  optionName: string,
  label: string,
): void {
  const hasOption = option(parsed.options, optionName) !== undefined;
  if (parsed.positionals.length > 1 || (hasOption && parsed.positionals.length > 0)) {
    throw new Error(`${label} accepts at most one identifier; do not provide extra or conflicting positional arguments.`);
  }
}

function assertNoPositionals(parsed: ProjectHarnessDailyArguments, label: string): void {
  if (parsed.positionals.length > 0) {
    throw new Error(`${label} does not accept positional arguments.`);
  }
}

function assertOnlyOptions(values: ReadonlyMap<string, readonly string[]>, allowed: readonly string[]): void {
  const set = new Set(allowed);
  const unknown = [...values.keys()].filter((name) => !set.has(name));
  if (unknown.length > 0) throw new Error(`Unknown command option: --${unknown[0]}.`);
}

function parseRequiredEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  return z.enum(allowed as [T, ...T[]], { message: `${label} is invalid.` }).parse(value);
}

function parseOptionalEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T | undefined {
  return value === undefined ? undefined : parseRequiredEnum(value, allowed, label);
}

function rejectAuthorityField(value: object, field: string, gate: string): void {
  if (Object.prototype.hasOwnProperty.call(value, field)) {
    throw new Error(`${gate} authorization must not be supplied by input JSON.`);
  }
}

function dailyCommandHelp(command: "change" | "integrate" | "evolve") {
  const actions = command === "change"
    ? ["new", "preflight", "publish", "close", "park", "resume", "search", "context", "reindex", "status"]
    : command === "integrate"
      ? ["start", "status", "complete", "abort"]
      : ["check", "status", "stage", "mark-complete"];
  return { command, actions, projectRootDefault: "current-working-directory" };
}

function normalizePath(path: string): string {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}
