import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderSkillInput } from "../../src/project-harness/contracts.js";
import type {
  ProviderNativeSkill,
  ProviderSkillCatalogSnapshot,
} from "../../src/provider-runtime/contracts.js";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { hashNativeSkillPackageContent } from "../../src/skill/content-hash.js";
import { buildSkillCatalog, buildSkillResolutionCatalog } from "../../src/skill/catalog.js";
import { TurnSkillContextResolver } from "../../src/skill/turn-skill-context-resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import type { TurnSkillContextRequest } from "../../src/workbench/conversation-turn-contract.js";
import type { StoredConversation } from "../../src/workbench/persistence/contracts.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";

let root: string;
let project: ManagedProject;
let paths: ReturnType<typeof resolveProjectRuntimePaths>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-turn-skill-resolver-"));
  const projectPath = join(root, "project");
  await mkdir(projectPath, { recursive: true });
  project = {
    id: "resolver-project",
    name: "Resolver Project",
    path: projectPath,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  paths = resolveProjectRuntimePaths(project.id, join(root, "aho-home"));
  await initializeProjectRuntimeSidecar(paths);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("TurnSkillContextResolver", () => {
  it("applies project then first-send Conversation overrides and keeps project Harness optional", async () => {
    const ordinary = await createNativeSkill("ordinary-skill");
    const promoted = await createNativeSkill("promoted-skill");
    const harness = await createNativeSkill("resolver-project-harness");
    const snapshot = await catalog([ordinary, promoted, harness]);
    const conversation = storedConversation("conversation-1", "codex", "agent");
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.skills.setSkillEnablement(enablement("ordinary-skill", null, true));
      database.skills.setSkillEnablement(enablement("resolver-project-harness", null, true));
      database.unitOfWork.createConversationFromFirstSend({
        conversation,
        message: initialMessage(conversation),
        skillOverrides: [
          { skillId: "ordinary-skill", enabled: false },
          { skillId: "promoted-skill", enabled: true },
        ],
      });
    } finally {
      database.close();
    }

    const resolver = resolverFor(snapshot, [sourceInput(harness, "project-harness", true)]);
    const result = await resolver.resolve(requestFor(conversation));

    expect(result.skillInputs).toEqual([
      expect.objectContaining({ id: "promoted-skill", required: false, source: "provider-native" }),
      expect.objectContaining({
        id: "resolver-project-harness",
        required: false,
        source: "project-harness",
      }),
    ]);
    expect(result.skillInputs.map((input) => input.id)).not.toContain("ordinary-skill");
    expect(result.diagnostics).toEqual([]);
  });

  it("overlays required ids without mutating persisted disablement", async () => {
    const harness = await createNativeSkill("resolver-project-harness");
    const optional = await createNativeSkill("optional-disabled", false);
    const snapshot = await catalog([harness, optional]);
    const conversation = storedConversation("conversation-2", "codex", "harness");
    await seedConversation(conversation, [
      enablement("resolver-project-harness", conversation.conversationId, false),
      enablement("optional-disabled", conversation.conversationId, true),
    ]);

    const resolver = resolverFor(snapshot, [sourceInput(harness, "project-harness", false)]);
    const result = await resolver.resolve(requestFor(conversation, ["resolver-project-harness"]));

    expect(result.skillInputs).toEqual([
      expect.objectContaining({
        id: "resolver-project-harness",
        required: true,
        source: "project-harness",
      }),
    ]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "skill_provider_disabled",
      skillId: "optional-disabled",
    }));
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.skills.listSkillEnablement(project.id)).toContainEqual(expect.objectContaining({
        skillId: "resolver-project-harness",
        changeId: conversation.conversationId,
        enabled: false,
      }));
    } finally {
      database.close();
    }
  });

  it("treats a Junction or symlink alias as the same physical Harness Skill identity", async () => {
    const harness = await createNativeSkill("resolver-project-harness");
    const aliasRoot = join(root, "connector-alias");
    await symlink(dirname(harness.entryPath), aliasRoot, process.platform === "win32" ? "junction" : "dir");
    const snapshot = await catalog([
      { ...harness, path: join(aliasRoot, "SKILL.md") },
      { ...harness, path: harness.entryPath },
    ]);
    const conversation = storedConversation("conversation-alias", "codex", "harness");
    await seedConversation(conversation);

    const result = await resolverFor(snapshot, [sourceInput(harness, "project-harness", false)])
      .resolve(requestFor(conversation, ["resolver-project-harness"]));

    expect(result.skillInputs).toEqual([{
      id: "resolver-project-harness",
      path: await realpath(harness.entryPath),
      contentHash: harness.contentHash,
      source: "project-harness",
      required: true,
    }]);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps legacy alias-hashed project and Conversation selections effective", async () => {
    const selected = await createNativeSkill("duplicate-selection", true, "selected-physical");
    const other = await createNativeSkill("duplicate-selection", true, "other-physical");
    const aliasRoot = join(root, "selection-alias");
    await symlink(dirname(selected.entryPath), aliasRoot, process.platform === "win32" ? "junction" : "dir");
    const aliasPath = join(aliasRoot, "SKILL.md");
    const snapshot = await catalog([
      { ...selected, path: selected.entryPath },
      { ...selected, path: aliasPath },
      other,
    ]);
    const legacyPhysicalId = legacySkillId("duplicate-selection", selected.entryPath);
    const legacyAliasId = legacySkillId("duplicate-selection", aliasPath);

    const projectConversation = storedConversation("conversation-legacy-project", "codex", "agent");
    await seedConversation(projectConversation, [enablement(legacyAliasId, null, true)]);
    await expect(resolverFor(snapshot).resolve(requestFor(projectConversation))).resolves.toMatchObject({
      skillInputs: [expect.objectContaining({ id: "duplicate-selection", path: await realpath(selected.entryPath) })],
    });

    const topicConversation = storedConversation("conversation-legacy-topic", "codex", "agent");
    await seedConversation(topicConversation, [enablement(legacyPhysicalId, topicConversation.conversationId, true)]);
    await expect(resolverFor(snapshot).resolve(requestFor(topicConversation))).resolves.toMatchObject({
      skillInputs: [expect.objectContaining({ id: "duplicate-selection", path: await realpath(selected.entryPath) })],
    });
  });

  it("collapses conflicting aliases deterministically and fails according to requiredness", async () => {
    const skill = await createNativeSkill("conflicted-skill");
    const aliasRoot = join(root, "conflicted-alias");
    await symlink(dirname(skill.entryPath), aliasRoot, process.platform === "win32" ? "junction" : "dir");
    const alias = { ...skill, path: join(aliasRoot, "SKILL.md"), enabled: false, scope: "repo" as const };
    const physical = { ...skill, path: skill.entryPath, enabled: true, scope: "user" as const };
    const first = await catalog([alias, physical]);
    const second = await catalog([physical, alias]);
    const firstCatalog = buildSkillResolutionCatalog(first, { roots: [], enablements: [] });
    const secondCatalog = buildSkillResolutionCatalog(second, { roots: [], enablements: [] });
    expect(firstCatalog.skills).toHaveLength(1);
    expect(firstCatalog.skills).toEqual(secondCatalog.skills);
    expect(new Set(firstCatalog.skills.map((item) => item.skillId)).size).toBe(1);

    const conversation = storedConversation("conversation-conflicted", "codex", "agent");
    await seedConversation(conversation, [enablement("conflicted-skill", null, true)]);
    const optionalFirst = await resolverFor(first).resolve(requestFor(conversation));
    const optionalSecond = await resolverFor(second).resolve(requestFor(conversation));
    expect(optionalFirst).toEqual(optionalSecond);
    expect(optionalFirst).toMatchObject({
      skillInputs: [],
      diagnostics: [expect.objectContaining({ code: "skill_metadata_conflict", skillId: "conflicted-skill" })],
    });
    await expect(resolverFor(first).resolve(requestFor(conversation, ["conflicted-skill"]))).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: "skill_metadata_conflict",
    });
  });

  it("keeps distinct same-name physical Skills stably separated across discovery order", async () => {
    const first = await createNativeSkill("stable-duplicate", true, "stable-one");
    const second = await createNativeSkill("stable-duplicate", true, "stable-two");
    const forward = buildSkillCatalog(await catalog([first, second]), { roots: [], enablements: [] });
    const reverse = buildSkillCatalog(await catalog([second, first]), { roots: [], enablements: [] });
    expect(forward.skills.map((item) => item.skillId)).toEqual(reverse.skills.map((item) => item.skillId));
    expect(new Set(forward.skills.map((item) => item.skillId)).size).toBe(2);
  });

  it.runIf(process.platform !== "win32")("accepts file-symlink discovery", async () => {
    const skill = await createNativeSkill("path-forms-skill");
    const linkRoot = join(root, "file-link");
    await mkdir(linkRoot, { recursive: true });
    const linkedEntry = join(linkRoot, "SKILL.md");
    await symlink(skill.entryPath, linkedEntry, "file");
    const snapshot = await catalog([{ ...skill, path: linkedEntry }]);
    const conversation = storedConversation("conversation-path-forms", "codex", "harness");
    await seedConversation(conversation);
    const source = sourceInput(skill, "project-harness", false);

    await expect(resolverFor(snapshot, [source]).resolve(requestFor(conversation, ["path-forms-skill"])))
      .resolves.toEqual({
        skillInputs: [{
          id: "path-forms-skill",
          path: await realpath(skill.entryPath),
          contentHash: skill.contentHash,
          source: "project-harness",
          required: true,
        }],
        diagnostics: [],
      });
  });

  it("accepts a directory-form source input", async () => {
    const skill = await createNativeSkill("directory-source-skill");
    const conversation = storedConversation("conversation-directory-source", "codex", "harness");
    await seedConversation(conversation);
    const source = { ...sourceInput(skill, "project-harness", false), path: dirname(skill.entryPath) };

    await expect(resolverFor(await catalog([skill]), [source])
      .resolve(requestFor(conversation, [skill.name]))).resolves.toMatchObject({
        skillInputs: [expect.objectContaining({
          id: skill.name,
          path: await realpath(skill.entryPath),
          source: "project-harness",
          required: true,
        })],
        diagnostics: [],
      });
  });

  it("keeps the validated physical binding when a Provider alias is retargeted", async () => {
    const original = await createNativeSkill("retarget-skill", true, "retarget-original");
    const replacement = await createNativeSkill("retarget-skill", true, "retarget-replacement");
    const aliasRoot = join(root, "retarget-alias");
    await symlink(dirname(original.entryPath), aliasRoot, process.platform === "win32" ? "junction" : "dir");
    const snapshot = await catalog([{ ...original, path: join(aliasRoot, "SKILL.md") }]);
    const conversation = storedConversation("conversation-retarget", "codex", "agent");
    await seedConversation(conversation, [enablement("retarget-skill", null, true)]);
    const resolver = resolverFor(snapshot, [], async () => {
      await rm(aliasRoot, { recursive: true, force: true });
      await symlink(dirname(replacement.entryPath), aliasRoot, process.platform === "win32" ? "junction" : "dir");
    });

    const result = await resolver.resolve(requestFor(conversation));
    expect(result.skillInputs).toEqual([expect.objectContaining({
      path: await realpath(original.entryPath),
      contentHash: original.contentHash,
    })]);
    expect(result.skillInputs[0]!.path).not.toBe(await realpath(replacement.entryPath));
  });

  it("classifies bound path loss and content drift for optional and required Skills", async () => {
    for (const change of ["remove", "rewrite"] as const) {
      const skill = await createNativeSkill("changed-" + change, true, "changed-" + change);
      const snapshot = await catalog([skill]);
      const conversation = storedConversation("conversation-changed-" + change, "codex", "agent");
      await seedConversation(conversation, [enablement(skill.name, null, true)]);
      const resolver = resolverFor(snapshot, [], async () => {
        if (change === "remove") await rm(dirname(skill.entryPath), { recursive: true, force: true });
        else await writeFile(skill.entryPath, "---\nname: " + skill.name + "\ndescription: Changed.\n---\n", "utf8");
      });
      const expectedCode = change === "remove" ? "skill_path_unavailable" : "skill_fingerprint_changed";
      await expect(resolver.resolve(requestFor(conversation))).resolves.toMatchObject({
        skillInputs: [],
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: expectedCode, skillId: skill.name }),
        ]),
      });
    }

    const required = await createNativeSkill("required-lost");
    const requiredConversation = storedConversation("conversation-required-lost", "codex", "harness");
    await seedConversation(requiredConversation);
    const requiredResolver = resolverFor(await catalog([required]), [], async () => {
      await rm(dirname(required.entryPath), { recursive: true, force: true });
    });
    await expect(requiredResolver.resolve(requestFor(requiredConversation, [required.name]))).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: "skill_path_unavailable",
    });
  });

  it("rejects a source identity that has the same name but a different physical target", async () => {
    const discovered = await createNativeSkill("resolver-project-harness", true, "discovered-target");
    const registered = await createNativeSkill("resolver-project-harness", true, "registered-target");
    const conversation = storedConversation("conversation-physical-mismatch", "codex", "harness");
    await seedConversation(conversation);
    const resolver = resolverFor(
      await catalog([discovered]),
      [{ ...sourceInput(registered, "project-harness", false), contentHash: discovered.contentHash }],
    );

    await expect(resolver.resolve(requestFor(conversation, ["resolver-project-harness"]))).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: "skill_identity_mismatch",
    });
  });

  it.each([
    {
      label: "missing",
      build: async () => ({ skills: [], required: "missing-skill", sources: [] as ProviderSkillInput[] }),
      expectedCode: "required_skill_missing",
    },
    {
      label: "disabled",
      build: async () => {
        const skill = await createNativeSkill("disabled-skill", false);
        return { skills: [skill], required: "disabled-skill", sources: [] as ProviderSkillInput[] };
      },
      expectedCode: "skill_provider_disabled",
    },
    {
      label: "fingerprint mismatch",
      build: async () => {
        const skill = await createNativeSkill("hashed-skill");
        return {
          skills: [skill],
          required: "hashed-skill",
          sources: [{ ...sourceInput(skill, "project-harness", false), contentHash: "stale-hash" }],
        };
      },
      expectedCode: "skill_identity_mismatch",
    },
  ])("fails closed for a required Skill with $label identity", async ({ build, expectedCode }) => {
    const fixture = await build();
    const conversation = storedConversation("conversation-required", "codex", "harness");
    await seedConversation(conversation);
    const resolver = resolverFor(await catalog(fixture.skills), fixture.sources);

    await expect(resolver.resolve(requestFor(conversation, [fixture.required]))).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: expectedCode,
    });
  });

  it("omits ambiguous optional duplicate names and returns deterministic diagnostics", async () => {
    const first = await createNativeSkill("duplicate", true, "one");
    const second = await createNativeSkill("duplicate", true, "two");
    const stable = await createNativeSkill("z-stable");
    const snapshot = await catalog([second, stable, first]);
    const duplicateIds = snapshot.skills
      .filter((skill) => skill.name === "duplicate")
      .map((skill) => stableSkillId(snapshot, skill));
    const conversation = storedConversation("conversation-duplicates", "codex", "agent");
    await seedConversation(conversation, [
      ...duplicateIds.map((skillId) => enablement(skillId, null, true)),
      enablement("z-stable", null, true),
      enablement("missing-optional", conversation.conversationId, true),
    ]);

    const result = await resolverFor(snapshot).resolve(requestFor(conversation));
    expect(result.skillInputs).toEqual([
      expect.objectContaining({ id: "z-stable", required: false }),
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "optional_skill_ambiguous", skillId: "duplicate" }),
      expect.objectContaining({ code: "optional_skill_missing", skillId: "missing-optional" }),
    ]));
  });

  it("diagnoses an optional invalid path and fails closed when the same Skill is required", async () => {
    const skill = await createNativeSkill("invalid-path-skill");
    const invalidPath = join(root, "missing", "SKILL.md");
    const snapshot = await catalog([{ ...skill, path: invalidPath }]);
    const conversation = storedConversation("conversation-invalid-path", "codex", "agent");
    await seedConversation(conversation, [enablement("invalid-path-skill", null, true)]);
    const resolver = resolverFor(snapshot);

    await expect(resolver.resolve(requestFor(conversation))).resolves.toMatchObject({
      skillInputs: [],
      diagnostics: [expect.objectContaining({
        code: "skill_path_unavailable",
        skillId: "invalid-path-skill",
      })],
    });
    await expect(resolver.resolve(requestFor(conversation, ["invalid-path-skill"]))).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: "skill_path_unavailable",
    });
  });

  it("uses only the stored Conversation provider and passes custom roots to native discovery", async () => {
    const skill = await createNativeSkill("rooted-skill");
    const snapshot = await catalog([skill], "beta");
    const conversation = storedConversation("conversation-provider", "beta", "agent");
    const customRoot = join(root, "custom-root");
    await mkdir(customRoot, { recursive: true });
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.conversations.createConversation(conversation);
      database.skills.upsertSkillRoot({
        projectId: project.id,
        rootPath: customRoot,
        sourceKind: "custom",
        updatedAt: new Date().toISOString(),
      });
      database.skills.setSkillEnablement(enablement("rooted-skill", null, true));
    } finally {
      database.close();
    }
    const calls: Array<{ providerId: string; extraRoots?: readonly string[] }> = [];
    const resolver = new TurnSkillContextResolver({
      providerRegistry: {
        get(providerId) {
          calls.push({ providerId });
          return {
            skills: {
              list: async (input) => {
                calls[0]!.extraRoots = input.extraRoots;
                return snapshot;
              },
            },
          } as never;
        },
      },
      resolvePaths: () => paths,
    });

    await expect(resolver.resolve(requestFor(conversation))).resolves.toMatchObject({
      skillInputs: [expect.objectContaining({ id: "rooted-skill" })],
    });
    expect(calls).toEqual([{ providerId: "beta", extraRoots: [customRoot] }]);
  });

  it.each([
    { label: "missing", seed: false, patch: {} },
    { label: "deleted", seed: true, patch: {}, deleted: true },
    { label: "product mode", seed: true, patch: { productMode: "harness" as const } },
    { label: "provider", seed: true, patch: { selectedProviderId: "beta" } },
    { label: "graph scope", seed: true, patch: { currentGraphScopeId: "stale-graph" } },
    { label: "completed sequence", seed: true, patch: { completedTurnSequence: 9 } },
  ])("fails before Provider discovery for a $label Conversation snapshot", async (fixture) => {
    const stored = storedConversation("conversation-stale-" + fixture.label.replaceAll(" ", "-"), "codex", "agent");
    if (fixture.seed) {
      await seedConversation(stored);
      if (fixture.deleted) {
        const database = await openProjectRuntimeWorkbenchDatabase(paths);
        try {
          database.conversations.markConversationDeleted(project.id, stored.conversationId, new Date().toISOString());
        } finally {
          database.close();
        }
      }
    }
    const requested = { ...stored, ...fixture.patch };
    let providerListCalls = 0;
    const resolver = new TurnSkillContextResolver({
      providerRegistry: {
        get() {
          return {
            skills: {
              list: async () => {
                providerListCalls += 1;
                return catalog([], requested.selectedProviderId);
              },
            },
          } as never;
        },
      },
      resolvePaths: () => paths,
    });

    await expect(resolver.resolve(requestFor(requested))).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: "stale_conversation",
    });
    expect(providerListCalls).toBe(0);
  });

  it("leaves default production composition on the explicit empty port", async () => {
    const source = await readFile(join(process.cwd(), "src", "workbench", "conversation-service.ts"), "utf8");
    expect(source).toContain("const emptyTurnSkillContext: TurnSkillContextPort");
    expect(source).toContain("{ skillContext: emptyTurnSkillContext }");
    expect(source).not.toContain("TurnSkillContextResolver");
  });
});

function resolverFor(
  snapshot: ProviderSkillCatalogSnapshot,
  sourceInputs: readonly ProviderSkillInput[] = [],
  afterDiscovery?: () => Promise<void>,
): TurnSkillContextResolver {
  return new TurnSkillContextResolver({
    providerRegistry: {
      get(providerId) {
        expect(providerId).toBe(snapshot.providerId);
        return { skills: { list: async () => snapshot } } as never;
      },
    },
    resolvePaths: () => paths,
    resolveSourceSkillInputs: async () => {
      await afterDiscovery?.();
      return sourceInputs;
    },
  });
}

function requestFor(
  conversation: StoredConversation,
  requiredSkillIds: readonly string[] = [],
): TurnSkillContextRequest {
  return { project, conversation, requiredSkillIds };
}

function storedConversation(
  conversationId: string,
  selectedProviderId: string,
  productMode: "agent" | "harness",
): StoredConversation {
  const now = new Date().toISOString();
  return {
    projectId: project.id,
    conversationId,
    productMode,
    clientCreateRequestId: "request-" + conversationId,
    clientCreateRequestHash: "hash-" + conversationId,
    title: conversationId,
    state: "active",
    boundChangeId: null,
    currentGraphScopeId: "graph-" + conversationId,
    selectedProviderId,
    completedTurnSequence: 0,
    timelinePosition: 0,
    timelineRevision: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function initialMessage(conversation: StoredConversation) {
  return {
    id: "message-" + conversation.conversationId,
    projectId: project.id,
    conversationId: conversation.conversationId,
    changeId: "",
    agentSurfaceId: "main-agent",
    type: "user.message",
    timestamp: conversation.createdAt,
    text: "hello",
    actionRunId: null,
    actionType: null,
    status: null,
    runId: null,
    providerId: null,
    threadId: null,
    turnId: null,
    itemId: null,
    artifact: null,
    error: null,
    rawJson: "{}",
  };
}

function enablement(skillId: string, changeId: string | null, enabled: boolean) {
  return {
    projectId: project.id,
    changeId,
    skillId,
    scope: changeId ? "topic" as const : "project" as const,
    enabled,
    updatedAt: new Date().toISOString(),
  };
}

async function seedConversation(
  conversation: StoredConversation,
  enablements: ReturnType<typeof enablement>[] = [],
): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    database.conversations.createConversation(conversation);
    for (const row of enablements) database.skills.setSkillEnablement(row);
  } finally {
    database.close();
  }
}

interface NativeSkillFixture extends ProviderNativeSkill {
  entryPath: string;
}

async function createNativeSkill(
  name: string,
  enabled = true,
  directorySuffix = name,
): Promise<NativeSkillFixture> {
  const skillRoot = join(root, "skills", directorySuffix);
  await mkdir(skillRoot, { recursive: true });
  const entryPath = join(skillRoot, "SKILL.md");
  await writeFile(entryPath, "---\nname: " + name + "\ndescription: Test Skill.\n---\n", "utf8");
  return {
    name,
    description: "Test Skill",
    path: entryPath,
    entryPath,
    scope: "user",
    enabled,
    contentHash: await hashNativeSkillPackageContent(dirname(entryPath)),
  };
}

async function catalog(
  skills: readonly NativeSkillFixture[],
  providerId = "codex",
): Promise<ProviderSkillCatalogSnapshot> {
  return {
    providerId,
    projectPath: project.path,
    skills: skills.map(({ entryPath: _entryPath, ...skill }) => skill),
    errors: [],
  };
}

function sourceInput(
  skill: NativeSkillFixture,
  source: ProviderSkillInput["source"],
  required: boolean,
): ProviderSkillInput {
  return {
    id: skill.name,
    path: skill.entryPath,
    contentHash: skill.contentHash,
    source,
    required,
  };
}

function stableSkillId(snapshot: ProviderSkillCatalogSnapshot, target: ProviderNativeSkill): string {
  const all = snapshot.skills.filter((skill) => skill.name === target.name);
  if (all.length === 1) return target.name;
  const absolute = resolve(target.path);
  const normalized = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  return target.name + "-" + createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}

function legacySkillId(name: string, path: string): string {
  const absolute = resolve(path);
  const normalized = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  return name + "-" + createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}
