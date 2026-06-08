import { join } from "node:path";
import { buildAcMap } from "../../ecl/anchors.js";
import { getChangeStatusForChange } from "../../change/manager.js";
import type { ResolvedMemory } from "../../types/index.js";
import {
  displayArtifactPath,
  type DecompositionPlan,
  type DecompositionReadinessGuardrail,
  type DecompositionReadinessManifest,
  type DecompositionReadinessStatus,
  type DecompositionReadinessUnit,
  type DecompositionRecommendation,
  type DecompositionUnit,
} from "../../workflow-artifacts/manager.js";
import type { PlanningArtifactBundle, TopicThreadEntry } from "../types.js";
export function buildDeterministicPlanningBundle(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  prompt: string,
  previous: PlanningArtifactBundle | null,
  revision: boolean,
): PlanningArtifactBundle {
  const now = new Date().toISOString();
  const id = `planning-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const goal = revision && previous ? `${previous.goal}\n\nRevision request: ${prompt}` : prompt;
  const constraints = uniqueStrings([
    ...(previous?.constraints ?? []),
    ...extractConstraintCandidates(prompt),
  ]);
  const acceptanceCriteria = buildAcceptanceCriteria(goal, constraints);
  const tasks = [
    { id: "T-001", title: "Implement the accepted demand and update tests.", acIds: acceptanceCriteria.map((_item, index) => `AC-${String(index + 1).padStart(3, "0")}`) },
  ];
  const specMd = renderSpecMarkdown(changeId, goal, constraints, acceptanceCriteria);
  const planMd = renderImplementationPlanMarkdown(goal, tasks);
  const tasksMd = renderTasksMarkdown(tasks);
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "latest-bundle.md"));
  return {
    id,
    status: "draft",
    goal,
    constraints,
    acceptanceCriteria,
    design: "Use the smallest focused implementation in an AHO-owned worktree, add or update tests for the pricing rule, then run independent validation and audit.",
    tasks,
    risks: ["Validation or audit may require one bounded rework cycle.", "User confirmation is still required before applying/merging source changes."],
    openQuestions: constraints.length > 0 ? [] : ["Confirm rounding, membership eligibility, and test coverage expectations if they are not already stated."],
    specMd,
    planMd,
    tasksMd,
    acMapCandidate: buildAcMap({ changeId, specContent: specMd, tasksContent: tasksMd, placeholderFiles: [] }),
    artifact,
    updatedAt: now,
  };
}

export function buildDeterministicDecompositionPlan(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  bundle: PlanningArtifactBundle | null,
  thread: TopicThreadEntry[],
  prompt: string | undefined,
): DecompositionPlan {
  const now = new Date().toISOString();
  const id = `decomposition-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const threadText = thread.map((entry) => entry.text ?? "").join("\n");
  const signalText = [bundle?.goal, bundle?.design, prompt, threadText].filter(Boolean).join("\n");
  const tasks = bundle?.tasks.length ? bundle.tasks : [{ id: "T-001", title: bundle?.goal ?? "Clarify and implement the accepted demand.", acIds: [] }];
  const asksClarification = (bundle?.openQuestions.length ?? 0) > 0 || /不明确|澄清|clarify/i.test(signalText);
  const parallelSignal = /并行|parallel|多个模块|多模块|independent|独立/.test(signalText);
  const multiChangeSignal = /多个 change|multi-change|多个需求|拆成多个/.test(signalText);
  const recommendation: DecompositionRecommendation = asksClarification
    ? "needs-clarification"
    : multiChangeSignal
      ? "multi-change-candidate"
      : tasks.length > 1
        ? parallelSignal ? "taskgraph-parallel-candidate" : "taskgraph-sequential"
        : "single-change";
  const units: DecompositionUnit[] = tasks.map((task, index) => ({
    id: `DU-${String(index + 1).padStart(3, "0")}`,
    title: task.title,
    summary: recommendation === "single-change" ? "Keep this demand as one Coding Work Package." : "Candidate scoped execution unit from accepted planning tasks.",
    taskIds: [task.id],
    acIds: task.acIds,
    scopeHints: ["selected-demand", "AHO-owned worktree only"],
    dependsOn: index === 0 ? [] : [`DU-${String(index).padStart(3, "0")}`],
    recommendedRoleId: "coder-agent",
  }));
  const dependencies = units.slice(1).map((unit, index) => ({ from: units[index]?.id ?? units[0]?.id ?? unit.id, to: unit.id, kind: "blocks" as const }));
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "decomposition-plan.json"));
  const markdownArtifact = displayArtifactPath(memory, join(changeDir, "planning", "decomposition-plan.md"));
  return {
    id,
    changeId,
    status: "draft",
    recommendation,
    rationale: rationaleForRecommendation(recommendation, units.length),
    units,
    dependencies,
    conflictScopes: recommendation === "single-change" ? [] : ["source overlap must be checked before parallel execution"],
    riskSummary: "This is a proposal only. User confirmation does not start execution, create child Changes, or trust recovered work.",
    openQuestions: bundle?.openQuestions ?? [],
    artifactRefs: [bundle?.artifact].filter((item): item is string => Boolean(item)),
    recoveryKeyInputs: {
      changeId,
      planningBundleId: bundle?.id,
      acceptedArtifactRefs: [bundle?.artifact].filter((item): item is string => Boolean(item)),
      contextScope: "selected-demand",
      rolePolicyProfile: "main-agent proposal; worker roles remain leaves",
      notes: [
        "Recovery may reuse only scoped execution progress in later phases.",
        "Change, context, source, policy, and accepted artifact hashes must still match.",
      ],
    },
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

export async function buildDecompositionReadinessManifest(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  plan: DecompositionPlan,
): Promise<DecompositionReadinessManifest> {
  const status = await getChangeStatusForChange(memory, changeId);
  if (!status.change) throw new Error(`planning.decomposition.assess-readiness target is stale or missing active Change: ${changeId}.`);
  if (plan.changeId !== changeId) throw new Error("DecompositionPlan is not scoped to the selected Change.");
  const knownTasks = new Set((status.acMap?.tasks ?? []).map((task) => task.id));
  const knownAcs = new Set((status.acMap?.acceptanceCriteria ?? []).map((ac) => ac.id));
  const unitIds = new Set(plan.units.map((unit) => unit.id));
  const taskIds = unique(plan.units.flatMap((unit) => unit.taskIds));
  const acIds = unique(plan.units.flatMap((unit) => unit.acIds));
  const guardrails: DecompositionReadinessGuardrail[] = [];
  const addGuardrail = (id: string, passed: boolean, summary: string, refs: string[] = []): void => {
    guardrails.push({ id, status: passed ? "passed" : "failed", summary, refs });
  };
  addGuardrail("change-scope", status.acMap?.changeId === changeId, "Plan and accepted AC map must belong to the selected demand.", [changeId]);
  addGuardrail("plan-confirmed", plan.status === "confirmed", "Only a confirmed DecompositionPlan can be assessed.", [plan.id]);
  addGuardrail("task-ids-known", taskIds.every((id) => knownTasks.has(id)), "Every referenced task id must exist in accepted tasks.", taskIds);
  addGuardrail("ac-ids-known", acIds.every((id) => knownAcs.has(id)), "Every referenced AC id must exist in accepted acceptance criteria.", acIds);
  addGuardrail(
    "dependency-units-known",
    plan.units.every((unit) => unit.dependsOn.every((id) => unitIds.has(id))) && plan.dependencies.every((dep) => unitIds.has(dep.from) && unitIds.has(dep.to)),
    "Every dependency must reference a known DecompositionUnit.",
    plan.dependencies.flatMap((dep) => [dep.from, dep.to]),
  );
  const integrityFailure = guardrails.some((item) => item.status === "failed");
  if (integrityFailure) {
    throw new Error(`DecompositionReadiness guardrail failed: ${guardrails.filter((item) => item.status === "failed").map((item) => item.id).join(", ")}.`);
  }

  const sourceScopesSpecific = plan.units.every((unit) => unit.scopeHints.some((hint) => isSpecificSourceScope(hint)));
  const conflictScopesSpecific = plan.conflictScopes.length > 0 && plan.conflictScopes.every((scope) => isSpecificSourceScope(scope));
  const parallelReady = sourceScopesSpecific && conflictScopesSpecific;
  const recommendationGuardrail: DecompositionReadinessGuardrail = plan.recommendation === "taskgraph-parallel-candidate"
    ? {
        id: "parallel-conflict-scopes",
        status: parallelReady ? "passed" : "blocked",
        summary: parallelReady
          ? "Parallel candidate has explicit source and conflict scopes."
          : "Parallel candidate is blocked until source/task scopes and conflict scopes are concrete.",
        refs: [...plan.conflictScopes, ...plan.units.flatMap((unit) => unit.scopeHints)],
      }
    : {
        id: "recommendation-boundary",
        status: "passed",
        summary: "Recommendation maps to a non-executing readiness verdict in this phase.",
        refs: [plan.recommendation],
      };
  guardrails.push(recommendationGuardrail);

  const readinessStatus = readinessStatusForRecommendation(plan.recommendation, parallelReady);
  const now = new Date().toISOString();
  const dir = join(memory.memoryRoot, changePath, "planning");
  const artifact = displayArtifactPath(memory, join(dir, "decomposition-readiness.json"));
  const markdownArtifact = displayArtifactPath(memory, join(dir, "decomposition-readiness.md"));
  const units: DecompositionReadinessUnit[] = plan.units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    taskIds: unit.taskIds,
    acIds: unit.acIds,
    dependsOn: unit.dependsOn,
    guardrailStatus: recommendationGuardrail.status === "failed" ? "failed" : recommendationGuardrail.status === "blocked" ? "blocked" : "passed",
    sourceScopes: unit.scopeHints,
  }));
  return {
    id: `readiness-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId,
    decompositionPlanId: plan.id,
    status: readinessStatus,
    recommendation: plan.recommendation,
    executable: false,
    schedulerEligible: readinessStatus === "ready-for-sequential-taskqueue-proposal",
    nextAllowedAction: nextAllowedActionForReadiness(readinessStatus),
    units,
    dependencies: plan.dependencies,
    conflictScopes: plan.conflictScopes,
    guardrails,
    recoveryKeyMaterial: {
      ...plan.recoveryKeyInputs,
      decompositionPlanId: plan.id,
      taskIds,
      acIds,
    },
    artifactRefs: unique([...plan.artifactRefs, plan.artifact, plan.markdownArtifact, ...plan.recoveryKeyInputs.acceptedArtifactRefs]),
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function readinessStatusForRecommendation(recommendation: DecompositionRecommendation, parallelReady: boolean): DecompositionReadinessStatus {
  switch (recommendation) {
    case "single-change": return "ready-for-single-change";
    case "taskgraph-sequential": return "ready-for-sequential-taskqueue-proposal";
    case "taskgraph-parallel-candidate": return parallelReady ? "ready-for-sequential-taskqueue-proposal" : "blocked-parallel-guardrails";
    case "multi-change-candidate": return "blocked-multi-change-boundary";
    case "needs-clarification": return "blocked-needs-clarification";
  }
}

function nextAllowedActionForReadiness(status: DecompositionReadinessStatus): DecompositionReadinessManifest["nextAllowedAction"] {
  switch (status) {
    case "ready-for-single-change": return "code.run";
    case "ready-for-sequential-taskqueue-proposal": return "taskqueue.proposal";
    case "blocked-needs-clarification": return "clarification.answer";
    case "blocked-parallel-guardrails":
    case "blocked-multi-change-boundary":
    case "invalid":
      return "none";
  }
}

function isSpecificSourceScope(scope: string): boolean {
  const normalized = scope.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "selected-demand") return false;
  if (normalized === "aho-owned worktree only") return false;
  if (normalized.includes("must be checked")) return false;
  if (normalized.includes("source overlap")) return false;
  return /[/.\\]/.test(normalized) || /\bsrc\b|\btest\b|\bdocs\b|\bmodule\b|\bpackage\b/.test(normalized);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function rationaleForRecommendation(recommendation: DecompositionRecommendation, unitCount: number): string {
  switch (recommendation) {
    case "needs-clarification": return "The current demand still has open questions, so execution should wait for user clarification.";
    case "multi-change-candidate": return "The demand appears broad enough to consider multiple child Changes, but this phase records only the proposal.";
    case "taskgraph-parallel-candidate": return "Multiple execution units may be independent, but conflict scopes and synthesis still need Harness checks.";
    case "taskgraph-sequential": return `The demand maps to ${unitCount} ordered TaskGraph candidate units.`;
    case "single-change": return "The accepted scope fits one Change and one Coding Work Package.";
  }
}

function extractConstraintCandidates(prompt: string): string[] {
  const candidates: string[] = [];
  if (/四舍五入|分/.test(prompt)) candidates.push("金额按分处理，涉及折扣时需要明确舍入规则。");
  if (/会员/.test(prompt)) candidates.push("只有会员订单参与会员折扣规则。");
  if (/非会员/.test(prompt)) candidates.push("非会员不打折。");
  if (/100/.test(prompt)) candidates.push("会员订单满 100 元才触发折扣。");
  if (/测试|test/i.test(prompt)) candidates.push("需要补充或更新测试覆盖核心规则。");
  return candidates;
}

function buildAcceptanceCriteria(goal: string, constraints: string[]): string[] {
  const criteria = constraints.length > 0 ? constraints : [goal];
  return criteria.slice(0, 5).map((criterion, index) => `AC-${String(index + 1).padStart(3, "0")}: ${criterion}`);
}

function renderSpecMarkdown(changeId: string, goal: string, constraints: string[], acceptanceCriteria: string[]): string {
  return [
    `# Spec: ${changeId}`,
    "",
    "## Goal",
    "",
    goal,
    "",
    "## Constraints",
    "",
    ...(constraints.length > 0 ? constraints.map((item) => `- ${item}`) : ["- No extra constraints confirmed yet."]),
    "",
    "## Acceptance Criteria",
    "",
    ...acceptanceCriteria.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderImplementationPlanMarkdown(goal: string, tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Plan",
    "",
    "## Approach",
    "",
    `Implement the accepted demand in one Coding Work Package: ${goal}`,
    "",
    "## Tasks",
    "",
    ...tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
    "",
    "## Verification",
    "",
    "- Run targeted tests, then independent validation and audit.",
    "",
  ].join("\n");
}

function renderTasksMarkdown(tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Tasks",
    "",
    ...tasks.map((task) => `- [ ] ${task.id}: ${task.title} Covers: ${task.acIds.join(", ")}`),
    "",
  ].join("\n");
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
