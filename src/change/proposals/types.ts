import type { AgentRole } from "../../agent/catalog.js";
import type {
  ChangeProposalTargetHashes,
  ChangeStatus,
  ManagedProject,
  PlanProposal,
  ResolvedMemory,
  RunArtifactPaths,
  RunMetadata,
  SpecProposal,
} from "../../types/index.js";

export type ProposalKind = "spec" | "plan";

export interface ProposalRunPaths {
  directory: string;
  run: string;
  context: string;
  prompt: string;
  events: string;
  stdout: string;
  stderr: string;
  codexEvents: string;
  lastMessage: string;
  proposal: string;
  proposalMarkdown: string;
}

export interface CommonProposalRun {
  memory: ResolvedMemory;
  changeStatus: ChangeStatus;
  changeId: string;
  changePath: string;
  runId: string;
  paths: ProposalRunPaths;
  artifacts: RunArtifactPaths;
  context: string;
  targetHashes: ChangeProposalTargetHashes;
  startedAt: string;
  role: AgentRole;
}

export interface ChangeProposalRunOptions {
  prompt?: string;
  changeId?: string;
}

export interface SpecProposalRunResult {
  run: RunMetadata;
  proposal: SpecProposal;
}

export interface PlanProposalRunResult {
  run: RunMetadata;
  proposal: PlanProposal;
}

export interface SpecProposalAcceptResult {
  proposal: SpecProposal;
  changeStatus: ChangeStatus;
  specPath: string;
}

export interface PlanProposalAcceptResult {
  proposal: PlanProposal;
  changeStatus: ChangeStatus;
  planPath: string;
  tasksPath: string;
}

export type ProposalProject = ManagedProject;
