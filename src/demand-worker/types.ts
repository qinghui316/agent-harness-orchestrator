import type { DemandWorker } from "../types/index.js";

export interface EnqueueDemandWorkerInput {
  changeId: string;
  waitingReason?: string;
}

export interface EnqueueDemandWorkerResult {
  worker: DemandWorker;
  resumed: boolean;
}

export interface ClaimDemandWorkerOptions {
  maxConcurrentDemands?: number;
  changeId?: string;
}

export type ClaimAvailableDemandWorkerOptions = ClaimDemandWorkerOptions;

export interface CompleteDemandWorkerInput {
  status: "result-ready" | "needs-user-input" | "failed" | "completed" | "released";
  resultStatus?: string;
  summary: string;
  failureReason?: string;
  agentTaskIds?: string[];
}
