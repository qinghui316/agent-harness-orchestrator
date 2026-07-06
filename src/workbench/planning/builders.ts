import { join } from "node:path";
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
import type { TopicThreadEntry } from "../types.js";

interface DecompositionPlanningSource {
  id?: string;
  goal?: string;
  proposedPlanMd?: string;
  design?: string;
  tasks: Array<{ id: string; title: string; acIds: string[] }>;
  openQuestions?: string[];
  sourceScopeConstraints?: string[];
  artifact?: string;
  artifactRefs?: string[];
}

export function buildDeterministicDecompositionPlan(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  source: DecompositionPlanningSource | null,
  thread: TopicThreadEntry[],
  prompt: string | undefined,
): DecompositionPlan {
  const now = new Date().toISOString();
  const id = `decomposition-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const threadText = thread.map((entry) => entry.text ?? "").join("\n");
  const signalText = [source?.goal, source?.proposedPlanMd, source?.design, prompt, threadText].filter(Boolean).join("\n");
  if (!source?.tasks.length) {
    throw new Error("Decomposition requires Agent-authored planning tasks; refusing to generate fallback tasks.");
  }
  const tasks = source.tasks;
  const asksClarification = (source?.openQuestions?.length ?? 0) > 0 || /不明确|澄清|clarify/i.test(signalText);
  const parallelSignal = hasParallelPlanningSignal(signalText);
  const multiChangeSignal = hasMultiChangeImplementationSignal(signalText);
  const recommendation: DecompositionRecommendation = asksClarification
    ? "needs-clarification"
    : multiChangeSignal
      ? "multi-change-candidate"
      : tasks.length > 1
        ? parallelSignal ? "taskgraph-parallel-candidate" : "taskgraph-sequential"
        : "single-change";
  const explicitSourceScopes = extractExplicitSourceScopes(signalText);
  const sourceScopeConstraints = unique([
    ...(source?.sourceScopeConstraints ?? []),
    ...extractExplicitSourceScopes(source?.goal ?? ""),
    ...extractExplicitSourceScopes(prompt ?? ""),
  ]);
  const scopedParallelCandidate = recommendation === "taskgraph-parallel-candidate" && explicitSourceScopes.length >= tasks.length;
  const units: DecompositionUnit[] = tasks.map((task, index) => ({
    id: `DU-${String(index + 1).padStart(3, "0")}`,
    title: task.title,
    summary: recommendation === "single-change" ? "Keep this demand as one Coding Work Package." : "Candidate scoped execution unit from accepted planning tasks.",
    taskIds: [task.id],
    acIds: task.acIds,
    scopeHints: scopedParallelCandidate ? [explicitSourceScopes[index] ?? "selected-demand"] : ["selected-demand", "AHO-owned worktree only"],
    dependsOn: scopedParallelCandidate ? [] : index === 0 ? [] : [`DU-${String(index).padStart(3, "0")}`],
    recommendedRoleId: "coder-agent",
  }));
  const dependencies = scopedParallelCandidate
    ? []
    : units.slice(1).map((unit, index) => ({ from: units[index]?.id ?? units[0]?.id ?? unit.id, to: unit.id, kind: "blocks" as const }));
  const conflictScopes = scopedParallelCandidate
    ? explicitSourceScopes.slice(0, tasks.length)
    : recommendation === "single-change" ? [] : ["source overlap must be checked before parallel execution"];
  const scopeExpansions = detectSourceScopeExpansions([...units.flatMap((unit) => unit.scopeHints), ...conflictScopes], sourceScopeConstraints, []);
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
    conflictScopes,
    sourceScopeConstraints,
    scopeExpansions,
    riskSummary: "This is a proposal only. User confirmation does not start execution, create child Changes, or trust recovered work.",
    openQuestions: source?.openQuestions ?? [],
    artifactRefs: unique([...(source?.artifactRefs ?? []), source?.artifact].filter((item): item is string => Boolean(item))),
    recoveryKeyInputs: {
      changeId,
      acceptedArtifactRefs: unique([...(source?.artifactRefs ?? []), source?.artifact].filter((item): item is string => Boolean(item))),
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

  const parallelAssessment = assessParallelReadiness(plan);
  const recommendationGuardrail: DecompositionReadinessGuardrail = plan.recommendation === "taskgraph-parallel-candidate"
    ? {
        id: "parallel-low-conflict-guardrails",
        status: parallelAssessment.ready ? "passed" : "blocked",
        summary: parallelAssessment.ready
          ? "Parallel candidate has independent units with explicit non-overlapping source scopes."
          : `Parallel candidate is blocked: ${parallelAssessment.blockedReasons.join("; ")}.`,
        refs: parallelAssessment.refs,
      }
    : {
        id: "recommendation-boundary",
        status: "passed",
        summary: "Recommendation maps to a non-executing readiness verdict in this phase.",
        refs: [plan.recommendation],
      };
  guardrails.push(recommendationGuardrail);

  const readinessStatus = readinessStatusForRecommendation(plan.recommendation, parallelAssessment.ready);
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
    schedulerEligible: readinessStatus === "ready-for-sequential-taskqueue-proposal" || readinessStatus === "ready-for-scheduler-contract",
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
    case "taskgraph-parallel-candidate": return parallelReady ? "ready-for-scheduler-contract" : "blocked-parallel-guardrails";
    case "multi-change-candidate": return "blocked-multi-change-boundary";
    case "needs-clarification": return "blocked-needs-clarification";
  }
}

function hasMultiChangeImplementationSignal(text: string): boolean {
  return /拆成多个|多个需求|multiple changes/i.test(text)
    || /multi-change\s+(candidate|split|implementation|execution)/i.test(text)
    || /多个\s*(?:Change|change)\s*(?:执行|实现|拆分|分别|候选)/.test(text);
}

function assessParallelReadiness(plan: DecompositionPlan): { ready: boolean; blockedReasons: string[]; refs: string[] } {
  if (plan.recommendation !== "taskgraph-parallel-candidate") {
    return { ready: false, blockedReasons: ["not a parallel candidate"], refs: [plan.recommendation] };
  }
  const refs = unique([...plan.conflictScopes, ...plan.units.flatMap((unit) => unit.scopeHints), ...plan.dependencies.flatMap((dep) => [dep.from, dep.to])]);
  const blockedReasons: string[] = [];
  if (plan.units.length < 2) blockedReasons.push("requires at least two units");
  const unitsWithExplicitScopes = plan.units.every((unit) => unit.scopeHints.length > 0 && unit.scopeHints.every((hint) => isSpecificSourceScope(hint)));
  if (!unitsWithExplicitScopes) blockedReasons.push("every unit needs explicit source scopes");
  const conflictScopesSpecific = plan.conflictScopes.length > 0 && plan.conflictScopes.every((scope) => isSpecificSourceScope(scope));
  if (!conflictScopesSpecific) blockedReasons.push("conflict scopes must be concrete");
  const hasUnitDependencies = plan.units.some((unit) => unit.dependsOn.length > 0);
  const hasPlanDependencies = plan.dependencies.length > 0;
  if (hasUnitDependencies || hasPlanDependencies) blockedReasons.push("dependent or conflict-linked units must run sequentially");
  const overlaps = findOverlappingSourceScopes(plan.units);
  if (overlaps.length > 0) blockedReasons.push(`source scopes overlap: ${overlaps.join(", ")}`);
  const unacceptedExpansions = detectSourceScopeExpansions([...plan.units.flatMap((unit) => unit.scopeHints), ...plan.conflictScopes], plan.sourceScopeConstraints ?? [], plan.scopeExpansions ?? []);
  if (unacceptedExpansions.length > 0) {
    blockedReasons.push(`source scope expansion requires accepted plan update: ${unacceptedExpansions.map((item) => item.scope).join(", ")}`);
  }
  return { ready: blockedReasons.length === 0, blockedReasons, refs };
}

function extractExplicitSourceScopes(text: string): string[] {
  const matches = text.matchAll(/\b(?:src|test|tests|docs|packages|package|app|apps|lib|scripts|harness|public)[/\\][A-Za-z0-9._/\\-]+/gi);
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 32), index);
    if (isNegatedSourceScopeMention(before)) continue;
    const scope = match[0].replace(/\\/g, "/").replace(/[),;，。；、]+$/g, "");
    if (!isSpecificSourceScope(scope)) continue;
    const normalized = normalizeScope(scope);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    scopes.push(scope);
  }
  return scopes;
}

function hasParallelPlanningSignal(text: string): boolean {
  return /并行|parallel|多个模块|多模块|independent|独立|低冲突|source\s*Scopes?|sourceScopes|互不重叠|无依赖|两个\s*(?:worker|任务|文件)|two[-\s]?(?:file|task|worker)/i.test(text);
}

function isNegatedSourceScopeMention(before: string): boolean {
  return /(?:不要|不得|禁止|不修改|不新增|不允许|不能|无需|无须|not|never|without|do\s+not|don't)\s*(?:在\s*\w+\s*阶段\s*)?(?:修改|新增|创建|add|modify|create)?\s*$/i.test(before);
}

function findOverlappingSourceScopes(units: DecompositionUnit[]): string[] {
  const owners: Array<{ unitId: string; scope: string }> = [];
  const overlaps: string[] = [];
  for (const unit of units) {
    for (const rawScope of unit.scopeHints) {
      if (!isSpecificSourceScope(rawScope)) continue;
      const scope = normalizeScope(rawScope);
      for (const owner of owners) {
        if (owner.unitId === unit.id) continue;
        if (sourceScopesOverlap(owner.scope, scope)) {
          overlaps.push(`${owner.unitId}:${owner.scope}<->${unit.id}:${scope}`);
        }
      }
      owners.push({ unitId: unit.id, scope });
    }
  }
  return overlaps;
}

function detectSourceScopeExpansions(
  scopes: string[],
  constraints: string[],
  acceptedExpansions: Array<{ scope: string; accepted: boolean }> = [],
): Array<{ scope: string; reason: string; accepted: boolean }> {
  const normalizedConstraints = unique(constraints.map(normalizeScope)).filter(Boolean);
  if (normalizedConstraints.length === 0) return [];
  const accepted = new Set(
    acceptedExpansions
      .filter((item) => item.accepted)
      .map((item) => normalizeScope(item.scope)),
  );
  const expansions: Array<{ scope: string; reason: string; accepted: boolean }> = [];
  const seen = new Set<string>();
  for (const rawScope of scopes) {
    if (!isSpecificSourceScope(rawScope)) continue;
    const scope = normalizeScope(rawScope);
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    if (scopeCoveredByConstraints(scope, normalizedConstraints)) continue;
    if (accepted.has(scope)) continue;
    expansions.push({
      scope: rawScope,
      reason: "Source scope is outside the user-accepted planning constraints.",
      accepted: false,
    });
  }
  return expansions;
}

function scopeCoveredByConstraints(scope: string, constraints: string[]): boolean {
  return constraints.some((constraint) => scope === constraint || scope.startsWith(`${constraint}/`));
}

function sourceScopesOverlap(left: string, right: string): boolean {
  if (left === right) return true;
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function nextAllowedActionForReadiness(status: DecompositionReadinessStatus): DecompositionReadinessManifest["nextAllowedAction"] {
  switch (status) {
    case "ready-for-single-change": return "code.run";
    case "ready-for-sequential-taskqueue-proposal": return "taskqueue.proposal";
    case "ready-for-scheduler-contract": return "scheduler.contract";
    case "blocked-needs-clarification": return "clarification.answer";
    case "blocked-parallel-guardrails":
    case "blocked-multi-change-boundary":
    case "invalid":
      return "none";
  }
}

function isSpecificSourceScope(scope: string): boolean {
  const normalized = normalizeScope(scope);
  if (!normalized) return false;
  if (normalized === "selected-demand") return false;
  if (normalized === "aho-owned worktree only") return false;
  if (normalized.includes("must be checked")) return false;
  if (normalized.includes("source overlap")) return false;
  return /[/.\\]/.test(normalized) || /\bsrc\b|\btest\b|\bdocs\b|\bmodule\b|\bpackage\b/.test(normalized);
}

function normalizeScope(scope: string): string {
  return scope.trim().toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
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
