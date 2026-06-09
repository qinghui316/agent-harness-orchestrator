export type ChangeProposalStatus = "proposed" | "blocked" | "failed";

export interface ChangeProposalTargetHashes {
  spec?: string;
  plan?: string;
  tasks?: string;
}

export interface SpecProposal {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: ChangeProposalStatus;
  startedAt: string;
  finishedAt: string;
  targetHashes: ChangeProposalTargetHashes;
  specMd: string;
  openQuestions: string[];
  assumptions: string[];
  warnings: string[];
  artifacts: {
    proposal: string;
    proposalMarkdown: string;
    lastMessage: string;
  };
}

export interface PlanProposal {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: ChangeProposalStatus;
  startedAt: string;
  finishedAt: string;
  targetHashes: ChangeProposalTargetHashes;
  planMd: string;
  tasksMd: string;
  openQuestions: string[];
  assumptions: string[];
  warnings: string[];
  artifacts: {
    proposal: string;
    proposalMarkdown: string;
    lastMessage: string;
  };
}

export interface ChangeProposalSummary {
  id: string;
  runId: string;
  changeId: string;
  status: ChangeProposalStatus;
  startedAt: string;
  finishedAt: string;
  openQuestionCount: number;
  warningCount: number;
}
