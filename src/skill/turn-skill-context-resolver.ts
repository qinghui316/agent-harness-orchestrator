import { createHash } from "node:crypto";
import { slugify } from "../fs/path.js";
import type { ProviderSkillInput } from "../project-harness/contracts.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../project-runtime/paths.js";
import type { ProviderSkillCatalogSnapshot } from "../provider-runtime/contracts.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type {
  TurnSkillContextDiagnostic,
  TurnSkillContextPort,
  TurnSkillContextRequest,
  TurnSkillContextResolution,
} from "../workbench/conversation-turn-contract.js";
import type { WorkbenchDatabase } from "../workbench/persistence/database.js";
import type { StoredConversation, StoredSkillEnablement, StoredSkillRoot } from "../workbench/persistence/contracts.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import {
  buildSkillCatalog,
  type SkillListItem,
  type SkillSourceKind,
} from "./catalog.js";
import {
  canonicalExistingSkillEntryPath,
  canonicalPathIdentity,
  sameSkillPath,
  skillPathIdentity,
} from "./path-identity.js";

export interface TurnSkillContextResolverOptions {
  providerRegistry: Pick<ProviderRegistry, "get">;
  resolvePaths?: (projectId: string) => ProjectRuntimePaths;
  openDatabase?: (paths: ProjectRuntimePaths) => Promise<WorkbenchDatabase>;
  resolveSourceSkillInputs?: (
    request: TurnSkillContextRequest,
    providerId: string,
  ) => Promise<readonly ProviderSkillInput[]> | readonly ProviderSkillInput[];
}

interface SelectionState {
  roots: StoredSkillRoot[];
  enablements: StoredSkillEnablement[];
}

interface ValidatedSkill {
  item: SkillListItem;
  path: string;
  source: ProviderSkillInput["source"];
}

export class TurnSkillContextResolver implements TurnSkillContextPort {
  private readonly providerRegistry: Pick<ProviderRegistry, "get">;
  private readonly resolvePaths: (projectId: string) => ProjectRuntimePaths;
  private readonly openDatabase: (paths: ProjectRuntimePaths) => Promise<WorkbenchDatabase>;
  private readonly resolveSourceSkillInputs: NonNullable<TurnSkillContextResolverOptions["resolveSourceSkillInputs"]>;

  constructor(options: TurnSkillContextResolverOptions) {
    this.providerRegistry = options.providerRegistry;
    this.resolvePaths = options.resolvePaths ?? ((projectId) => resolveProjectRuntimePaths(projectId));
    this.openDatabase = options.openDatabase ?? openProjectRuntimeWorkbenchDatabase;
    this.resolveSourceSkillInputs = options.resolveSourceSkillInputs ?? (() => []);
  }

  async resolve(request: TurnSkillContextRequest): Promise<TurnSkillContextResolution> {
    assertRequestIdentity(request);
    const providerId = request.conversation.selectedProviderId;
    const paths = this.resolvePaths(request.project.id);
    if (paths.projectId !== request.project.id) {
      throw new Error("Turn Skill Runtime paths do not match the selected project identity.");
    }

    const state = await this.readSelectionState(paths, request.conversation);
    const snapshot = await this.providerRegistry.get(providerId).skills.list({
      projectPath: request.project.path,
      extraRoots: state.roots.map((root) => root.rootPath),
    });
    assertSnapshotIdentity(snapshot, request.project.path, providerId);

    const diagnostics: TurnSkillContextDiagnostic[] = snapshot.errors.map((error) => ({
      code: "provider_catalog_error",
      message: error.path + ": " + error.message,
    }));
    const sourceInputs = await this.resolveSourceSkillInputs(request, providerId);
    const identity = validateSourceInputs(snapshot, sourceInputs, diagnostics);
    const catalog = buildSkillCatalog(snapshot, state, identity.validInputs);
    const requiredSkills = resolveRequiredSkills(catalog.skills, request.requiredSkillIds);
    const requiredIds = new Set(requiredSkills.map((skill) => skill.skillId));
    const selectedSkills = catalog.skills.filter((skill) =>
      isPersistedSelectionEnabled(skill, request.conversation.conversationId));

    addOrphanSelectionDiagnostics(
      state.enablements,
      catalog.skills,
      request.conversation.conversationId,
      diagnostics,
    );

    const validated: ValidatedSkill[] = [];
    for (const item of uniqueSkills([...selectedSkills, ...requiredSkills])) {
      const required = requiredIds.has(item.skillId);
      const failure = validateCandidate(item, identity.invalidSkillIds);
      if (failure) {
        if (required) throw skillResolutionError(item.skillId, failure.code, failure.message);
        diagnostics.push({ ...failure, skillId: item.skillId });
        continue;
      }
      validated.push({
        item,
        path: canonicalExistingSkillEntryPath(item.sourcePath),
        source: providerSource(item.sourceKind),
      });
    }

    const ambiguousNames = duplicateNames(validated);
    for (const name of ambiguousNames) {
      const matches = validated.filter(({ item }) => item.name === name);
      if (matches.some(({ item }) => requiredIds.has(item.skillId))) {
        throw skillResolutionError(
          slugify(name),
          "required_skill_ambiguous",
          "Required Skill " + name + " resolves to multiple Provider paths.",
        );
      }
      diagnostics.push({
        code: "optional_skill_ambiguous",
        message: "Selected optional Skill " + name + " resolves to multiple Provider paths and was omitted.",
        skillId: slugify(name),
      });
    }

    const skillInputs = validated
      .filter(({ item }) => !ambiguousNames.has(item.name))
      .map(({ item, path, source }): ProviderSkillInput => ({
        id: item.name,
        path,
        source,
        contentHash: item.contentHash,
        required: requiredIds.has(item.skillId),
      }))
      .sort(compareSkillInputs);

    return { skillInputs: deduplicateInputs(skillInputs), diagnostics };
  }

  private async readSelectionState(
    paths: ProjectRuntimePaths,
    requestConversation: StoredConversation,
  ): Promise<SelectionState> {
    const database = await this.openDatabase(paths);
    try {
      const stored = database.conversations.readConversation(
        paths.projectId,
        requestConversation.conversationId,
        { includeDeleted: true },
      );
      assertCurrentConversation(stored, requestConversation);
      return {
        roots: database.skills.listSkillRoots(paths.projectId),
        enablements: database.skills.listSkillEnablement(paths.projectId),
      };
    } finally {
      database.close();
    }
  }
}

function assertRequestIdentity(request: TurnSkillContextRequest): void {
  if (request.project.id !== request.conversation.projectId) {
    throw new Error("Turn Skill request project does not match the stored Conversation.");
  }
}

function assertSnapshotIdentity(
  snapshot: ProviderSkillCatalogSnapshot,
  projectPath: string,
  providerId: string,
): void {
  if (snapshot.providerId !== providerId) {
    throw new Error(
      "Provider Skill catalog identity mismatch: expected " + providerId + ", received " + snapshot.providerId + ".",
    );
  }
  if (canonicalPathIdentity(snapshot.projectPath) !== canonicalPathIdentity(projectPath)) {
    throw new Error("Provider Skill catalog project path does not match the selected project.");
  }
}

function validateSourceInputs(
  snapshot: ProviderSkillCatalogSnapshot,
  inputs: readonly ProviderSkillInput[],
  diagnostics: TurnSkillContextDiagnostic[],
): { validInputs: ProviderSkillInput[]; invalidSkillIds: Set<string> } {
  const validInputs: ProviderSkillInput[] = [];
  const invalidSkillIds = new Set<string>();
  const identities = new Set<string>();
  for (const input of inputs) {
    const skillId = slugify(input.id);
    const identity = input.id + "\0" + skillPathIdentity(input.path);
    const sameName = snapshot.skills.filter((skill) => skill.name === input.id);
    const matching = deduplicateSkillsByPhysicalIdentity(
      sameName.filter((skill) => sameSkillPath(skill.path, input.path)),
    );
    const match = matching.length === 1 ? matching[0] : undefined;
    if (identities.has(identity) || !match || match.contentHash !== input.contentHash) {
      const reason = identities.has(identity)
        ? "duplicate source identity"
        : matching.length > 1
          ? "ambiguous Provider discovery identity"
          : !match
            ? "Provider discovery path identity mismatch"
            : "content fingerprint mismatch";
      diagnostics.push({
        code: "source_identity_mismatch",
        message: "Skill source identity " + input.id + " has " + reason + ".",
        skillId,
      });
      for (const candidate of sameName) invalidSkillIds.add(skillIdFor(snapshot, candidate));
      invalidSkillIds.add(skillId);
      identities.add(identity);
      continue;
    }
    identities.add(identity);
    try {
      validInputs.push({ ...input, path: canonicalExistingSkillEntryPath(match.path), required: false });
    } catch (error) {
      diagnostics.push({
        code: "source_identity_mismatch",
        message: error instanceof Error ? error.message : String(error),
        skillId,
      });
      invalidSkillIds.add(skillIdFor(snapshot, match));
      invalidSkillIds.add(skillId);
    }
  }
  return { validInputs, invalidSkillIds };
}

function resolveRequiredSkills(
  skills: readonly SkillListItem[],
  requiredSkillIds: readonly string[],
): SkillListItem[] {
  const resolved: SkillListItem[] = [];
  for (const id of [...new Set(requiredSkillIds.map((value) => slugify(value)))].sort()) {
    const exact = skills.filter((skill) => skill.skillId === id);
    const matches = exact.length > 0 ? exact : skills.filter((skill) => slugify(skill.name) === id);
    if (matches.length === 0) {
      throw skillResolutionError(
        id,
        "required_skill_missing",
        "Required Skill " + id + " was not discovered by the selected Provider.",
      );
    }
    if (matches.length !== 1) {
      throw skillResolutionError(
        id,
        "required_skill_ambiguous",
        "Required Skill " + id + " has an ambiguous Provider discovery identity.",
      );
    }
    resolved.push(matches[0]!);
  }
  return resolved;
}

function isPersistedSelectionEnabled(skill: SkillListItem, conversationId: string): boolean {
  if (skill.disabledTopics.includes(conversationId)) return false;
  if (skill.enabledTopics.includes(conversationId)) return true;
  return skill.enabledProject;
}

function addOrphanSelectionDiagnostics(
  enablements: readonly StoredSkillEnablement[],
  skills: readonly SkillListItem[],
  conversationId: string,
  diagnostics: TurnSkillContextDiagnostic[],
): void {
  const effective = new Map<string, StoredSkillEnablement>();
  for (const row of enablements.filter((item) =>
    item.scope === "project" || (item.scope === "topic" && item.changeId === conversationId))) {
    const current = effective.get(row.skillId);
    if (!current || row.scope === "topic") effective.set(row.skillId, row);
  }
  for (const row of effective.values()) {
    if (!row.enabled || skills.some((skill) => skill.skillId === row.skillId)) continue;
    const sameName = skills.filter((skill) => slugify(skill.name) === row.skillId);
    diagnostics.push({
      code: sameName.length > 1 ? "optional_skill_ambiguous" : "optional_skill_missing",
      message: sameName.length > 1
        ? "Selected optional Skill " + row.skillId + " is ambiguous in Provider discovery."
        : "Selected optional Skill " + row.skillId + " was not discovered by the selected Provider.",
      skillId: row.skillId,
    });
  }
}

function validateCandidate(
  skill: SkillListItem,
  invalidSourceIds: ReadonlySet<string>,
): { code: string; message: string } | null {
  if (invalidSourceIds.has(skill.skillId)) {
    return {
      code: "skill_identity_mismatch",
      message: "Skill " + skill.skillId + " does not match its registered source identity.",
    };
  }
  if (!skill.providerEnabled) {
    return {
      code: "skill_provider_disabled",
      message: "Skill " + skill.skillId + " is disabled in the Provider configuration.",
    };
  }
  try {
    canonicalExistingSkillEntryPath(skill.sourcePath);
  } catch (error) {
    return {
      code: "skill_path_invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (!skill.contentHash.trim()) {
    return {
      code: "skill_fingerprint_invalid",
      message: "Skill " + skill.skillId + " has an empty content fingerprint.",
    };
  }
  return null;
}

function providerSource(source: SkillSourceKind): ProviderSkillInput["source"] {
  if (source === "project-harness") return "project-harness";
  if (source === "system-aho") return "aho-system";
  return "provider-native";
}

function uniqueSkills(skills: readonly SkillListItem[]): SkillListItem[] {
  return [...new Map(skills.map((skill) => [skill.skillId, skill])).values()]
    .sort((left, right) => left.skillId.localeCompare(right.skillId));
}

function duplicateNames(skills: readonly ValidatedSkill[]): Set<string> {
  const counts = new Map<string, number>();
  for (const { item } of skills) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

function deduplicateInputs(inputs: readonly ProviderSkillInput[]): ProviderSkillInput[] {
  return [...new Map(inputs.map((input) => [
    input.id + "\0" + skillPathIdentity(input.path),
    input,
  ])).values()];
}

function compareSkillInputs(left: ProviderSkillInput, right: ProviderSkillInput): number {
  return left.id.localeCompare(right.id) || left.path.localeCompare(right.path);
}

function skillResolutionError(skillId: string, code: string, message: string): Error {
  const error = new Error(message);
  error.name = "TurnSkillContextError";
  Object.assign(error, { code, skillId });
  return error;
}

function skillIdFor(
  snapshot: ProviderSkillCatalogSnapshot,
  target: ProviderSkillCatalogSnapshot["skills"][number],
): string {
  const baseId = slugify(target.name);
  return deduplicateSkillsByPhysicalIdentity(snapshot.skills)
    .filter((skill) => slugify(skill.name) === baseId).length === 1
    ? baseId
    : baseId + "-" + createHash("sha256").update(canonicalPathIdentity(target.path)).digest("hex").slice(0, 8);
}

function assertCurrentConversation(
  stored: StoredConversation | null,
  requested: StoredConversation,
): asserts stored is StoredConversation {
  if (!stored || stored.deletedAt || stored.state !== "active") {
    throw skillResolutionError(requested.conversationId, "stale_conversation", "Turn Skill Conversation is no longer active.");
  }
  if (stored.projectId !== requested.projectId
    || stored.conversationId !== requested.conversationId
    || stored.productMode !== requested.productMode
    || stored.selectedProviderId !== requested.selectedProviderId
    || stored.currentGraphScopeId !== requested.currentGraphScopeId
    || stored.completedTurnSequence !== requested.completedTurnSequence) {
    throw skillResolutionError(
      requested.conversationId,
      "stale_conversation",
      "Turn Skill Conversation identity changed before Provider discovery.",
    );
  }
}

function deduplicateSkillsByPhysicalIdentity(
  skills: readonly ProviderSkillCatalogSnapshot["skills"][number][],
): ProviderSkillCatalogSnapshot["skills"][number][] {
  return [...new Map(skills.map((skill) => [
    [skill.name, skillPathIdentity(skill.path), skill.contentHash].join("\0"),
    skill,
  ])).values()];
}
