import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseJsonText } from "../fs/json.js";
import { discoverProjectHarness } from "./discovery.js";
import { fingerprintProjectHarnessContent } from "./fingerprint.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

const REQUIRED_FILES = [
  "SKILL.md",
  "references/audit-rubric.json",
  "references/project_wiki/catalog.md",
  "references/project_wiki/.ecl-baselines.json",
  "references/rules/red_lines.yaml",
  "references/rules/critical.md",
  "state/changes/INDEX.json",
  "state/registry/baseline.json",
] as const;

const REQUIRED_WORKFLOW_STAGES = [
  "intake",
  "locate",
  "plan",
  "implement",
  "verify",
  "close",
  "integrate",
  "evolve",
  "bootstrap-project",
] as const;

const REQUIRED_CHANGE_FILES = ["summary.md", "spec.md", "plan.md", "tasks.md", "reviews/review.md"] as const;

export type ProjectHarnessFindingSeverity = "error" | "warning" | "advisory";

export interface ProjectHarnessFinding {
  code: string;
  severity: ProjectHarnessFindingSeverity;
  path: string | null;
  message: string;
}

export interface ProjectHarnessStateCounts {
  activeChanges: number;
  parkingChanges: number;
  archivedChanges: number;
  registryChanges: number;
  lanes: number;
  contracts: number;
  integrations: number;
  evolutionResults: number;
  evolutionPending: boolean;
}

export interface ProjectHarnessDiagnosticResult {
  healthy: boolean;
  projectId: string | null;
  skillName: string | null;
  revision: number | null;
  contentFingerprint: string | null;
  counts: ProjectHarnessStateCounts;
  providerBindings: Array<{
    providerId: string;
    status: string;
    sameTarget: boolean;
  }>;
  findings: ProjectHarnessFinding[];
}

export interface ProjectHarnessDiagnosticOptions {
  skillRoot: string;
  projectRoot?: string;
  expectedProjectId?: string;
}

export async function doctorProjectHarness(
  options: ProjectHarnessDiagnosticOptions,
): Promise<ProjectHarnessDiagnosticResult> {
  const findings: ProjectHarnessFinding[] = [];
  const counts = emptyCounts();
  let skillRoot: string;
  try {
    skillRoot = await assertPhysicalDirectory(options.skillRoot, "project Harness");
  } catch (error) {
    findings.push(finding("invalid_skill_root", "error", null, message(error)));
    return diagnosticResult(findings, counts);
  }

  for (const path of [...REQUIRED_FILES, ...REQUIRED_WORKFLOW_STAGES.map((stage) => `references/workflows/${stage}.md`)]) {
    await requirePhysicalFile(skillRoot, path, findings);
  }

  let projectId: string | null = null;
  let skillName: string | null = null;
  let revision: number | null = null;
  try {
    const manifest = await readProjectHarnessManifest(skillRoot);
    projectId = manifest.project_id;
    skillName = manifest.skill_name;
    revision = manifest.skill_revision;
    if (manifest.skill_name !== basename(skillRoot)) {
      findings.push(finding("skill_name_mismatch", "error", "state/manifest.json", "Manifest skill_name does not match the physical directory."));
    }
    if (options.expectedProjectId && manifest.project_id !== options.expectedProjectId) {
      findings.push(finding("project_id_mismatch", "error", "state/manifest.json", "Manifest project_id does not match the requested project."));
    }
  } catch (error) {
    findings.push(finding("invalid_manifest", "error", "state/manifest.json", message(error)));
  }

  let contentFingerprint: string | null = null;
  try {
    contentFingerprint = await fingerprintProjectHarnessContent(skillRoot);
  } catch (error) {
    findings.push(finding("non_physical_content", "error", null, message(error)));
  }

  await populateCounts(skillRoot, counts, findings);
  const providerBindings: ProjectHarnessDiagnosticResult["providerBindings"] = [];
  if (options.projectRoot) {
    try {
      const discovery = await discoverProjectHarness(options.projectRoot);
      if (!discovery) {
        findings.push(finding("missing_discovery_links", "error", null, "Project has no discoverable project Harness Skill."));
      } else {
        providerBindings.push(...discovery.binding.providers.map(({ providerId, status, sameTarget }) => ({
          providerId,
          status,
          sameTarget,
        })));
        if (projectId && discovery.handle.projectId !== projectId) {
          findings.push(finding("discovery_identity_mismatch", "error", null, "Provider discovery resolves a different project id."));
        }
        for (const binding of discovery.binding.providers) {
          if (binding.status !== "ready" || !binding.sameTarget) {
            findings.push(finding("provider_binding_unhealthy", "error", binding.discoveryPath, `${binding.providerId} does not resolve the canonical project Harness.`));
          }
        }
      }
    } catch (error) {
      findings.push(finding("discovery_failed", "error", null, message(error)));
    }
  }
  return {
    healthy: !findings.some((item) => item.severity === "error"),
    projectId,
    skillName,
    revision,
    contentFingerprint,
    counts,
    providerBindings,
    findings,
  };
}

export async function auditProjectHarness(
  options: ProjectHarnessDiagnosticOptions,
): Promise<ProjectHarnessDiagnosticResult> {
  const result = await doctorProjectHarness(options);
  let skillRoot: string;
  try {
    skillRoot = await assertPhysicalDirectory(options.skillRoot, "project Harness");
  } catch {
    return result;
  }
  const changes = await discoverChangeEvidence(skillRoot, result.findings);
  const registryChanges = await validateIdentityDirectory(skillRoot, "state/registry/changes", "change_id", result.findings);
  await validateIdentityDirectory(skillRoot, "state/registry/contracts", "change_id", result.findings);
  await validateIdentityDirectory(skillRoot, "state/registry/lanes", "lane_id", result.findings);
  await validateIdentityDirectory(skillRoot, "state/registry/integrations", "integration_id", result.findings);
  await validateChangeIndex(skillRoot, changes, result.findings);
  await validateChangeRegistry(changes, registryChanges, result.findings);
  await validatePortableJsonState(skillRoot, result.findings);
  return {
    ...result,
    healthy: !result.findings.some((item) => item.severity === "error"),
  };
}

async function requirePhysicalFile(
  skillRoot: string,
  relativePath: string,
  findings: ProjectHarnessFinding[],
): Promise<void> {
  try {
    const path = await resolveWithinPhysicalRoot(skillRoot, relativePath, "project Harness");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("is not a physical file");
  } catch (error) {
    findings.push(finding("missing_required_file", "error", relativePath, `${relativePath} ${message(error)}`));
  }
}

async function populateCounts(
  skillRoot: string,
  counts: ProjectHarnessStateCounts,
  findings: ProjectHarnessFinding[],
): Promise<void> {
  const mappings = [
    ["state/changes/active", "activeChanges"],
    ["state/changes/parking", "parkingChanges"],
    ["state/changes/archive", "archivedChanges"],
    ["state/registry/changes", "registryChanges"],
    ["state/registry/lanes", "lanes"],
    ["state/registry/contracts", "contracts"],
    ["state/registry/integrations", "integrations"],
  ] as const;
  for (const [path, key] of mappings) {
    try {
      counts[key] = (await readdir(await assertPhysicalDirectory(join(skillRoot, path), path), { withFileTypes: true }))
        .filter((entry) => key.endsWith("Changes") && path.includes("state/changes") ? entry.isDirectory() : entry.isFile())
        .length;
    } catch (error) {
      findings.push(finding("invalid_state_directory", "error", path, message(error)));
    }
  }
  const resultsPath = join(skillRoot, "state", "evolution", "results.tsv");
  if (existsSync(resultsPath)) {
    const rows = (await readFile(resultsPath, "utf8")).split(/\r?\n/).filter((line) => line.trim());
    counts.evolutionResults = Math.max(0, rows.length - (rows[0]?.startsWith("timestamp") ? 1 : 0));
  }
  counts.evolutionPending = existsSync(join(skillRoot, "state", "evolution", "pending.json"));
}

interface ChangeEvidenceIdentity {
  id: string;
  bucket: "active" | "parking" | "archive";
}

async function discoverChangeEvidence(
  skillRoot: string,
  findings: ProjectHarnessFinding[],
): Promise<Map<string, ChangeEvidenceIdentity>> {
  const result = new Map<string, ChangeEvidenceIdentity>();
  for (const bucket of ["active", "parking", "archive"] as const) {
    const root = join(skillRoot, "state", "changes", bucket);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        findings.push(finding("invalid_change_entry", "error", `state/changes/${bucket}/${entry.name}`, "Change evidence must be a physical directory."));
        continue;
      }
      if (result.has(entry.name)) {
        findings.push(finding("duplicate_change_evidence", "error", null, `Change ${entry.name} appears in multiple lifecycle buckets.`));
        continue;
      }
      result.set(entry.name, { id: entry.name, bucket });
      for (const relative of REQUIRED_CHANGE_FILES) {
        await requirePhysicalFile(skillRoot, `state/changes/${bucket}/${entry.name}/${relative}`, findings);
      }
    }
  }
  return result;
}

async function validateIdentityDirectory(
  skillRoot: string,
  relativeRoot: string,
  identityField: string,
  findings: ProjectHarnessFinding[],
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  const root = join(skillRoot, relativeRoot);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== ".json") continue;
    const id = basename(entry.name, ".json");
    try {
      const value = await readJsonObject(join(root, entry.name));
      if (value[identityField] !== id) throw new Error(`${identityField} does not match the filename`);
      result.set(id, value);
    } catch (error) {
      findings.push(finding("registry_identity_mismatch", "error", `${relativeRoot}/${entry.name}`, message(error)));
    }
  }
  return result;
}

async function validateChangeIndex(
  skillRoot: string,
  changes: Map<string, ChangeEvidenceIdentity>,
  findings: ProjectHarnessFinding[],
): Promise<void> {
  try {
    const value = await readJsonObject(join(skillRoot, "state", "changes", "INDEX.json"));
    const rows = Array.isArray(value.changes) ? value.changes : [];
    const indexIds = rows.map((row) => isRecord(row) ? row.change_id : null).filter((id): id is string => typeof id === "string");
    const expected = [...changes.keys()].sort();
    if ([...new Set(indexIds)].sort().join("\0") !== expected.join("\0") || indexIds.length !== expected.length) {
      findings.push(finding("change_index_drift", "error", "state/changes/INDEX.json", "Change INDEX identities do not match active, parking, and archive evidence."));
    }
  } catch (error) {
    findings.push(finding("invalid_change_index", "error", "state/changes/INDEX.json", message(error)));
  }
}

async function validateChangeRegistry(
  changes: Map<string, ChangeEvidenceIdentity>,
  records: Map<string, Record<string, unknown>>,
  findings: ProjectHarnessFinding[],
): Promise<void> {
  for (const [id, change] of changes) {
    const record = records.get(id);
    if (!record) {
      findings.push(finding("missing_change_registry", "error", `state/registry/changes/${id}.json`, "Change evidence has no Registry record."));
      continue;
    }
    const status = typeof record.status === "string" ? record.status : "";
    const terminal = ["completed", "blocked", "abandoned"].includes(status);
    if ((change.bucket === "archive") !== terminal || (change.bucket === "parking") !== (status === "parking")) {
      findings.push(finding("change_lifecycle_mismatch", "error", `state/registry/changes/${id}.json`, `Registry status ${status || "<missing>"} disagrees with ${change.bucket} evidence.`));
    }
  }
  for (const id of records.keys()) {
    if (!changes.has(id)) findings.push(finding("orphan_change_registry", "error", `state/registry/changes/${id}.json`, "Registry Change has no evidence directory."));
  }
}

async function validatePortableJsonState(skillRoot: string, findings: ProjectHarnessFinding[]): Promise<void> {
  const roots = ["state/manifest.json", "state/analysis", "state/registry", "state/evolution"];
  for (const root of roots) {
    const absolute = join(skillRoot, root);
    if (!existsSync(absolute)) continue;
    const info = await lstat(absolute);
    const files = info.isDirectory() ? await collectJsonFiles(absolute) : [absolute];
    for (const path of files) {
      try {
        const value = await readJsonObject(path);
        walkPathFields(value, (field, pathValue) => {
          if (isMachineAbsolutePath(pathValue)) {
            findings.push(finding("absolute_path_in_skill_state", "error", path.slice(skillRoot.length + 1).replace(/\\/g, "/"), `${field} persists a machine absolute path.`));
          }
        });
      } catch (error) {
        findings.push(finding("invalid_json_state", "error", path.slice(skillRoot.length + 1).replace(/\\/g, "/"), message(error)));
      }
    }
  }
}

async function collectJsonFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`State contains a link or Junction: ${path}`);
    if (entry.isDirectory()) files.push(...await collectJsonFiles(path));
    else if (entry.isFile() && extname(entry.name) === ".json") files.push(path);
  }
  return files;
}

function walkPathFields(value: unknown, visit: (field: string, value: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walkPathFields(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const pathField = key === "path" || key === "paths" || key === "root" || key.endsWith("_path") || key.endsWith("_root");
    if (pathField && typeof nested === "string") visit(key, nested);
    if (pathField && Array.isArray(nested)) {
      nested.filter((item): item is string => typeof item === "string").forEach((item) => visit(key, item));
    }
    walkPathFields(nested, visit);
  }
}

function isMachineAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || /^\/(?!\/)/.test(value);
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const value = parseJsonText(await readFile(path, "utf8"), path);
  if (!isRecord(value)) throw new Error("must contain a JSON object");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyCounts(): ProjectHarnessStateCounts {
  return {
    activeChanges: 0,
    parkingChanges: 0,
    archivedChanges: 0,
    registryChanges: 0,
    lanes: 0,
    contracts: 0,
    integrations: 0,
    evolutionResults: 0,
    evolutionPending: false,
  };
}

function diagnosticResult(
  findings: ProjectHarnessFinding[],
  counts: ProjectHarnessStateCounts,
): ProjectHarnessDiagnosticResult {
  return {
    healthy: false,
    projectId: null,
    skillName: null,
    revision: null,
    contentFingerprint: null,
    counts,
    providerBindings: [],
    findings,
  };
}

function finding(
  code: string,
  severity: ProjectHarnessFindingSeverity,
  path: string | null,
  messageValue: string,
): ProjectHarnessFinding {
  return { code, severity, path, message: messageValue };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
