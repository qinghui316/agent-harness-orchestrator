import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeJsonFile } from "../../fs/json.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../project-runtime/coordinator.js";
import { projectExecutionRuntimePort, type ProjectCodeExecutionRuntimePort } from "../../project-runtime/execution-ports.js";
import { resolveProjectRuntimePaths } from "../../project-runtime/paths.js";
import type { ManagedProject, SpecTestProposal, SpecTestProposalEvidence } from "../../types/index.js";
import type { HighImpactApprovalScope } from "../../workflow-actions/high-impact-approval.js";
import { specTestsSchema } from "./schemas.js";
import { readSpecTestsOrDefault } from "./repository.js";
import { getSpecTestContextForChange, getSpecTestStatus, type SpecTestMappingPublicationHooks } from "./status.js";

const actionId = "spec-test.proposal.accept-all-existing" as const;
const transactionStageSchema = z.enum(["prepared", "mapping-written", "completed"]);
const scopeSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  conversationId: z.string().min(1),
  graphScopeId: z.string().min(1),
  workflowGraphPlanId: z.string().min(1),
  acceptedProposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  authorizationId: z.string().min(1),
  evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  targetManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const transactionSchema = z.object({
  version: z.literal("1.0"),
  id: z.string().regex(/^[a-f0-9]{64}$/),
  stage: transactionStageSchema,
  actionId: z.literal(actionId),
  proposal: z.unknown(),
  accepted: z.array(z.unknown()),
  skipped: z.array(z.object({ refId: z.string(), reason: z.string() }).strict()),
  scope: scopeSchema,
  before: specTestsSchema,
  after: specTestsSchema,
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

type SpecTestAcceptanceTransaction = z.infer<typeof transactionSchema>;

export interface SpecTestAcceptanceRecoveryReceipt {
  transactionId: string;
  actionId: typeof actionId;
  label: string;
  command: string;
  args: string[];
  scope: HighImpactApprovalScope;
  result: {
    proposal: SpecTestProposal;
    accepted: SpecTestProposalEvidence[];
    skipped: Array<{ refId: string; reason: string }>;
    status: Awaited<ReturnType<typeof getSpecTestStatus>>;
    acceptanceTransactionId: string;
  };
}

export function createSpecTestAcceptancePublication(input: {
  runtime: ProjectCodeExecutionRuntimePort;
  proposal: SpecTestProposal;
  accepted: SpecTestProposalEvidence[];
  skipped: Array<{ refId: string; reason: string }>;
  scope: HighImpactApprovalScope;
}): { transactionId: string; hooks: SpecTestMappingPublicationHooks } {
  const transactionId = hashJson({
    actionId,
    proposalId: input.proposal.id,
    proposalRunId: input.proposal.runId,
    scope: input.scope,
  });
  const path = transactionPath(input.runtime, transactionId);
  return {
    transactionId,
    hooks: {
      async prepare(before, after) {
        const now = new Date().toISOString();
        const transaction: SpecTestAcceptanceTransaction = {
          version: "1.0",
          id: transactionId,
          stage: "prepared",
          actionId,
          proposal: input.proposal,
          accepted: input.accepted,
          skipped: input.skipped,
          scope: input.scope,
          before,
          after,
          beforeHash: hashJson(before),
          afterHash: hashJson(after),
          createdAt: now,
          updatedAt: now,
        };
        await mkdir(transactionRoot(input.runtime), { recursive: true });
        if (existsSync(path)) {
          const existing = await readTransaction(path);
          if (existing.id !== transactionId || existing.scope.targetManifestHash !== input.scope.targetManifestHash) {
            throw new Error("Spec-Test acceptance transaction identity conflict.");
          }
        }
        await writeJsonFile(path, transaction);
      },
      async committed(after) {
        const current = await readTransaction(path);
        if (current.afterHash !== hashJson(after)) {
          throw new Error("Spec-Test acceptance transaction after-state changed before commit.");
        }
        await writeJsonFile(path, {
          ...current,
          stage: "mapping-written",
          updatedAt: new Date().toISOString(),
        });
      },
      async rollback() {
        await rm(path, { force: true });
      },
    },
  };
}

export async function completeSpecTestAcceptanceTransaction(
  project: ManagedProject,
  transactionId: string,
): Promise<void> {
  const runtime = await resolveRuntime(project);
  const path = transactionPath(runtime, transactionId);
  const transaction = await readTransaction(path);
  if (transaction.scope.projectId !== runtime.projectId) {
    throw new Error("Spec-Test acceptance transaction project scope is stale.");
  }
  await writeJsonFile(path, {
    ...transaction,
    stage: "completed",
    updatedAt: new Date().toISOString(),
  });
}

export async function recoverSpecTestApprovalReceipts(
  project: ManagedProject,
  onReceipt: (receipt: SpecTestAcceptanceRecoveryReceipt) => Promise<void>,
): Promise<SpecTestAcceptanceRecoveryReceipt[]> {
  const unresolvedRoot = transactionRoot(resolveProjectRuntimePaths(project.id));
  if (!existsSync(unresolvedRoot)) return [];
  const runtime = await resolveRuntime(project);
  const root = transactionRoot(runtime);
  if (!existsSync(root)) {
    throw new Error("Spec-Test acceptance recovery root changed during project resolution.");
  }
  const receipts: SpecTestAcceptanceRecoveryReceipt[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
    const path = join(root, entry.name);
    let transaction = await readTransaction(path);
    if (transaction.stage === "completed") continue;
    const context = await getSpecTestContextForChange(project, transaction.scope.changeId);
    assertTransactionScope(transaction, context);
    const current = await readSpecTestsOrDefault(context.evidenceRoot, context.changeId);
    const currentHash = hashJson(current);
    if (currentHash === transaction.beforeHash && transaction.stage === "prepared") {
      await rm(path, { force: true });
      continue;
    }
    if (currentHash !== transaction.afterHash) {
      throw new Error(`Spec-Test acceptance recovery found an unrecognized mapping state: ${transaction.id}.`);
    }
    if (transaction.stage === "prepared") {
      transaction = {
        ...transaction,
        stage: "mapping-written",
        updatedAt: new Date().toISOString(),
      };
      await writeJsonFile(path, transaction);
    }
    const receipt: SpecTestAcceptanceRecoveryReceipt = {
      transactionId: transaction.id,
      actionId,
      label: "Accept source-root spec-test evidence",
      command: "spec-test",
      args: ["proposal", "accept", transaction.scope.projectId, (transaction.proposal as SpecTestProposal).id, "--all-existing"],
      scope: transaction.scope,
      result: {
        proposal: transaction.proposal as SpecTestProposal,
        accepted: transaction.accepted as SpecTestProposalEvidence[],
        skipped: transaction.skipped,
        status: await getSpecTestStatus(project, { changeId: transaction.scope.changeId }),
        acceptanceTransactionId: transaction.id,
      },
    };
    await onReceipt(receipt);
    await completeSpecTestAcceptanceTransaction(project, transaction.id);
    receipts.push(receipt);
  }
  return receipts;
}

function transactionRoot(runtime: Pick<ProjectCodeExecutionRuntimePort, "workbenchRoot">): string {
  return join(runtime.workbenchRoot, "spec-test-acceptance-transactions");
}

function transactionPath(
  runtime: Pick<ProjectCodeExecutionRuntimePort, "workbenchRoot">,
  transactionId: string,
): string {
  if (!/^[a-f0-9]{64}$/.test(transactionId)) throw new Error("Invalid Spec-Test acceptance transaction id.");
  return join(transactionRoot(runtime), `${transactionId}.json`);
}

async function readTransaction(path: string): Promise<SpecTestAcceptanceTransaction> {
  return transactionSchema.parse(JSON.parse(await readFile(path, "utf8"))) as SpecTestAcceptanceTransaction;
}

async function resolveRuntime(project: ManagedProject): Promise<ProjectCodeExecutionRuntimePort> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for Spec-Test recovery: ${state.state}.`);
  return projectExecutionRuntimePort(project, state.resolution);
}

function assertTransactionScope(
  transaction: SpecTestAcceptanceTransaction,
  context: Awaited<ReturnType<typeof getSpecTestContextForChange>>,
): void {
  if (transaction.scope.projectId !== context.projectId
    || transaction.scope.changeId !== context.changeId
    || transaction.scope.conversationId !== context.conversationId
    || transaction.scope.graphScopeId !== context.graphScopeId
    || transaction.scope.workflowGraphPlanId !== context.planning.graph.id
    || transaction.scope.acceptedProposalHash !== context.planning.mainAcceptance.proposalHash
    || transaction.scope.authorizationId !== context.planning.authorizationIntent.authorizationId
    || transaction.scope.targetManifestHash !== hashJson(transaction.proposal)) {
    throw new Error(`Spec-Test acceptance recovery scope is stale: ${transaction.id}.`);
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
