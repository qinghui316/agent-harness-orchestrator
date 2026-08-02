import { existsSync } from "node:fs";
import { join } from "node:path";
import { readProjectMarker } from "../../../project/marker.js";
import { getProjectStatus } from "../../../project/status.js";
import { resolveMemory } from "../../../memory/resolver.js";
import { readScopedChangeMetadataAt } from "../../../change/metadata.js";
import type { ChangeMetadata, ResolvedMemory } from "../../../types/index.js";
import type { HarnessGap, WorkbenchProjectInput, WorkbenchSnapshot, WorkbenchTopicState } from "../../read-model-types.js";

export function buildHarnessGaps(): HarnessGap[] {
  return [
    {
      id: "roleCatalog",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5A",
      summary: "Bundled role profiles exist and are readable, but there is no declarative project role registry yet.",
    },
    {
      id: "runStreamIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5B",
      summary: "Run stream replay packets are available after Phase 5B, but live transport and cancel/interrupt remain future work.",
    },
    {
      id: "approvalIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5B",
      summary: "审批项从 canonical state 派生；当前没有独立持久化审批列表。",
    },
    {
      id: "sessionModel",
      severity: "info",
      status: "missing",
      recommendedPhase: "Future",
      summary: "Run is the current execution source of truth. Session remains a future runtime auxiliary.",
    },
    {
      id: "workspaceIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5C",
      summary: "Memory Resolver provides roots, but there is no workspace-wide index comparable to AgentScope workspace indexes.",
    },
    {
      id: "subagentSpec",
      severity: "info",
      status: "missing",
      recommendedPhase: "Phase 5C",
      summary: "No declarative subagent registry exists. Current roles are bundled profiles selected by commands.",
    },
    {
      id: "backgroundEvolutionQueue",
      severity: "warning",
      status: "partial",
      recommendedPhase: "Future",
      summary: "演进仍是显式受控流程；当前没有自动修改 canonical 文档的后台维护通道。",
    },
  ];
}

export async function resolveWorkbenchMemory(input: WorkbenchProjectInput): Promise<ResolvedMemory> {
  const marker = await readProjectMarker(input.path);
  return resolveMemory(input.project ? { ...input.project, marker } : { path: input.path, marker });
}

export async function readChangeMetadataAt(memory: ResolvedMemory, relativePath: string): Promise<ChangeMetadata | null> {
  if (!existsSync(join(memory.memoryRoot, relativePath, "change.json"))) return null;
  const state = relativePath.includes("/archive/") || relativePath.includes("\\archive\\") ? "archive" : "active";
  return (await readScopedChangeMetadataAt(memory, relativePath, state)).metadata;
}

export function stateRank(state: WorkbenchTopicState): number {
  if (state === "active") return 0;
  return 1;
}

export function buildRepoSummary(status: Awaited<ReturnType<typeof getProjectStatus>>): WorkbenchSnapshot["left"]["repo"] {
  return {
    path: status.path,
    exists: status.pathExists,
    git: status.isGitRepo,
    branch: status.branch,
    dirty: status.dirty,
  };
}

export function humanConfirmationForRole(id: string): string {
  if (id === "coder-agent" || id === "rework-coder" || id === "spec-test-generator") return "Validation and audit evidence govern source landing.";
  if (id === "harness-evolution-agent") return "Harness Evolution requires an explicit owner and candidate-bound Judge.";
  if (id === "auditor-agent") return "Audit verdict is consumed by the Workflow Runtime.";
  return "The owning Runtime validates any canonical state transition.";
}
