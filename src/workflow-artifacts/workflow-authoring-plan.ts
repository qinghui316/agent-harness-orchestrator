import type { WorkflowAuthoringPlan, WorkflowAuthoringReferences } from "./types.js";
import { workflowAuthoringPlanSchema } from "./schemas.js";

const workflowHeading = /^## Workflow[ \t]*$/gm;

export function parseWorkflowAuthoringPlan(planMarkdown: string, references: WorkflowAuthoringReferences): WorkflowAuthoringPlan {
  const matches = [...planMarkdown.matchAll(workflowHeading)];
  if (matches.length === 0) throw new Error("plan.md must contain exactly one ## Workflow section with fenced JSON.");
  if (matches.length > 1) throw new Error("plan.md contains duplicate ## Workflow sections.");

  const match = matches[0];
  const sectionStart = (match.index ?? 0) + match[0].length;
  const remainder = planMarkdown.slice(sectionStart);
  const nextHeading = /^##\s+/m.exec(remainder);
  const section = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim();
  const fenced = /^```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/.exec(section);
  if (!fenced) {
    throw new Error("## Workflow must contain only one fenced json object; prose is not a workflow definition.");
  }

  let value: unknown;
  try {
    value = JSON.parse(fenced[1]);
  } catch (error) {
    throw new Error(`## Workflow contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = workflowAuthoringPlanSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`## Workflow does not match the fixed schema: ${parsed.error.issues.map(formatIssue).join("; ")}`);
  }
  validateWorkflowAuthoringPlan(parsed.data, references);
  return parsed.data;
}

export function validateWorkflowAuthoringPlan(plan: WorkflowAuthoringPlan, references: WorkflowAuthoringReferences): void {
  const nodeIds = new Set<string>();
  for (const node of plan.nodes) {
    if (nodeIds.has(node.id)) throw new Error(`## Workflow contains duplicate node id ${node.id}.`);
    nodeIds.add(node.id);
    assertUniqueReferences(node.id, "taskIds", node.taskIds);
    assertUniqueReferences(node.id, "acIds", node.acIds);
    assertUniqueReferences(node.id, "dependsOn", node.dependsOn);
    assertUniqueReferences(node.id, "sourceScopes", node.sourceScopes);
    if (node.taskIds.length !== 1) throw new Error(`Workflow node ${node.id} must reference exactly one task in v1.`);
    for (const scope of node.sourceScopes) assertSafeSourceScope(node.id, scope);
    assertStructuredNodePrompt(node.id, node.prompt);
  }

  const knownTaskIds = normalizedReferenceSet(references.taskIds, "task");
  const knownAcIds = normalizedReferenceSet(references.acIds, "acceptance criterion");
  const coveredTaskIds = new Set<string>();
  const coveredAcIds = new Set<string>();
  for (const node of plan.nodes) {
    for (const taskId of node.taskIds) {
      if (!knownTaskIds.has(normalizeId(taskId))) throw new Error(`Workflow node ${node.id} references unknown task ${taskId}.`);
      coveredTaskIds.add(normalizeId(taskId));
    }
    for (const acId of node.acIds) {
      if (!knownAcIds.has(normalizeId(acId))) throw new Error(`Workflow node ${node.id} references unknown acceptance criterion ${acId}.`);
      coveredAcIds.add(normalizeId(acId));
    }
    for (const dependency of node.dependsOn) {
      if (!nodeIds.has(dependency)) throw new Error(`Workflow node ${node.id} references unknown dependency ${dependency}.`);
      if (dependency === node.id) throw new Error(`Workflow node ${node.id} cannot depend on itself.`);
    }
  }

  const missingTaskIds = [...knownTaskIds].filter((id) => !coveredTaskIds.has(id));
  if (missingTaskIds.length) throw new Error(`## Workflow does not cover accepted task ids: ${missingTaskIds.join(", ")}.`);
  const missingAcIds = [...knownAcIds].filter((id) => !coveredAcIds.has(id));
  if (missingAcIds.length) throw new Error(`## Workflow does not cover accepted acceptance criterion ids: ${missingAcIds.join(", ")}.`);

  assertAcyclic(plan);
  if (plan.mode === "ready-set-v1") assertReadySetScopesDoNotOverlap(plan);
}

function assertSafeSourceScope(nodeId: string, scope: string): void {
  const normalized = scope.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`Workflow node ${nodeId} contains an absolute or empty source scope: ${scope}.`);
  }
  if (normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error(`Workflow node ${nodeId} contains an unsafe source scope: ${scope}.`);
  }
}

function assertStructuredNodePrompt(nodeId: string, prompt: string): void {
  const labels = ["Objective:", "Required behavior:", "Constraints:", "Expected evidence:"];
  let offset = -1;
  for (const label of labels) {
    const index = prompt.toLowerCase().indexOf(label.toLowerCase());
    if (index <= offset) throw new Error(`Workflow node ${nodeId} prompt must contain ${labels.join(", ")} in order.`);
    offset = index;
  }
}

function assertReadySetScopesDoNotOverlap(plan: WorkflowAuthoringPlan): void {
  for (let leftIndex = 0; leftIndex < plan.nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < plan.nodes.length; rightIndex += 1) {
      const left = plan.nodes[leftIndex];
      const right = plan.nodes[rightIndex];
      for (const leftScope of left.sourceScopes) {
        for (const rightScope of right.sourceScopes) {
          if (sourceScopesOverlap(leftScope, rightScope)) {
            throw new Error(`Ready-set workflow nodes ${left.id} and ${right.id} contain overlapping source scopes: ${leftScope} and ${rightScope}.`);
          }
        }
      }
    }
  }
}

function sourceScopesOverlap(left: string, right: string): boolean {
  const normalize = (value: string): string => value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const leftValue = normalize(left);
  const rightValue = normalize(right);
  if (leftValue === rightValue) return true;
  const wildcardPattern = /[*?[{]/;
  const leftWildcard = wildcardPattern.test(leftValue);
  const rightWildcard = wildcardPattern.test(rightValue);
  const root = (value: string): string => value.slice(0, value.search(wildcardPattern) < 0 ? value.length : value.search(wildcardPattern)).replace(/\/+$/, "");
  const leftRoot = root(leftValue);
  const rightRoot = root(rightValue);
  if ((leftWildcard && !leftRoot) || (rightWildcard && !rightRoot)) return true;
  if (leftWildcard && (rightValue === leftRoot || rightValue.startsWith(`${leftRoot}/`) || rightRoot === leftRoot)) return true;
  if (rightWildcard && (leftValue === rightRoot || leftValue.startsWith(`${rightRoot}/`) || leftRoot === rightRoot)) return true;
  return false;
}

function assertAcyclic(plan: WorkflowAuthoringPlan): void {
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string, path: string[]): void => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      throw new Error(`## Workflow contains a dependency cycle: ${[...path.slice(cycleStart), nodeId].join(" -> ")}.`);
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = nodes.get(nodeId);
    for (const dependency of node?.dependsOn ?? []) visit(dependency, [...path, nodeId]);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of plan.nodes) visit(node.id, []);
}

function normalizedReferenceSet(values: readonly string[], label: string): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = normalizeId(value);
    if (!normalized) throw new Error(`Known ${label} ids must not contain empty values.`);
    if (result.has(normalized)) throw new Error(`Known ${label} ids contain duplicate id ${value}.`);
    result.add(normalized);
  }
  return result;
}

function assertUniqueReferences(nodeId: string, field: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeId(value);
    if (seen.has(normalized)) throw new Error(`Workflow node ${nodeId} contains duplicate ${field} value ${value}.`);
    seen.add(normalized);
  }
}

function normalizeId(value: string): string {
  return value.trim().toUpperCase();
}

function formatIssue(issue: { path: Array<string | number>; message: string }): string {
  const path = issue.path.length ? issue.path.join(".") : "workflow";
  return `${path}: ${issue.message}`;
}
