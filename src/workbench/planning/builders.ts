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

type AgentPlanSectionKey = "goal" | "scope" | "acceptance" | "implementation" | "tasks" | "risks" | "questions" | "other";

interface AgentAuthoredPlanSections {
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  design: string;
  tasks: Array<{ id: string; title: string; acIds: string[] }>;
  risks: string[];
  openQuestions: string[];
  sourceScopeConstraints: string[];
  warnings: string[];
}

export function buildAgentAuthoredPlanningBundle(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  prompt: string,
  previous: PlanningArtifactBundle | null,
  revision: boolean,
  options: {
    proposedPlanMd: string;
    proposedPlanRunId?: string;
    planningMode?: PlanningArtifactBundle["planningMode"];
    planningWarnings?: string[];
  },
): PlanningArtifactBundle {
  const proposedPlanMd = options.proposedPlanMd.trim();
  if (!proposedPlanMd) {
    throw new Error("Agent-authored planning requires non-empty native plan content.");
  }
  const parsed = parseAgentAuthoredPlan(proposedPlanMd);
  const now = new Date().toISOString();
  const id = `planning-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "latest-bundle.md"));
  const planningWarnings = uniqueStrings([
    ...(options.planningWarnings ?? []),
    ...parsed.warnings,
  ]);
  const specMd = renderSpecMarkdown(changeId, parsed.goal, parsed.constraints, parsed.acceptanceCriteria);
  const planMd = renderAgentAuthoredImplementationPlanMarkdown(proposedPlanMd, parsed.tasks);
  const tasksMd = renderTasksMarkdown(parsed.tasks);
  return {
    id,
    status: "draft",
    ...(options.planningMode ? { planningMode: options.planningMode } : {}),
    proposedPlanMd,
    ...(options.proposedPlanRunId ? { proposedPlanRunId: options.proposedPlanRunId } : {}),
    ...(planningWarnings.length ? { planningWarnings } : {}),
    goal: parsed.goal,
    constraints: parsed.constraints,
    sourceScopeConstraints: parsed.sourceScopeConstraints,
    acceptanceCriteria: parsed.acceptanceCriteria,
    design: parsed.design,
    tasks: parsed.tasks,
    risks: parsed.risks,
    openQuestions: parsed.openQuestions,
    specMd,
    planMd,
    tasksMd,
    acMapCandidate: buildAcMap({ changeId, specContent: specMd, tasksContent: tasksMd, placeholderFiles: [] }),
    artifact,
    updatedAt: now,
  };
}

export function buildDeterministicPlanningBundle(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  prompt: string,
  previous: PlanningArtifactBundle | null,
  revision: boolean,
  options: {
    proposedPlanMd?: string | null;
    proposedPlanRunId?: string;
    planningMode?: PlanningArtifactBundle["planningMode"];
    planningWarnings?: string[];
  } = {},
): PlanningArtifactBundle {
  if (!options.proposedPlanMd?.trim()) {
    throw new Error("Deterministic planning content generation is retired; provide Agent-authored native plan content.");
  }
  return buildAgentAuthoredPlanningBundle(memory, changePath, changeId, prompt, previous, revision, {
    proposedPlanMd: options.proposedPlanMd,
    ...(options.proposedPlanRunId ? { proposedPlanRunId: options.proposedPlanRunId } : {}),
    ...(options.planningMode ? { planningMode: options.planningMode } : {}),
    ...(options.planningWarnings ? { planningWarnings: options.planningWarnings } : {}),
  });
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
  const signalText = [bundle?.goal, bundle?.proposedPlanMd, bundle?.design, prompt, threadText].filter(Boolean).join("\n");
  const tasks = bundle?.tasks.length ? bundle.tasks : [{ id: "T-001", title: bundle?.goal ?? "Clarify and implement the accepted demand.", acIds: [] }];
  const asksClarification = (bundle?.openQuestions.length ?? 0) > 0 || /不明确|澄清|clarify/i.test(signalText);
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
    ...(bundle?.sourceScopeConstraints ?? []),
    ...extractExplicitSourceScopes(bundle?.goal ?? ""),
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

function parseAgentAuthoredPlan(markdown: string): AgentAuthoredPlanSections {
  const sections = splitAgentPlanSections(markdown);
  const goal = firstSectionItem(sections, ["goal"]);
  const constraints = sectionItems(sections, ["scope"]);
  const acceptance = sectionItems(sections, ["acceptance"]);
  const implementationItems = sectionItems(sections, ["implementation"]);
  const taskItems = sectionItems(sections, ["tasks"]);
  const risks = sectionItems(sections, ["risks"]);
  const openQuestions = sectionItems(sections, ["questions"]);
  const missing: string[] = [];
  if (!goal) missing.push("goal");
  if (constraints.length === 0) missing.push("scope/constraints");
  if (acceptance.length === 0) missing.push("acceptance/verification");
  if (implementationItems.length === 0) missing.push("implementation approach");
  if (taskItems.length === 0) missing.push("tasks");
  if (missing.length > 0) {
    throw new Error(`Agent-authored plan is missing required planning sections: ${missing.join(", ")}.`);
  }
  const acceptanceCriteria = acceptance.map((item, index) => normalizeAcceptanceCriterion(item, index));
  const acIds = acceptanceCriteria.map((_item, index) => `AC-${String(index + 1).padStart(3, "0")}`);
  const tasks = taskItems.map((item, index) => ({
    id: normalizeTaskId(item, index),
    title: normalizeTaskTitle(item),
    acIds: referencedAcIds(item, acIds),
  }));
  const sourceScopeConstraints = uniqueStrings(extractExplicitSourceScopes([
    goal,
    ...constraints,
    ...implementationItems,
    ...taskItems,
  ].join("\n")));
  return {
    goal,
    constraints,
    acceptanceCriteria,
    design: implementationItems.join("\n"),
    tasks,
    risks,
    openQuestions,
    sourceScopeConstraints,
    warnings: risks.length === 0 ? ["Agent-authored plan did not include an explicit risk section."] : [],
  };
}

function splitAgentPlanSections(markdown: string): Record<AgentPlanSectionKey, string[]> {
  const sections: Record<AgentPlanSectionKey, string[]> = {
    goal: [],
    scope: [],
    acceptance: [],
    implementation: [],
    tasks: [],
    risks: [],
    questions: [],
    other: [],
  };
  let current: AgentPlanSectionKey = "other";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const key = agentPlanSectionKey(rawLine);
    if (key) {
      current = key;
      const trailing = trailingSectionContent(rawLine);
      if (trailing) sections[current].push(trailing);
      continue;
    }
    sections[current].push(rawLine);
  }
  return sections;
}

function agentPlanSectionKey(line: string): AgentPlanSectionKey | null {
  const label = normalizeSectionLabel(line);
  if (!label) return null;
  if (/^(goal|objective|purpose|目标|目的|需求|用户目标|本轮目标)$/.test(label)) return "goal";
  if (/^(scope|constraints?|boundar(y|ies)|non-goals?|范围|约束|边界|非目标|不做什么)$/.test(label)) return "scope";
  if (/^(acceptance|acceptance criteria|verification|validation|tests?|验收|验收标准|验证|测试|检查方式)$/.test(label)) return "acceptance";
  if (/^(approach|implementation|implementation plan|plan|design|steps|方案|实现方案|实施方案|计划|步骤)$/.test(label)) return "implementation";
  if (/^(tasks?|task list|todo|任务|任务清单|待办)$/.test(label)) return "tasks";
  if (/^(risks?|risk|风险|风险和缓解|注意事项)$/.test(label)) return "risks";
  if (/^(questions?|open questions?|clarifications?|待确认|澄清问题|问题|需要确认)$/.test(label)) return "questions";
  return null;
}

function normalizeSectionLabel(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]
    ?? trimmed.match(/^\*\*(.+?)\*\*\s*[:：]?\s*$/)?.[1]
    ?? trimmed.match(/^(.{1,40}?)[：:]\s*$/)?.[1]
    ?? trimmed.match(/^(.{1,40}?)$/)?.[1];
  if (!heading) return "";
  const withoutNumbering = heading
    .replace(/^\s*(?:\d+[.)、]\s*|[-*]\s*)/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return withoutNumbering;
}

function trailingSectionContent(line: string): string {
  const match = line.trim().match(/^#{1,6}\s+[^:：]+[:：]\s*(.+)$/)
    ?? line.trim().match(/^[^:：]{1,40}[:：]\s*(.+)$/);
  return match?.[1]?.trim() ?? "";
}

function firstSectionItem(sections: Record<AgentPlanSectionKey, string[]>, keys: AgentPlanSectionKey[]): string {
  return sectionItems(sections, keys)[0] ?? "";
}

function sectionItems(sections: Record<AgentPlanSectionKey, string[]>, keys: AgentPlanSectionKey[]): string[] {
  const items: string[] = [];
  for (const key of keys) {
    const paragraphs: string[] = [];
    for (const rawLine of sections[key]) {
      const normalized = normalizePlanContentLine(rawLine);
      if (!normalized) {
        flushParagraph(paragraphs, items);
        continue;
      }
      if (agentPlanSectionKey(rawLine)) {
        flushParagraph(paragraphs, items);
        continue;
      }
      if (/^(?:[-*]\s+|\d+[.)、]\s+|\[[ xX]\]\s+)/.test(rawLine.trim())) {
        flushParagraph(paragraphs, items);
        items.push(normalized);
      } else {
        paragraphs.push(normalized);
      }
    }
    flushParagraph(paragraphs, items);
  }
  return uniqueStrings(items).map((item) => item.length > 500 ? `${item.slice(0, 497)}...` : item);
}

function flushParagraph(paragraph: string[], items: string[]): void {
  if (paragraph.length === 0) return;
  items.push(paragraph.join(" "));
  paragraph.length = 0;
}

function normalizePlanContentLine(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\[[ xX]\]\s+/, "")
    .replace(/^\s*\d+[.)、]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAcceptanceCriterion(item: string, index: number): string {
  const id = `AC-${String(index + 1).padStart(3, "0")}`;
  return item.match(/^AC-\d{3}\s*[:：-]/i)
    ? item.replace(/^AC-\d{3}/i, id)
    : `${id}: ${item}`;
}

function normalizeTaskId(item: string, index: number): string {
  return item.match(/\bT-\d{3}\b/i)?.[0].toUpperCase() ?? `T-${String(index + 1).padStart(3, "0")}`;
}

function normalizeTaskTitle(item: string): string {
  const title = item
    .replace(/\bT-\d{3}\b\s*[:：-]?\s*/i, "")
    .replace(/\b(?:covers?|覆盖)\s*[:：]?\s*AC-\d{3}(?:\s*,\s*AC-\d{3})*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) throw new Error("Agent-authored plan contains an empty task title.");
  return title.length > 160 ? `${title.slice(0, 157)}...` : title;
}

function referencedAcIds(item: string, fallbackIds: string[]): string[] {
  const refs = Array.from(item.matchAll(/\bAC-\d{3}\b/gi)).map((match) => match[0].toUpperCase());
  return refs.length > 0 ? uniqueStrings(refs) : fallbackIds;
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
    ...constraints.map((item) => `- ${item}`),
    "",
    "## Acceptance Criteria",
    "",
    ...acceptanceCriteria.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderAgentAuthoredImplementationPlanMarkdown(proposedPlanMd: string, tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Plan",
    "",
    proposedPlanMd.trim(),
    "",
    "## Accepted Task Mapping",
    "",
    ...tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
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
