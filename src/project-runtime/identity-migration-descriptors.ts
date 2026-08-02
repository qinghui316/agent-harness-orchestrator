import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  assertRequiredProjectHarnessBindings,
  discoverProjectHarness,
  type ProjectHarnessDiscovery,
} from "../project-harness/discovery.js";
import type { ManagedProject } from "../types/index.js";
import type { ProjectHarnessDiscoveryPolicy } from "../project-harness/contracts.js";
import type { ProjectRegistryStore } from "../registry/store.js";
import { normalizeForCompare } from "../fs/path.js";
import { parseJsonText } from "../fs/json.js";
import type {
  MigrateProjectIdentityOptions,
  ProjectIdentityJsonDocument,
  ProjectIdentityMigrationJournal,
  ProjectIdentitySqliteDatabase,
} from "./identity-migration.js";
import { WORKBENCH_PROJECT_IDENTITY_COLUMNS } from "./identity-migration-sqlite.js";
import type { ProjectRuntimePaths } from "./paths.js";

export interface ProjectIdentityMigrationDescriptorInput {
  project: ManagedProject;
  discovery: ProjectHarnessDiscovery;
  store: ProjectRegistryStore;
  sourcePaths: ProjectRuntimePaths;
  targetPaths: ProjectRuntimePaths;
  transactionId: string;
}

export async function buildProjectIdentityRecoveryDocuments(
  journal: Readonly<ProjectIdentityMigrationJournal>,
  store: ProjectRegistryStore,
  discoveryPolicy: ProjectHarnessDiscoveryPolicy,
): Promise<ProjectIdentityJsonDocument[]> {
  const registryDocuments = journal.documents.filter((document) => document.kind === "registry" && document.scope === "external");
  const markerDocuments = journal.documents.filter((document) => document.kind === "local-state" && document.scope === "external");
  const sidecarDocuments = journal.documents.filter((document) => document.scope === "sidecar");
  if (registryDocuments.length !== 1 || markerDocuments.length !== 1
    || journal.documents.length !== registryDocuments.length + markerDocuments.length + sidecarDocuments.length) {
    throw new Error("Identity recovery journal does not match the supported Registry, marker, and sidecar descriptor set.");
  }
  const registryDocument = registryDocuments[0]!;
  if (normalizeForCompare(registryDocument.sourcePath) !== normalizeForCompare(store.registryPath)) {
    throw new Error("Identity recovery journal Registry path is not caller-owned.");
  }
  const { projectRoot, registryIndex } = await resolveRegistryProjectOwner(store.registryPath, journal);
  const markerPath = join(projectRoot, ".agent-harness", "project.json");
  const markerDocument = markerDocuments[0]!;
  if (normalizeForCompare(markerDocument.sourcePath) !== normalizeForCompare(markerPath)) {
    throw new Error("Identity recovery journal marker path is not owned by the Registry project.");
  }
  const discovery = await discoverProjectHarness(projectRoot, discoveryPolicy);
  if (!discovery || discovery.handle.projectId !== journal.targetProjectId) {
    throw new Error("Identity recovery cannot bind the journal to the Registry project's canonical Harness.");
  }
  assertRequiredProjectHarnessBindings(discovery, discoveryPolicy);
  const manifestPath = join(discovery.handle.skillRoot, "state", "manifest.json");
  if (normalizeForCompare(journal.manifestPath) !== normalizeForCompare(manifestPath)) {
    throw new Error("Identity recovery journal manifest is not owned by the discovered project Harness.");
  }
  const documents: ProjectIdentityJsonDocument[] = [
    {
      kind: "registry",
      scope: "external",
      path: store.registryPath,
      allowedIdentityPaths: [`/projects/${registryIndex}/id`],
    },
    {
      kind: "local-state",
      scope: "external",
      path: markerPath,
      allowedIdentityPaths: ["/id"],
    },
  ];
  for (const document of sidecarDocuments) {
    const relativePath = relative(journal.sourceSidecarRoot, document.sourcePath).replace(/\\/g, "/");
    if (!relativePath || isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../")) {
      throw new Error("Identity recovery journal sidecar document is outside the source sidecar.");
    }
    if (!isKnownSidecarIdentityPath(relativePath)
      || document.allowedIdentityPaths.length !== 1
      || document.allowedIdentityPaths[0] !== "/projectId") {
      throw new Error(`Identity recovery journal contains an unsupported sidecar identity document: ${relativePath}`);
    }
    documents.push({
      kind: "runtime-state",
      scope: "sidecar",
      path: relativePath,
      allowedIdentityPaths: ["/projectId"],
    });
  }
  return documents;
}

export async function buildProjectIdentityMigrationOptions(
  input: ProjectIdentityMigrationDescriptorInput,
): Promise<MigrateProjectIdentityOptions> {
  const registry = await input.store.load();
  const sourceIndexes = registry.projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => project.id === input.project.id);
  if (sourceIndexes.length !== 1 || sourceIndexes[0]!.project.path !== input.project.path) {
    throw new Error(`Registry does not contain one exact source project identity for ${input.project.id}.`);
  }
  const markerPath = join(input.project.path, ".agent-harness", "project.json");
  if (!existsSync(markerPath)) {
    throw new Error("Controlled identity migration requires the legacy project marker as an exact external state document.");
  }
  const sqliteDatabases: ProjectIdentitySqliteDatabase[] = [];
  if (existsSync(input.sourcePaths.workbenchDbPath)) {
    sqliteDatabases.push({
      relativePath: "workbench/workbench.sqlite",
      identityColumns: WORKBENCH_PROJECT_IDENTITY_COLUMNS,
    });
  }
  const jsonDocuments: ProjectIdentityJsonDocument[] = [
    {
      kind: "registry",
      scope: "external",
      path: input.store.registryPath,
      allowedIdentityPaths: [`/projects/${sourceIndexes[0]!.index}/id`],
    },
    {
      kind: "local-state",
      scope: "external",
      path: markerPath,
      allowedIdentityPaths: ["/id"],
    },
    ...await knownSidecarIdentityDocuments(input.sourcePaths.sidecarRoot),
  ];
  return {
    sourceProjectId: input.project.id,
    targetProjectId: input.discovery.handle.projectId,
    manifestPath: join(input.discovery.handle.skillRoot, "state", "manifest.json"),
    sourceSidecarRoot: input.sourcePaths.sidecarRoot,
    targetSidecarRoot: input.targetPaths.sidecarRoot,
    transactionId: input.transactionId,
    sqliteDatabases,
    jsonDocuments,
  };
}

async function knownSidecarIdentityDocuments(sidecarRoot: string): Promise<ProjectIdentityJsonDocument[]> {
  const documents: ProjectIdentityJsonDocument[] = [];
  if (!existsSync(sidecarRoot)) return documents;
  await visit(sidecarRoot, "");
  return documents;

  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Runtime sidecar contains a link or Junction: ${path}`);
      if (info.isDirectory()) {
        await visit(path, relativePath);
        continue;
      }
      if (!info.isFile()) throw new Error(`Runtime sidecar contains an unsupported entry: ${path}`);
      if (!isKnownSidecarIdentityPath(relativePath)) continue;
      documents.push({
        kind: "runtime-state",
        scope: "sidecar",
        path: relativePath,
        allowedIdentityPaths: ["/projectId"],
      });
    }
  }
}

function isKnownSidecarIdentityPath(relativePath: string): boolean {
  return /^worktrees\/metadata\/[^/]+\.json$/i.test(relativePath)
    || /^runs\/[^/]+\/(?:worker-session|runtime-workspace|event-source)\.json$/i.test(relativePath);
}

async function resolveRegistryProjectOwner(
  registryPath: string,
  journal: Readonly<ProjectIdentityMigrationJournal>,
): Promise<{ projectRoot: string; registryIndex: number }> {
  const candidates = [
    registryPath,
    `${registryPath}.${journal.transactionId}.previous`,
    `${registryPath}.${journal.transactionId}.next`,
  ].filter((path) => existsSync(path));
  const owners = new Map<string, { projectRoot: string; registryIndex: number }>();
  for (const path of candidates) {
    const parsed = parseJsonText(await readFile(path, "utf8"), path) as { projects?: unknown };
    if (!Array.isArray(parsed.projects)) continue;
    const matches = parsed.projects
      .map((project, index) => ({ project: project as Record<string, unknown>, index }))
      .filter(({ project }) => typeof project.path === "string"
        && (project.id === journal.sourceProjectId || project.id === journal.targetProjectId));
    if (matches.length !== 1) continue;
    const owner = {
      projectRoot: resolve(String(matches[0]!.project.path)),
      registryIndex: matches[0]!.index,
    };
    owners.set(`${normalizeForCompare(owner.projectRoot)}\0${owner.registryIndex}`, owner);
  }
  if (owners.size === 1) return [...owners.values()][0]!;
  throw new Error("Identity recovery cannot bind the journal to one exact Registry project record.");
}
