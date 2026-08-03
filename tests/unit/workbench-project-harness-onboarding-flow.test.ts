import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectHarness } from "../../src/project-harness/discovery.js";
import { recoverProjectHarnessOnboarding } from "../../src/project-harness/onboarding.js";
import { ProjectRuntimeCoordinator } from "../../src/project-runtime/coordinator.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import {
  PROVIDER_OPERATION_CAPABILITIES,
  type ProviderCapabilityKey,
  type ProviderCapabilitySnapshot,
} from "../../src/provider-runtime/types.js";
import type { ProviderDescriptor, ProviderTurnRequest, ProviderTurnResult } from "../../src/provider-runtime/contracts.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { runProjectHarnessOnboardingTurn } from "../../src/workbench/project-harness-onboarding-turn.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { toCanonicalTimelineMessage } from "../../src/workbench/canonical-timeline-message.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Workbench Skill-native project Harness onboarding", () => {
  it("binds Main and independent Auditor attempts before atomically publishing a healthy Skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-workbench-onboarding-flow-"));
    cleanup.push(root);
    const projectRoot = join(root, "project");
    const ahoHome = join(root, "aho-home");
    await mkdir(projectRoot);
    const store = new ProjectRegistryStore(ahoHome);
    const coordinator = new ProjectRuntimeCoordinator({
      store,
      ahoHome,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    const registered = await coordinator.register({ path: projectRoot, name: "Sample" });
    expect(registered.state).toBe("onboarding");
    if (registered.state !== "onboarding") throw new Error("Expected onboarding state.");

    const conversationId = "conversation-1";
    const graphScopeId = "graph-1";
    const database = await openProjectRuntimeWorkbenchDatabase(registered.paths);
    database.unitOfWork.createConversationWithInitialMessage({
      projectId: registered.project.id,
      conversationId,
      title: "Create the project Harness",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
      deletedAt: null,
    }, toCanonicalTimelineMessage(registered.project.id, conversationId, {
      id: "user-1",
      type: "user.message",
      timestamp: "2026-08-03T00:00:00.000Z",
      conversationId,
      graphScopeId,
      changeId: "",
      text: "Create a verified empty project Harness.",
    }));
    database.close();

    const providerRegistry = new ProviderRegistry();
    const observed: ProviderTurnRequest[] = [];
    providerRegistry.register(fakeProvider(observed));
    const assistant = await runProjectHarnessOnboardingTurn(
      registered.project,
      registered,
      conversationId,
      "Create a verified empty project Harness.",
      undefined,
      { providerRegistry },
    );

    expect(assistant.text).toContain("onboarding complete");
    expect(observed.map((request) => [request.roleId, request.operationProfile])).toEqual([
      ["main-agent", "main"],
      ["auditor-agent", "auditor"],
    ]);
    expect(observed[0]?.writableRoots).toEqual([join(registered.paths.sidecarRoot, "onboarding", "bundle")]);
    expect(observed[0]?.writableRoots).not.toContain(projectRoot);
    expect(observed[1]?.writableRoots).toEqual([join(registered.paths.sidecarRoot, "onboarding", "review")]);
    expect(observed[0]?.tools?.map((tool) => tool.name)).toEqual(["aho_prepare_project_harness"]);

    const discovery = await discoverProjectHarness(projectRoot, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
    expect(discovery?.handle).toMatchObject({ projectId: registered.project.id, skillRevision: 1 });
    expect(discovery?.binding.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "codex", sameTarget: true }),
      expect.objectContaining({ providerId: "claude", sameTarget: true }),
    ]));
    await expect(coordinator.resolve(registered.project)).resolves.toMatchObject({ state: "ready" });
    const evidence = await openProjectRuntimeWorkbenchDatabase(registered.paths);
    try {
      expect(evidence.providerAttempts.listProviderAttempts(registered.project.id, conversationId))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ roleId: "main-agent", operationProfile: "main", status: "completed" }),
          expect.objectContaining({ roleId: "auditor-agent", operationProfile: "auditor", status: "completed" }),
        ]));
    } finally {
      evidence.close();
    }
  });

  it("keeps a blocked independent review recoverable without publishing a Skill or discovery link", async () => {
    const fixture = await createFlowFixture();
    const observed: ProviderTurnRequest[] = [];
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(fakeProvider(observed, { reviewDecision: "block", returnToolFailure: true }));

    const assistant = await runProjectHarnessOnboardingTurn(
      fixture.registered.project,
      fixture.registered,
      fixture.conversationId,
      "Create a verified empty project Harness.",
      undefined,
      { providerRegistry },
    );

    expect(assistant.status).toBe("failed");
    expect(assistant.text).toMatch(/blocked project Harness onboarding/);
    await expect(discoverProjectHarness(fixture.projectRoot, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).resolves.toBeNull();
    expect(existsSync(join(fixture.projectRoot, ".agents", "skills", `${fixture.registered.project.id}-harness`))).toBe(false);
    expect(existsSync(join(fixture.projectRoot, ".claude", "skills", `${fixture.registered.project.id}-harness`))).toBe(false);
    await expect(recoverProjectHarnessOnboarding(
      fixture.registered.project.id,
      fixture.projectRoot,
      fixture.registered.paths.sidecarRoot,
      DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    )).resolves.toMatchObject({ stage: "rolled-back" });

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.registered.paths);
    try {
      expect(database.providerAttempts.listProviderAttempts(fixture.registered.project.id, fixture.conversationId))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ roleId: "main-agent", status: "failed", nativeSessionId: "main-session" }),
          expect.objectContaining({ roleId: "auditor-agent", status: "completed" }),
        ]));
    } finally {
      database.close();
    }
  });

  it("preserves the conversation and resumes the same provider session after publication rollback", async () => {
    const fixture = await createFlowFixture();
    const observed: ProviderTurnRequest[] = [];
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(fakeProvider(observed, { mutateBundleAfterReviewOnce: true, returnToolFailure: true }));

    const first = await runProjectHarnessOnboardingTurn(
      fixture.registered.project,
      fixture.registered,
      fixture.conversationId,
      "Create a verified empty project Harness.",
      undefined,
      { providerRegistry },
    );
    expect(first.status).toBe("failed");
    await expect(recoverProjectHarnessOnboarding(
      fixture.registered.project.id,
      fixture.projectRoot,
      fixture.registered.paths.sidecarRoot,
      DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    )).resolves.toMatchObject({ stage: "rolled-back" });

    const second = await runProjectHarnessOnboardingTurn(
      fixture.registered.project,
      fixture.registered,
      fixture.conversationId,
      "Retry the reviewed publication from the current source.",
      undefined,
      { providerRegistry },
    );

    expect(second.status).toBe("completed");
    const mainRequests = observed.filter((request) => request.roleId === "main-agent");
    expect(mainRequests).toHaveLength(2);
    expect(mainRequests[0]?.existingSession).toBeNull();
    expect(mainRequests[1]?.existingSession).toEqual({ providerId: "codex", sessionId: "main-session" });
    await expect(discoverProjectHarness(fixture.projectRoot, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY)).resolves.toMatchObject({
      handle: { projectId: fixture.registered.project.id, skillRevision: 1 },
    });

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.registered.paths);
    try {
      expect(database.conversations.readConversation(fixture.registered.project.id, fixture.conversationId)).not.toBeNull();
      expect(database.providerAttempts.listProviderAttempts(fixture.registered.project.id, fixture.conversationId))
        .not.toEqual(expect.arrayContaining([expect.objectContaining({ status: "running" })]));
    } finally {
      database.close();
    }
  });
});

interface FakeProviderOptions {
  reviewDecision?: "approve" | "block";
  mutateBundleAfterReviewOnce?: boolean;
  returnToolFailure?: boolean;
}

function fakeProvider(observed: ProviderTurnRequest[], options: FakeProviderOptions = {}): ProviderDescriptor {
  const providerId = "codex";
  const snapshot = capabilitySnapshot(providerId);
  let bundleMutated = false;
  const completed = (sessionId: string, lastMessage: string): ProviderTurnResult => ({
    providerId,
    status: "completed",
    session: { providerId, sessionId },
    turnId: `${sessionId}-turn`,
    lastMessage,
    childThreads: [],
    changedFiles: [],
  });
  return {
    id: providerId,
    displayName: "Codex",
    runtime: { shutdown: async () => undefined },
    capabilitySnapshot: async () => snapshot,
    runtimeSummary: async () => ({ providerId, productMode: "harness", harnessExecutionModes: ["stepwise", "scoped-auto"], snapshot }),
    models: {
      read: async () => ({ providerId, selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
      select: async () => ({ providerId, selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
    },
    diagnostics: async () => ({
      providerId,
      displayName: "Codex",
      installation: { available: true, version: "test" },
      adapter: { id: "test", version: "1" },
      capabilities: snapshot,
      models: { providerId, selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true },
      sessionHealth: "ready",
      lastError: null,
      rawEvidenceRefs: [],
      projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("not supported"); } },
    skills: {
      list: async ({ projectPath }) => ({ providerId, projectPath, skills: [], errors: [] }),
      setEnabled: async ({ enabled }) => ({ effectiveEnabled: enabled }),
    },
    conversation: {
      runTurn: async (request) => {
        observed.push(request);
        const bundleRoot = request.writableRoots?.[0];
        if (!bundleRoot) throw new Error("Main bundle root is missing.");
        await writeBundle(bundleRoot, request.projectId);
        const tool = await request.onToolCall?.({
          providerId,
          requestId: "tool-1",
          threadId: "main-session",
          turnId: "main-turn",
          callId: "call-1",
          tool: "aho_prepare_project_harness",
          arguments: {},
        });
        if (!tool?.success && !options.returnToolFailure) {
          throw new Error(tool?.contentItems[0]?.text ?? "Onboarding tool failed.");
        }
        return completed(
          request.existingSession?.sessionId ?? "main-session",
          tool?.success ? "Project Harness onboarding complete." : tool?.contentItems[0]?.text ?? "Onboarding tool failed.",
        );
      },
      inspectChild: async () => "available",
      continueChild: async () => completed("child", "continued"),
      closeChild: async () => completed("child", "closed"),
      getActiveTurn: () => null,
      listActiveTurns: () => [],
    },
    leafExecution: {
      runTurn: async (request) => {
        observed.push(request);
        const reviewRoot = request.writableRoots?.[0];
        if (!reviewRoot) throw new Error("Auditor review root is missing.");
        const field = (name: string) => request.prompt.match(new RegExp(`${name}=([^,\\n]+)`))?.[1]?.trim() ?? "";
        await writeJson(join(reviewRoot, "full-bundle-review.json"), {
          schema_version: "1.0",
          kind: "full-bundle-review",
          candidate_fingerprint: field("candidate_fingerprint"),
          source_snapshot_digest: field("source_snapshot_digest"),
          author_id: field("author_id"),
          reviewer_id: field("reviewer_id"),
          decision: options.reviewDecision ?? "approve",
          findings: options.reviewDecision === "block"
            ? [{ severity: "blocking", area: "bundle", evidence: "test", recommendation: "revise", text: "blocked" }]
            : [],
          reviewed_at: new Date().toISOString(),
        });
        if (options.mutateBundleAfterReviewOnce && !bundleMutated) {
          const bundleRoot = request.runtimeWorkspaceRoots?.[1];
          if (!bundleRoot) throw new Error("Auditor bundle input is missing.");
          await writeFile(join(bundleRoot, "project-profile.json"), "{}\n", "utf8");
          bundleMutated = true;
        }
        return completed("auditor-session", "Review approved.");
      },
    },
  };
}

async function createFlowFixture() {
  const root = await mkdtemp(join(tmpdir(), "aho-workbench-onboarding-flow-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const ahoHome = join(root, "aho-home");
  await mkdir(projectRoot);
  const store = new ProjectRegistryStore(ahoHome);
  const coordinator = new ProjectRuntimeCoordinator({
    store,
    ahoHome,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  const registered = await coordinator.register({ path: projectRoot, name: "Sample" });
  if (registered.state !== "onboarding") throw new Error("Expected onboarding state.");
  const conversationId = "conversation-1";
  const graphScopeId = "graph-1";
  const database = await openProjectRuntimeWorkbenchDatabase(registered.paths);
  try {
    database.unitOfWork.createConversationWithInitialMessage({
      projectId: registered.project.id,
      conversationId,
      title: "Create the project Harness",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
      deletedAt: null,
    }, toCanonicalTimelineMessage(registered.project.id, conversationId, {
      id: "user-1",
      type: "user.message",
      timestamp: "2026-08-03T00:00:00.000Z",
      conversationId,
      graphScopeId,
      changeId: "",
      text: "Create a verified empty project Harness.",
    }));
  } finally {
    database.close();
  }
  return { root, projectRoot, ahoHome, coordinator, registered, conversationId, graphScopeId };
}

function capabilitySnapshot(providerId: string): ProviderCapabilitySnapshot {
  const keys = new Set<ProviderCapabilityKey>(Object.values(PROVIDER_OPERATION_CAPABILITIES).flat());
  return {
    providerId,
    displayName: providerId,
    productMode: "harness",
    status: "ready",
    runnable: true,
    checkedAt: new Date().toISOString(),
    snapshotHash: "test-snapshot",
    snapshotVersion: 1,
    effectiveModel: null,
    effectiveModelSource: "provider-default",
    degradedReasons: [],
    capabilities: [...keys].map((key) => ({ key, label: key, spec: "supported", runtime: "ready", summary: "ready" })),
  };
}

async function writeBundle(bundleRoot: string, projectId: string): Promise<void> {
  const artifacts = join(bundleRoot, "artifacts");
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, "overview.md"), [
    "---", "ecl:", "  id: overview", "  layer: L1", "  kind: current", "  status: implemented",
    "  owner: project-profile", "  modules: []", "  evidence:", "    - user:confirmed", "---", "", "# Sample", "",
  ].join("\n"), "utf8");
  await writeJson(join(bundleRoot, "project-profile.json"), {
    schema_version: "1.0", analysis_status: "complete", project_state: "empty", project_id: projectId,
    project_name: "sample", purpose: { summary: "Verified empty project", evidence: ["user:confirmed"] },
    primary_flows: [], languages: [], frameworks: [], package_managers: [], source_roots: [], entrypoints: [],
    modules: [], commands: [], environment: { services: [], variables: [], modes: [], evidence: [] }, ci: [],
    bridges: [], reference_projects: [], global_boundaries: [{ summary: "Use accepted Change", evidence: ["user:confirmed"] }],
    unknowns: [], evidence: ["user:confirmed"],
  });
  await writeJson(join(bundleRoot, "architecture.json"), {
    schema_version: "1.0", analysis_status: "complete", layers: [{ name: "unimplemented", evidence: ["user:confirmed"] }],
    dependencies: [], components: [], circular_dependencies: [], key_interfaces: [], code_paths: [], error_patterns: {}, evidence: ["user:confirmed"],
  });
  await writeJson(join(bundleRoot, "audit.json"), {
    schema_version: "1.0", analysis_status: "complete",
    dimensions: Object.fromEntries([["project_knowledge", 25], ["mechanical_checks", 20], ["environment", 15], ["coordination", 15], ["ecl_changes", 15], ["evolution", 10]].map(([name, weight]) => [name, { score: 8, weight }])),
    overall_score: 8, strengths: [{ summary: "Explicit empty state", evidence: ["user:confirmed"] }], gaps: [], knowledge_findings: [],
  });
  await writeJson(join(bundleRoot, "creation-delta.json"), {
    schema_version: "1.0", mode: "init",
    decisions: [{ source: "user:confirmed", action: "create", owner: "project-profile", projection: "L1", validation: "knowledge-check" }],
    artifacts: [{ path: "references/project_wiki/overview.md", action: "create", source: "artifacts/overview.md", owner: "project-profile", validation: "knowledge-check", evidence: ["user:confirmed"] }],
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
