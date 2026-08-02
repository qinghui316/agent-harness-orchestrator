import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { extname, posix } from "node:path";
import { z } from "zod";
import { parseJsonText } from "../fs/json.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

const COMPLETE_BUNDLE_FILES = [
  "project-profile.json",
  "architecture.json",
  "audit.json",
  "creation-delta.json",
] as const;

const AUDIT_DIMENSIONS = {
  project_knowledge: 25,
  mechanical_checks: 20,
  environment: 15,
  coordination: 15,
  ecl_changes: 15,
  evolution: 10,
} as const;

const DECISION_ACTIONS = new Set(["retain", "move", "merge", "retire", "archive-only", "create"]);
const ARTIFACT_ACTIONS = new Set(["retain", "archive-only", "create", "replace", "merge", "retire"]);
const REQUIRED_WORKFLOWS = new Set([
  "references/workflows/intake.md",
  "references/workflows/locate.md",
  "references/workflows/plan.md",
  "references/workflows/implement.md",
  "references/workflows/verify.md",
  "references/workflows/close.md",
  "references/workflows/integrate.md",
  "references/workflows/evolve.md",
  "references/workflows/bootstrap-project.md",
]);
const PROTECTED_ARTIFACTS = new Set([
  "state/manifest.json",
  "references/project_wiki/.ecl-baselines.json",
  "references/project_wiki/index.json",
  "references/project_wiki/catalog.md",
  "references/rules/critical.md",
  "references/audit-rubric.json",
]);
const PROTECTED_PREFIXES = ["state/", "scripts/harness_runtime/", "references/rules/by-stage/"];
const TEXT_SUFFIXES = new Set([".md", ".json", ".yaml", ".yml", ".py", ".ps1", ".sh", ".mjs"]);
const TRUSTED_EVIDENCE_PREFIXES = ["http://", "https://", "user:", "contract:", "registry:"];
const SECRET_FIELD = /(?:password|secret|token|api[_-]?key|private[_-]?key)/i;

const EvidenceRecordSchema = z.object({
  evidence: z.array(z.string().trim().min(1)).min(1),
}).passthrough();

const ProfileSchema = z.object({
  schema_version: z.literal("1.0"),
  analysis_status: z.literal("complete"),
  project_id: z.string().trim().min(1).optional(),
  project_name: z.string().trim().min(1),
  purpose: EvidenceRecordSchema.extend({ summary: z.string().trim().min(1) }),
  primary_flows: z.array(z.unknown()),
  languages: z.array(EvidenceRecordSchema).min(1),
  frameworks: z.array(z.unknown()),
  package_managers: z.array(z.unknown()),
  source_roots: z.array(z.unknown()),
  entrypoints: z.array(z.unknown()),
  modules: z.array(z.unknown()),
  commands: z.array(z.unknown()),
  environment: z.record(z.unknown()),
  ci: z.array(z.unknown()),
  bridges: z.array(z.unknown()),
  reference_projects: z.array(z.unknown()),
  global_boundaries: z.array(z.unknown()),
  unknowns: z.array(z.unknown()),
  evidence: z.array(z.string().trim().min(1)).min(1),
}).passthrough();

const ArchitectureSchema = z.object({
  schema_version: z.literal("1.0"),
  analysis_status: z.literal("complete"),
  layers: z.array(z.unknown()),
  dependencies: z.array(z.unknown()).default([]),
  components: z.array(z.unknown()).default([]),
  circular_dependencies: z.array(z.unknown()),
  key_interfaces: z.array(z.unknown()),
  code_paths: z.array(z.unknown()),
  error_patterns: z.record(z.unknown()),
  evidence: z.array(z.string().trim().min(1)).min(1),
}).passthrough();

const AuditSchema = z.object({
  schema_version: z.literal("1.0"),
  analysis_status: z.literal("complete"),
  dimensions: z.record(z.unknown()),
  overall_score: z.number(),
  strengths: z.array(z.unknown()),
  gaps: z.array(z.unknown()),
  knowledge_findings: z.array(z.unknown()).default([]),
}).passthrough();

const CreationDeltaSchema = z.object({
  schema_version: z.literal("1.0"),
  mode: z.enum(["init", "migrate", "evolve"]),
  decisions: z.array(z.unknown()),
  artifacts: z.array(z.unknown()),
}).passthrough();

export type CompleteBundleOperation = "init" | "migrate" | "evolve";

export interface LoadCompleteAnalysisBundleOptions {
  bundleRoot: string;
  projectRoot: string;
  projectId: string;
  operation: CompleteBundleOperation;
  allowExecutableArtifacts?: boolean;
}

export interface CompleteAnalysisBundle {
  root: string;
  projectProfile: z.infer<typeof ProfileSchema>;
  architecture: z.infer<typeof ArchitectureSchema>;
  audit: z.infer<typeof AuditSchema>;
  creationDelta: z.infer<typeof CreationDeltaSchema>;
  contentFingerprint: string;
  artifactPaths: string[];
}

export async function loadCompleteAnalysisBundle(
  options: LoadCompleteAnalysisBundleOptions,
): Promise<CompleteAnalysisBundle> {
  const bundleRoot = await assertPhysicalDirectory(options.bundleRoot, "analysis bundle");
  const projectRoot = await assertPhysicalDirectory(options.projectRoot, "project source");
  const rawFiles = new Map<string, Buffer>();
  const parsed = new Map<string, unknown>();
  for (const name of COMPLETE_BUNDLE_FILES) {
    const path = await resolveWithinPhysicalRoot(bundleRoot, name, "analysis bundle");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Analysis bundle requires a physical ${name} file.`);
    }
    const raw = await readFile(path);
    rawFiles.set(name, raw);
    parsed.set(name, parseJsonText(raw.toString("utf8"), path));
  }

  const projectProfile = ProfileSchema.parse(parsed.get("project-profile.json"));
  const architecture = ArchitectureSchema.parse(parsed.get("architecture.json"));
  const audit = AuditSchema.parse(parsed.get("audit.json"));
  const creationDelta = CreationDeltaSchema.parse(parsed.get("creation-delta.json"));
  if (projectProfile.project_id !== undefined && projectProfile.project_id !== options.projectId) {
    throw new Error("Project profile id does not match the target project.");
  }
  if (creationDelta.mode !== options.operation) {
    throw new Error(`Creation delta mode ${creationDelta.mode} does not match ${options.operation}.`);
  }
  if ("capability_profiles" in creationDelta) {
    throw new Error("Creation delta capability_profiles is obsolete.");
  }
  rejectSecretBearingFields(projectProfile);
  validateProfileCompleteness(projectProfile);
  await validateEvidenceTree(projectProfile, projectRoot, "project profile", true);
  validateArchitectureCompleteness(architecture);
  await validateEvidenceTree(architecture, projectRoot, "architecture", true);
  validateAudit(audit);
  await validateEvidenceTree(audit, projectRoot, "audit", true);
  const artifactPaths = await validateCreationDelta(
    creationDelta,
    bundleRoot,
    projectRoot,
    options.operation,
    options.allowExecutableArtifacts ?? false,
    rawFiles,
  );
  return {
    root: bundleRoot,
    projectProfile,
    architecture,
    audit,
    creationDelta,
    contentFingerprint: fingerprintBundle(rawFiles),
    artifactPaths,
  };
}

function validateProfileCompleteness(profile: z.infer<typeof ProfileSchema>): void {
  if ("documents" in profile || "document_candidates" in profile) {
    throw new Error("A complete project profile must express project knowledge directly.");
  }
  if (profile.source_roots.length + profile.entrypoints.length + profile.modules.length === 0) {
    throw new Error("A complete project profile requires implementation structure.");
  }
  if (profile.primary_flows.length + profile.commands.length + profile.ci.length + profile.global_boundaries.length === 0) {
    throw new Error("A complete project profile requires a workflow, command, CI, or boundary fact.");
  }
  validateEvidenceBackedRecords(profile.languages, "languages");
  validateEvidenceBackedRecords(profile.source_roots, "source_roots");
  validateEvidenceBackedRecords(profile.entrypoints, "entrypoints");
  validateEvidenceBackedRecords(profile.modules, "modules");
  validateEvidenceBackedRecords(profile.primary_flows, "primary_flows", false);
  validateEvidenceBackedRecords(profile.commands, "commands", false);
  validateEvidenceBackedRecords(profile.ci, "ci", false);
  validateEvidenceBackedRecords(profile.global_boundaries, "global_boundaries", false);
}

function validateEvidenceBackedRecords(values: unknown[], label: string, allowEmpty = true): void {
  if (!allowEmpty && values.length === 0) return;
  for (const value of values) {
    EvidenceRecordSchema.parse(value);
  }
}

function validateArchitectureCompleteness(architecture: z.infer<typeof ArchitectureSchema>): void {
  if (architecture.layers.length + architecture.components.length
    + architecture.key_interfaces.length + architecture.code_paths.length === 0) {
    throw new Error("A complete architecture requires an evidenced layer, component, interface, or code path.");
  }
  for (const key of ["layers", "dependencies", "components", "circular_dependencies", "key_interfaces", "code_paths"] as const) {
    for (const value of architecture[key]) EvidenceRecordSchema.parse(value);
  }
}

function validateAudit(audit: z.infer<typeof AuditSchema>): void {
  if ("profile" in audit) throw new Error("Audit profile is obsolete.");
  const names = Object.keys(audit.dimensions).sort();
  const expectedNames = Object.keys(AUDIT_DIMENSIONS).sort();
  if (names.join("\0") !== expectedNames.join("\0")) {
    throw new Error("A complete audit must score every core audit dimension exactly once.");
  }
  let weighted = 0;
  for (const [name, weight] of Object.entries(AUDIT_DIMENSIONS)) {
    const item = z.object({ score: z.number().min(0).max(10), weight: z.literal(weight) })
      .passthrough().parse(audit.dimensions[name]);
    weighted += item.score * weight / 100;
  }
  if (Math.abs(audit.overall_score - weighted) > 0.05) {
    throw new Error(`Audit overall_score must equal the weighted score ${weighted.toFixed(2)}.`);
  }
  for (const gap of audit.gaps) {
    z.object({
      priority: z.string().trim().min(1),
      dimension: z.string().trim().min(1),
      issue: z.string().trim().min(1),
      fix: z.string().trim().min(1),
      evidence: z.array(z.string().trim().min(1)).min(1),
    }).passthrough().parse(gap);
  }
  for (const finding of audit.knowledge_findings) {
    z.object({
      type: z.string().trim().min(1),
      decision: z.enum(["promote", "retain", "merge", "retire", "archive-only"]),
      owner: z.string().trim().min(1),
      projection: z.string().trim().min(1),
      repair: z.string().trim().min(1),
      validation: z.string().trim().min(1),
    }).passthrough().parse(finding);
  }
}

async function validateCreationDelta(
  delta: z.infer<typeof CreationDeltaSchema>,
  bundleRoot: string,
  projectRoot: string,
  operation: CompleteBundleOperation,
  allowExecutableArtifacts: boolean,
  rawFiles: Map<string, Buffer>,
): Promise<string[]> {
  for (const decision of delta.decisions) {
    const value = z.object({
      source: z.string().trim().min(1),
      action: z.string().trim().min(1),
      owner: z.string().trim().min(1),
      projection: z.string().trim().min(1),
      validation: z.string().trim().min(1),
    }).passthrough().parse(decision);
    if (!DECISION_ACTIONS.has(value.action)) throw new Error(`Invalid migration decision action: ${value.action}`);
  }
  const paths = new Set<string>();
  for (const artifact of delta.artifacts) {
    const value = z.object({
      path: z.string().trim().min(1),
      action: z.string().trim().min(1),
      owner: z.string().trim().min(1).optional(),
      validation: z.string().trim().min(1).optional(),
      source: z.string().trim().min(1).optional(),
      evidence: z.array(z.string().trim().min(1)).optional(),
    }).passthrough().parse(artifact);
    if ("capability_profile" in value) throw new Error(`Artifact ${value.path} uses obsolete capability_profile metadata.`);
    const target = normalizePortablePath(value.path, "artifact target");
    if (paths.has(target)) throw new Error(`Creation delta contains duplicate artifact target: ${target}`);
    paths.add(target);
    if (!ARTIFACT_ACTIONS.has(value.action)) throw new Error(`Unsupported creation-delta action: ${value.action}`);
    if (value.action === "retain" || value.action === "archive-only") continue;
    if (!value.owner || !value.validation || !value.evidence?.length) {
      throw new Error(`Artifact ${target} requires owner, validation, and evidence.`);
    }
    await validateEvidenceValues(value.evidence, projectRoot, `artifact ${target}`, true);
    assertAllowedArtifactTarget(target);
    if (value.action === "retire") {
      if (operation === "init") throw new Error("Artifact retirement is not allowed during project init.");
      if (target === "SKILL.md" || target === "references/rules/red_lines.yaml" || REQUIRED_WORKFLOWS.has(target)) {
        throw new Error(`A publication candidate cannot retire a required project Harness owner: ${target}`);
      }
      if (value.validation !== "retired") throw new Error(`Retired artifact ${target} must declare validation: retired.`);
      continue;
    }
    if (!value.source) throw new Error(`Artifact ${target} requires a bundle source.`);
    const source = normalizePortablePath(value.source, "artifact source");
    if (!source.startsWith("artifacts/")) throw new Error(`Artifact source must be below artifacts/: ${source}`);
    const sourcePath = await resolveWithinPhysicalRoot(bundleRoot, source, "analysis bundle artifact");
    const info = await lstat(sourcePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Artifact source must be a physical file: ${source}`);
    const raw = await readFile(sourcePath);
    if (raw.includes(0)) throw new Error(`Artifact source must be UTF-8 text: ${source}`);
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      throw new Error(`Artifact source must be UTF-8 text: ${source}`);
    }
    rawFiles.set(source, raw);
    const executable = target.startsWith("scripts/checks/") || target.startsWith("scripts/helpers/");
    if (executable && !allowExecutableArtifacts) {
      throw new Error(`Executable artifact ${target} requires explicit authorization.`);
    }
    if (executable && ["text-present", "workflow-contract", "rule-source"].includes(value.validation)) {
      throw new Error(`Executable artifact ${target} requires an executable validation command.`);
    }
    if (target === "references/rules/red_lines.yaml" && value.validation !== "rule-source") {
      throw new Error("The rule source must declare validation: rule-source.");
    }
    if (target.startsWith("references/workflows/") && value.validation !== "workflow-contract") {
      throw new Error(`Workflow artifact ${target} must declare validation: workflow-contract.`);
    }
  }
  return [...paths].sort();
}

async function validateEvidenceTree(
  value: unknown,
  projectRoot: string,
  label: string,
  rejectRepositoryProse: boolean,
): Promise<void> {
  const evidenceSets: string[][] = [];
  walk(value, (key, nested) => {
    if (key === "evidence" && Array.isArray(nested) && nested.length > 0) {
      evidenceSets.push(nested.filter((item): item is string => typeof item === "string"));
    }
  });
  for (const evidence of evidenceSets) {
    await validateEvidenceValues(evidence, projectRoot, label, rejectRepositoryProse);
  }
}

async function validateEvidenceValues(
  values: string[],
  projectRoot: string,
  label: string,
  rejectRepositoryProse: boolean,
): Promise<void> {
  if (values.length === 0) throw new Error(`${label} evidence must not be empty.`);
  for (const value of values) {
    if (TRUSTED_EVIDENCE_PREFIXES.some((prefix) => value.startsWith(prefix))) continue;
    const relative = normalizePortablePath(value, `${label} evidence`);
    if (rejectRepositoryProse && isRepositoryProsePath(relative)) {
      throw new Error(`${label} cannot persist repository prose-document evidence: ${relative}`);
    }
    await resolveWithinPhysicalRoot(projectRoot, relative, `${label} evidence`);
  }
}

function rejectSecretBearingFields(value: unknown, path = "project-profile"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretBearingFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD.test(key) && nested !== null && nested !== "" && nested !== false
      && (!Array.isArray(nested) || nested.length > 0)) {
      throw new Error(`Secret-bearing field is not allowed at ${path}.${key}.`);
    }
    rejectSecretBearingFields(nested, `${path}.${key}`);
  }
}

function assertAllowedArtifactTarget(path: string): void {
  if (PROTECTED_ARTIFACTS.has(path) || PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    throw new Error(`Creation delta cannot write a protected project Harness path: ${path}`);
  }
  if (path === "SKILL.md" || path === "references/rules/red_lines.yaml") return;
  const suffix = extname(path).toLowerCase();
  if (path.startsWith("references/")) {
    if (![".md", ".json", ".yaml", ".yml"].includes(suffix)) throw new Error(`Unsupported reference artifact: ${path}`);
    return;
  }
  if (path.startsWith("assets/")) return;
  if (path.startsWith("scripts/checks/") || path.startsWith("scripts/helpers/")) {
    if (![".py", ".ps1", ".sh", ".mjs"].includes(suffix)) throw new Error(`Unsupported executable artifact: ${path}`);
    return;
  }
  if (!TEXT_SUFFIXES.has(suffix)) throw new Error(`Unsupported project Harness artifact: ${path}`);
  throw new Error(`Creation delta cannot write an unsupported project Harness path: ${path}`);
}

function normalizePortablePath(value: string, label: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized === "." || posix.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${label} must be a portable relative path: ${value}`);
  }
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} contains an unsafe segment: ${value}`);
  }
  return normalized;
}

function isRepositoryProsePath(value: string): boolean {
  const name = value.split("/").at(-1)?.toLowerCase() ?? "";
  const suffix = extname(name);
  return name === "readme" || [".md", ".markdown", ".rst", ".adoc", ".asciidoc"].includes(suffix)
    || /^(?:readme|status|current(?:[-_ ]?(?:state|plan|status))?|roadmap|contributing|changelog|architecture|design|decisions?)(?:[.-][^/]+)*\.txt$/.test(name);
}

function walk(value: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    visit(key, nested);
    walk(nested, visit);
  }
}

function fingerprintBundle(files: Map<string, Buffer>): string {
  const hash = createHash("sha256");
  for (const [path, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(path);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}
