import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptProjectHarnessPlanningPackage,
  type MainPlanningAcceptanceEvidence,
  type PlanningAcceptanceCommitPort,
  type ProjectHarnessPlanningPublicationPorts,
  type ValidatedPlanningPackageInput,
  validatePlanningProposalArtifacts,
} from "../../src/project-harness/planning-publication.js";
import {
  listProjectHarnessChanges,
  loadProjectHarnessContract,
  preflightProjectHarnessChange,
} from "../../src/project-harness/change.js";
import {
  projectHarnessConversationLane,
  projectHarnessLaneId,
  readProjectHarnessLane,
  type ProjectHarnessRegistryContext,
} from "../../src/project-harness/registry.js";
import { getProjectHarnessSkillScaffoldRoot } from "../../src/template-source/paths.js";
import {
  acceptCurrentConversationPlanningPackage,
  writePlannerChildProposal,
} from "../../src/workbench/planning/planner-child-proposal.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { bindProviderThreadFixture } from "../helpers/provider-thread-fixture.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness planning publication", () => {
  it("reuses one active Change in the same graph scope without a second publication", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const first = proposal("Return ok.", "proposal-a");
    const accepted = await publish(fixture, first, commits.ports);
    const revised = proposal("Return healthy.", "proposal-b", accepted.changeId);
    const result = await publish(fixture, revised, commits.ports);

    expect(result.changeId).toBe(accepted.changeId);
    expect((await listProjectHarnessChanges(fixture.skillRoot))).toEqual([
      expect.objectContaining({
        change_id: accepted.changeId,
        lane_id: fixture.laneId(fixture.graphScopeId),
        status: "active",
      }),
    ]);
    expect(await readFile(join(fixture.active(accepted.changeId), "plan.md"), "utf8")).toContain("Return healthy.");
    expect(await readFile(join(fixture.active(accepted.changeId), "plan.md"), "utf8")).toContain("## Plan Review");
    expect(await readFile(join(fixture.active(accepted.changeId), "tasks.md"), "utf8")).toContain("owner/path: project source / src/health.ts, tests/health.test.ts");
    expect(await readFile(join(fixture.active(accepted.changeId), "reviews", "review.md"), "utf8")).toContain("- Approved: yes");
    expect(commits.accepted.map((item) => item.graphScopeId)).toEqual([
      fixture.graphScopeId,
      fixture.graphScopeId,
    ]);
    await expect(loadProjectHarnessContract(fixture.skillRoot, accepted.changeId)).resolves.toMatchObject({
      change_id: accepted.changeId,
      subject: "health-endpoint",
      owner_module: "health-service",
    });
  });

  it("keeps the executed Change active and publishes the revision on a new graph Lane", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const first = await publish(fixture, proposal("Return ok.", "proposal-a"), commits.ports);
    fixture.executed.add(first.changeId);
    const second = await publish(
      fixture,
      proposal("Return healthy.", "proposal-b", first.changeId),
      commits.ports,
    );

    expect(second.changeId).not.toBe(first.changeId);
    expect(existsSync(fixture.active(first.changeId))).toBe(true);
    expect(existsSync(fixture.active(second.changeId))).toBe(true);
    const changes = await listProjectHarnessChanges(fixture.skillRoot);
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((change) => change.lane_id)).size).toBe(2);
    expect(commits.accepted.at(-1)).toMatchObject({
      graphScopeId: fixture.nextGraphScopeId,
      previousGraphScopeId: fixture.graphScopeId,
    });
  });

  it("keeps graph-scoped Planning concurrent for a non-Git project", async () => {
    const fixture = await createFixture();
    fixture.registry.mode = "single_lane";
    fixture.registry.branch = null;
    fixture.registry.headCommit = null;
    const commits = commitFixture();
    const first = await publish(fixture, proposal("Return ok.", "proposal-a"), commits.ports);
    fixture.executed.add(first.changeId);
    const second = await publish(
      fixture,
      proposal("Return healthy.", "proposal-b", first.changeId),
      commits.ports,
    );

    const changes = await listProjectHarnessChanges(fixture.skillRoot);
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((change) => change.lane_id)).size).toBe(2);
    await expect(readProjectHarnessLane(fixture.lane(fixture.graphScopeId))).resolves.toMatchObject({
      repository_lane_id: "lane-single",
      active_change_id: first.changeId,
    });
    await expect(readProjectHarnessLane(fixture.lane(fixture.nextGraphScopeId))).resolves.toMatchObject({
      repository_lane_id: "lane-single",
      active_change_id: second.changeId,
    });
  });

  it("keeps concurrent Conversations on distinct Change and graph Lane identities", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const first = await publish(fixture, proposal("Return ok.", "proposal-a"), commits.ports);
    const secondBase = proposal("Return healthy.", "proposal-b");
    const secondGraphScopeId = "graph:conversation-b:initial";
    const secondInput = {
      ...secondBase,
      conversationId: "conversation-b",
      currentGraphScopeId: secondGraphScopeId,
      acceptance: mainAcceptance(secondBase.proposal.hash, secondGraphScopeId),
    };
    const second = await publish(fixture, secondInput, commits.ports);

    expect(second.changeId).not.toBe(first.changeId);
    await expect(readProjectHarnessLane(fixture.lane(fixture.graphScopeId))).resolves.toMatchObject({
      active_change_id: first.changeId,
      conversation_id: "conversation-a",
      graph_scope_id: fixture.graphScopeId,
    });
    await expect(readProjectHarnessLane({
      ...fixture.registry,
      lane: projectHarnessConversationLane("conversation-b", secondInput.currentGraphScopeId),
    })).resolves.toMatchObject({
      active_change_id: second.changeId,
      conversation_id: "conversation-b",
      graph_scope_id: secondInput.currentGraphScopeId,
    });
    expect(new Set((await listProjectHarnessChanges(fixture.skillRoot)).map((change) => change.lane_id)).size).toBe(2);
  });

  it("rejects a bound active Change from another graph Lane before execution branching", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const foreignBase = proposal("Return foreign ok.", "proposal-foreign");
    const foreignGraphScopeId = "graph:conversation-a:foreign";
    const foreign = await publish(fixture, {
      ...foreignBase,
      currentGraphScopeId: foreignGraphScopeId,
      acceptance: mainAcceptance(foreignBase.proposal.hash, foreignGraphScopeId),
    }, commits.ports);
    fixture.executed.add(foreign.changeId);

    await expect(publish(
      fixture,
      proposal("Return local ok.", "proposal-local", foreign.changeId),
      commits.ports,
    )).rejects.toThrow(/does not belong to the current conversation graph-scope Lane/);

    expect(await listProjectHarnessChanges(fixture.skillRoot)).toHaveLength(1);
  });

  it("rejects ambiguous acceptance syntax before creating a Change", async () => {
    const input = proposal("Return ok.", "proposal-invalid");
    input.proposal.specMd = "# Spec\n\nAC-001: ambiguous bare criterion\n";

    expect(() => validatePlanningProposalArtifacts(input.proposal)).toThrow("'- AC-001: ...' form");
  });

  it("rejects inconsistent Main-owned Registry contract evidence before creating a Change", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const source = proposal("Return ok.", "contract-source");
    const cases = [
      { contractRequired: true, contract: null },
      { contractRequired: false, contract: source.acceptance.contract },
    ];

    for (const [index, acceptance] of cases.entries()) {
      const input = proposal("Return ok.", `proposal-invalid-contract-${index}`);
      input.acceptance = {
        ...input.acceptance,
        ...acceptance,
      } as MainPlanningAcceptanceEvidence;
      await expect(publish(fixture, input, commits.ports))
        .rejects.toThrow("must include a Registry contract exactly when contractRequired is true");
    }

    expect(await listProjectHarnessChanges(fixture.skillRoot)).toEqual([]);
    expect(await directories(join(fixture.skillRoot, "state", "changes", "active"))).toEqual([]);
  });

  it("rejects invalid or unsafe Main-owned Registry contracts before creating a Change", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const invalidContracts: unknown[] = [
      {
        ...requiredContract(),
        kind: "unsupported-contract-kind",
      },
      {
        ...requiredContract(),
        affected_paths: ["C:\\outside\\health.ts"],
      },
      {
        ...requiredContract(),
        affected_paths: ["../outside/health.ts"],
      },
    ];

    for (const [index, contract] of invalidContracts.entries()) {
      const input = proposal("Return ok.", `proposal-invalid-main-contract-${index}`);
      input.acceptance = {
        ...input.acceptance,
        contract,
      } as MainPlanningAcceptanceEvidence;
      await expect(publish(fixture, input, commits.ports)).rejects.toThrow();
    }

    expect(await listProjectHarnessChanges(fixture.skillRoot)).toEqual([]);
    expect(await directories(join(fixture.skillRoot, "state", "changes", "active"))).toEqual([]);
    expect(await readProjectHarnessLane(fixture.lane(fixture.graphScopeId))).toBeNull();
  });

  it("publishes no empty contract when Main declares that a Registry contract is not required", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const input = proposal("Return ok.", "proposal-no-contract");
    input.acceptance = mainAcceptance(input.proposal.hash, input.currentGraphScopeId, {
      contractRequired: false,
      contract: null,
      validation: ["Main Agent determined that this proposal does not change a published boundary."],
    });

    const accepted = await publish(fixture, input, commits.ports);

    expect(accepted.registryContract).toBeNull();
    await expect(loadProjectHarnessContract(fixture.skillRoot, accepted.changeId)).resolves.toBeNull();
    expect((await listProjectHarnessChanges(fixture.skillRoot))[0]).toMatchObject({
      contract_required: false,
      contract_path: null,
    });
  });

  it("rolls back a second graph publication when its structured Registry contract conflicts", async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.skillRoot, "state", "registry"), { recursive: true });
    await writeFile(join(fixture.skillRoot, "state", "registry", "baseline.json"), `${JSON.stringify({
      schema_version: "1.0",
      canonical_branch: "main",
      canonical_commit: fixture.registry.headCommit,
      updated_at: "2026-08-03T00:00:00.000Z",
    }, null, 2)}\n`, "utf8");
    const commits = commitFixture();
    const ports: ProjectHarnessPlanningPublicationPorts = {
      executionEvidence: { hasEvidence: async (changeId) => fixture.executed.has(changeId) },
      authorization: { captureSuperseded: async () => null, async revoke() {}, async restore() {} },
      preflight: {
        evaluate: (context, changeId) => preflightProjectHarnessChange(context, {
          changeId,
          sourceSnapshot: { fingerprintSources: async () => new Map() },
        }),
      },
      commit: commits.ports,
      createGraphScopeId: () => fixture.nextGraphScopeId,
    };
    const first = await acceptProjectHarnessPlanningPackage({
      registry: fixture.registry,
      sidecarRoot: fixture.sidecarRoot,
    }, proposal("Return ok.", "proposal-a"), ports);
    fixture.executed.add(first.changeId);

    await expect(acceptProjectHarnessPlanningPackage({
      registry: fixture.registry,
      sidecarRoot: fixture.sidecarRoot,
    }, proposal("Return healthy.", "proposal-b", first.changeId), ports))
      .rejects.toThrow(/"type":"contract"/);

    const changes = await listProjectHarnessChanges(fixture.skillRoot);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.change_id).toBe(first.changeId);
    expect(await loadProjectHarnessContract(fixture.skillRoot, first.changeId)).toMatchObject({
      subject: "health-endpoint",
    });
    expect(await readProjectHarnessLane(fixture.lane(fixture.nextGraphScopeId))).toBeNull();
    expect(await directories(join(fixture.skillRoot, "state", "changes", "active"))).toEqual([first.changeId]);
    expect(await directories(join(fixture.skillRoot, "state", "changes", ".transactions"))).toEqual([]);
    expect(JSON.parse(await readFile(join(fixture.skillRoot, "state", "changes", "INDEX.json"), "utf8")))
      .toMatchObject({ changes: [expect.objectContaining({ change_id: first.changeId })] });
  });

  it("restores Change, Lane, INDEX, and evidence when the Workbench commit fails", async () => {
    const fixture = await createFixture();
    const commits = commitFixture({ fail: true });

    await expect(publish(fixture, proposal("Return ok.", "proposal-a"), commits.ports))
      .rejects.toThrow("injected Workbench failure");

    expect(await listProjectHarnessChanges(fixture.skillRoot)).toEqual([]);
    expect(await readProjectHarnessLane(fixture.lane(fixture.graphScopeId))).toBeNull();
    expect(JSON.parse(await readFile(join(fixture.skillRoot, "state", "changes", "INDEX.json"), "utf8")))
      .toMatchObject({ changes: [] });
    expect((await directories(join(fixture.skillRoot, "state", "changes", "active")))).toEqual([]);
    expect((await directories(join(fixture.skillRoot, "state", "changes", ".transactions")))).toEqual([]);
    expect(await loadProjectHarnessContract(fixture.skillRoot, "health-endpoint")).toBeNull();
  });

  it("restores a superseded execution authorization when publication rolls back", async () => {
    const fixture = await createFixture();
    const firstCommits = commitFixture();
    const initialInput = proposal("Return ok.", "proposal-a");
    const accepted = await publish(fixture, initialInput, firstCommits.ports);
    const originalLane = await readProjectHarnessLane(fixture.lane(fixture.graphScopeId));
    const intentPath = join(
      fixture.active(accepted.changeId),
      "planning",
      "execution-authorization-intent.json",
    );
    await writeFile(intentPath, `${JSON.stringify({
      version: "1.0",
      status: "issued",
      changeId: accepted.changeId,
      conversationId: initialInput.conversationId,
      proposalId: initialInput.proposal.id,
      proposalHash: initialInput.proposal.hash,
      graphId: accepted.workflowGraphPlan.id,
      authorizationId: "authorization-a",
      reason: null,
      updatedAt: "2026-08-03T00:00:00.000Z",
    }, null, 2)}\n`, "utf8");
    const events: string[] = [];
    const failedCommits = commitFixture({ fail: true });
    const ports: ProjectHarnessPlanningPublicationPorts = {
      executionEvidence: { hasEvidence: async () => false },
      authorization: {
        async captureSuperseded(input) {
          events.push(`capture:${input.authorizationId}`);
          return {
            id: input.authorizationId,
            epoch: 0,
            projectId: input.projectId,
            changeId: input.changeId,
            conversationId: input.conversationId,
            acceptedPlanHash: input.acceptedPlanHash,
            graphId: input.graphId,
          };
        },
        async revoke(evidence) { events.push(`revoke:${evidence.id}`); },
        async restore(evidence) { events.push(`restore:${evidence.id}`); },
      },
      preflight: {
        async evaluate(_context, changeId) {
          return continuingPreflight(fixture, changeId);
        },
      },
      commit: failedCommits.ports,
      createGraphScopeId: () => fixture.nextGraphScopeId,
    };

    const revised = proposal("Return revised.", "proposal-b", accepted.changeId);
    revised.acceptance = mainAcceptance(revised.proposal.hash, revised.currentGraphScopeId, {
      contract: {
        ...requiredContract(),
        owner_module: "revised-health-service",
      },
    });

    await expect(acceptProjectHarnessPlanningPackage({
      registry: fixture.registry,
      sidecarRoot: fixture.sidecarRoot,
    }, revised, ports))
      .rejects.toThrow("injected Workbench failure");

    expect(events).toEqual([
      "capture:authorization-a",
      "revoke:authorization-a",
      "restore:authorization-a",
    ]);
    expect(await readFile(join(fixture.active(accepted.changeId), "plan.md"), "utf8")).toContain("Return ok.");
    expect(await readProjectHarnessLane(fixture.lane(fixture.graphScopeId))).toEqual(originalLane);
    expect(await loadProjectHarnessContract(fixture.skillRoot, accepted.changeId)).toMatchObject({
      owner_module: "health-service",
    });
  });

  it("recovers an uncommitted swapped journal before retrying the accepted proposal", async () => {
    const fixture = await createFixture();
    const commits = commitFixture();
    const input = proposal("Return ok.", "proposal-a");
    const accepted = await publish(fixture, input, commits.ports);
    const activePath = fixture.active(accepted.changeId);
    const record = (await listProjectHarnessChanges(fixture.skillRoot))[0];
    const lane = await readProjectHarnessLane(fixture.lane(fixture.graphScopeId));
    const transactionId = `${accepted.changeId}-crash-before-db`;
    const physicalRoot = join(fixture.skillRoot, "state", "changes", ".transactions");
    const backupPath = join(physicalRoot, `${transactionId}.backup`);
    const stagingPath = join(physicalRoot, `${transactionId}.staging`);
    await cp(activePath, backupPath, { recursive: true });
    await writeFile(join(activePath, "spec.md"), "# partial replacement\n", "utf8");
    await writePlanningJournal(fixture, {
      id: transactionId,
      phase: "swapped",
      changeId: accepted.changeId,
      claimToken: record.claim_token,
      laneId: record.lane_id,
      activePath,
      stagingPath,
      backupPath,
      record,
      lane,
    });

    await publish(fixture, { ...input, boundChangeId: accepted.changeId }, commits.ports);

    expect(await readFile(join(activePath, "spec.md"), "utf8")).toContain("AC-001");
    expect(existsSync(backupPath)).toBe(false);
    expect(existsSync(join(fixture.sidecarRoot, "transactions", "planning", `${transactionId}.json`))).toBe(false);
    expect(await readProjectHarnessLane(fixture.lane(fixture.graphScopeId))).toEqual(lane);
  });
});

describe("Skill-native Workbench planning composition", () => {
  it("accepts a current graph proposal through discovery without creating legacy Harness state", async () => {
    const fixture = await createReadyProjectFixture();
    const conversationId = "conversation-native";
    const graphScopeId = "graph:conversation-native:initial";
    const paths = resolveProjectRuntimePaths(fixture.project.id, fixture.ahoHome);
    const store = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      store.conversations.createConversation({
        projectId: fixture.project.id,
        conversationId,
        title: "Native health endpoint",
        state: "active",
        boundChangeId: null,
        currentGraphScopeId: graphScopeId,
        selectedProviderId: "codex",
        completedTurnSequence: 0,
        timelinePosition: 0,
        timelineRevision: 0,
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
        deletedAt: null,
      });
    } finally {
      store.close();
    }
    const proposalInput = proposal("Return native ok.", "proposal-native");
    const runDirectory = join(paths.workbenchRoot, "conversations", conversationId, "runs", "run-native");
    const proposalDirectory = join(runDirectory, "planner-proposal");
    await mkdir(proposalDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(proposalDirectory, "spec.md"), proposalInput.proposal.specMd, "utf8"),
      writeFile(join(proposalDirectory, "plan.md"), proposalInput.proposal.planMd, "utf8"),
      writeFile(join(proposalDirectory, "tasks.md"), proposalInput.proposal.tasksMd, "utf8"),
      writeFile(join(proposalDirectory, "registry-contract.json"), `${JSON.stringify({ unauthorized: true }, null, 2)}\n`, "utf8"),
    ]);
    const nativeProposal = await writePlannerChildProposal({
      directory: runDirectory,
      projectId: fixture.project.id,
      conversationId,
      runId: "run-native",
      parentThreadId: "main-native",
      childThreadId: "planner-native",
    });
    const boundStore = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const now = "2026-08-03T00:01:00.000Z";
      bindProviderThreadFixture(boundStore, {
        projectId: fixture.project.id,
        conversationId,
        providerId: "codex",
        providerThreadId: "main-native",
        roleId: "main-agent",
        parentThreadId: null,
        changeId: null,
        graphScopeId,
        capabilityProfile: "main-agent-goal-v1",
        updatedAt: now,
      });
      bindProviderThreadFixture(boundStore, {
        projectId: fixture.project.id,
        conversationId,
        providerId: "codex",
        providerThreadId: "planner-native",
        roleId: "planning-agent",
        parentThreadId: "main-native",
        changeId: null,
        graphScopeId,
        capabilityProfile: "planner-child-v1",
        runId: "run-native",
        updatedAt: now,
      });
      boundStore.timeline.appendMessage({
        id: "assistant:native:proposal",
        projectId: fixture.project.id,
        conversationId,
        agentSurfaceId: "agent:codex:thread:planner-native",
        changeId: "",
        type: "assistant.message",
        timestamp: now,
        text: nativeProposal.planMd,
        actionRunId: null,
        actionType: null,
        status: "completed",
        runId: "run-native",
        artifact: nativeProposal.artifact,
        error: null,
        rawJson: JSON.stringify({ agentRoleId: "planning-agent", graphScopeId }),
      });
    } finally {
      boundStore.close();
    }

    const accepted = await acceptCurrentConversationPlanningPackage(
      fixture.project,
      conversationId,
      nativeProposal.artifact,
      mainAcceptance(nativeProposal.hash, graphScopeId),
      { ahoHome: fixture.ahoHome },
    );

    expect(existsSync(join(fixture.project.path, ".agent-harness", "project.json"))).toBe(false);
    expect(existsSync(join(fixture.skillRoot, "state", "changes", "active", accepted.changeId, "spec.md"))).toBe(true);
    await expect(loadProjectHarnessContract(fixture.skillRoot, accepted.changeId)).resolves.toMatchObject({
      subject: "health-endpoint",
      owner_module: "health-service",
    });
    const committedStore = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(committedStore.conversations.readConversation(fixture.project.id, conversationId)).toMatchObject({
        boundChangeId: accepted.changeId,
        currentGraphScopeId: graphScopeId,
      });
    } finally {
      committedStore.close();
    }
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "aho-project-planning-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const skillRoot = join(root, "project-skill");
  const sidecarRoot = join(root, "aho-home", "projects", "sample-a1");
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(skillRoot, { recursive: true }),
    mkdir(sidecarRoot, { recursive: true }),
    mkdir(join(skillRoot, "state", "changes", "active"), { recursive: true }),
    mkdir(join(skillRoot, "state", "changes", "parking"), { recursive: true }),
    mkdir(join(skillRoot, "state", "changes", "archive"), { recursive: true }),
  ]);
  await cp(
    join(getProjectHarnessSkillScaffoldRoot(), "assets", "templates"),
    join(skillRoot, "assets", "templates"),
    { recursive: true },
  );
  const graphScopeId = "graph:conversation-a:initial";
  const nextGraphScopeId = "graph:conversation-a:next";
  const registry: ProjectHarnessRegistryContext = {
    projectId: "sample-a1",
    projectRoot,
    skillRoot,
    mode: "multi_lane",
    branch: "feature/planning",
    headCommit: "a".repeat(40),
  };
  const executed = new Set<string>();
  return {
    projectRoot,
    skillRoot,
    sidecarRoot,
    registry,
    graphScopeId,
    nextGraphScopeId,
    executed,
    lane(scopeId: string): ProjectHarnessRegistryContext {
      return { ...registry, lane: projectHarnessConversationLane("conversation-a", scopeId) };
    },
    laneId(scopeId: string): string {
      return projectHarnessLaneId(this.lane(scopeId));
    },
    active(changeId: string): string {
      return join(skillRoot, "state", "changes", "active", changeId);
    },
  };
}

async function createReadyProjectFixture(): Promise<{
  project: ManagedProject;
  ahoHome: string;
  skillRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-native-planning-"));
  cleanup.push(root);
  return createReadyProjectHarnessFixture({
    projectRoot: join(root, "project"),
    ahoHome: join(root, "aho-home"),
    projectId: "native-a1",
    projectName: "native",
  });
}

async function publish(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  input: ValidatedPlanningPackageInput,
  commit: PlanningAcceptanceCommitPort,
) {
  const ports: ProjectHarnessPlanningPublicationPorts = {
    executionEvidence: { hasEvidence: async (changeId) => fixture.executed.has(changeId) },
      authorization: {
        async captureSuperseded() { return null; },
        async revoke() {},
        async restore() {},
      },
      preflight: {
        async evaluate(_context, changeId) {
          return continuingPreflight(fixture, changeId);
        },
      },
    commit,
    createGraphScopeId: () => fixture.nextGraphScopeId,
  };
  return acceptProjectHarnessPlanningPackage({
    registry: fixture.registry,
    sidecarRoot: fixture.sidecarRoot,
  }, input, ports);
}

async function continuingPreflight(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  changeId: string,
) {
  const change = (await listProjectHarnessChanges(fixture.skillRoot))
    .find((candidate) => candidate.change_id === changeId);
  if (!change) throw new Error(`Missing fixture Change: ${changeId}.`);
  return {
    project_id: fixture.registry.projectId,
    mode: fixture.registry.mode,
    change,
    conflicts: [],
    historical_overlaps: [],
    baseline_relation: "equal" as const,
    baseline_advanced: false,
    baseline_impacts: [],
    knowledge: {
      status: "current-for-change-scope" as const,
      candidate_items: 0,
      checked_sources: 0,
      drift_impacts: [],
    },
    action: "continue" as const,
  };
}

function commitFixture(options: { fail?: boolean } = {}) {
  const durable = new Map<string, Parameters<PlanningAcceptanceCommitPort["commit"]>[0]>();
  const accepted: Array<Parameters<PlanningAcceptanceCommitPort["commit"]>[0]> = [];
  return {
    accepted,
    ports: {
      hasCommit: (transactionId: string) => durable.has(transactionId),
      commit(value) {
        if (options.fail) throw new Error("injected Workbench failure");
        durable.set(value.transactionId, value);
        accepted.push(value);
      },
      deleteCommit: (transactionId: string) => { durable.delete(transactionId); },
    } satisfies PlanningAcceptanceCommitPort,
  };
}

function proposal(
  behavior: string,
  proposalId: string,
  boundChangeId: string | null = null,
): ValidatedPlanningPackageInput {
  const specMd = "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Health endpoint responds successfully.\n";
  const planMd = [
    "# Plan",
    "",
    "## Approach",
    behavior,
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [{
        id: "health",
        title: "Health endpoint",
        taskIds: ["T-001"],
        acIds: ["AC-001"],
        prompt: [
          `Objective: ${behavior}`,
          "Required behavior: Implement the accepted health endpoint behavior.",
          "Constraints: Keep the change within the declared source scopes.",
          "Expected evidence: Verify AC-001 with focused tests.",
        ].join("\n"),
        dependsOn: [],
        sourceScopes: ["src/health.ts", "tests/health.test.ts"],
      }],
    }, null, 2),
    "```",
    "",
  ].join("\n");
  const tasksMd = "# Tasks\n\n- [ ] T-001: Implement the health endpoint.\n  - Covers: AC-001\n";
  const hash = createHash("sha256").update(JSON.stringify({ proposalId, specMd, planMd, tasksMd })).digest("hex");
  const currentGraphScopeId = "graph:conversation-a:initial";
  return {
    conversationId: "conversation-a",
    conversationTitle: "Health endpoint",
    boundChangeId,
    currentGraphScopeId,
    proposal: {
      id: proposalId,
      hash,
      artifact: `runtime-sidecar/proposals/${proposalId}.json`,
      specMd,
      planMd,
      tasksMd,
      runId: `run-${proposalId}`,
      childThreadId: `planner-${proposalId}`,
    },
    acceptance: mainAcceptance(hash, currentGraphScopeId),
  };
}

function requiredContract(): NonNullable<MainPlanningAcceptanceEvidence["contract"]> {
  return {
    kind: "api",
    subject: "health-endpoint",
    operation: "update-health-endpoint",
    owner_module: "health-service",
    affected_paths: ["src/health.ts", "tests/health.test.ts"],
    consumers: ["health-client"],
    depends_on: [],
    depends_on_changes: [],
    compatibility: "Existing health consumers remain supported.",
    status: "active",
  };
}

function mainAcceptance(
  proposalHash: string,
  graphScopeId: string,
  overrides: Partial<MainPlanningAcceptanceEvidence> = {},
): MainPlanningAcceptanceEvidence {
  return {
    version: "1.0",
    proposalHash,
    graphScopeId,
    contractRequired: true,
    contract: requiredContract(),
    validation: ["Main Agent verified the health boundary against current project evidence."],
    ...overrides,
  };
}

async function directories(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  const { readdir } = await import("node:fs/promises");
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function writePlanningJournal(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  input: {
    id: string;
    phase: "swapped";
    changeId: string;
    claimToken: string;
    laneId: string;
    activePath: string;
    stagingPath: string;
    backupPath: string;
    record: Awaited<ReturnType<typeof listProjectHarnessChanges>>[number];
    lane: Awaited<ReturnType<typeof readProjectHarnessLane>>;
  },
): Promise<void> {
  const root = join(fixture.sidecarRoot, "transactions", "planning");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, `${input.id}.json`), `${JSON.stringify({
    schema_version: "3.0",
    id: input.id,
    phase: input.phase,
    project_id: fixture.registry.projectId,
    change_id: input.changeId,
    claim_token: input.claimToken,
    lane_id: input.laneId,
    repository_mode: fixture.registry.mode,
    branch: fixture.registry.branch,
    head_commit: fixture.registry.headCommit,
    conversation_id: "conversation-a",
    graph_scope_id: fixture.graphScopeId,
    active_path: input.activePath,
    staging_path: input.stagingPath,
    backup_path: input.backupPath,
    created_change: false,
    record_before: input.record,
    contract_before: await loadProjectHarnessContract(fixture.skillRoot, input.changeId),
    lane_before: input.lane,
    scope: "Health endpoint",
    paths: ["src/health.ts", "tests/health.test.ts"],
    superseded_authorization: null,
  }, null, 2)}\n`, "utf8");
}
