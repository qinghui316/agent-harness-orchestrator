import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import {
  assertSchedulerWorkflowArtifactScope,
  schedulerArtifactRef,
  type SchedulerArtifactStore,
} from "../scheduler-runtime/artifact-store.js";
import {
  latestSchedulerContractMarkdownPath,
  latestSchedulerContractPath,
  latestSchedulerClaimReconcilePlanMarkdownPath,
  latestSchedulerClaimReconcilePlanPath,
  latestSchedulerDispatchDryRunMarkdownPath,
  latestSchedulerDispatchDryRunPath,
  latestSchedulerLaunchPreflightMarkdownPath,
  latestSchedulerLaunchPreflightPath,
  latestSchedulerRunMarkdownPath,
  latestSchedulerRunPath,
  latestSchedulerWorkerSessionPlanMarkdownPath,
  latestSchedulerWorkerSessionPlanPath,
  schedulerContractPath,
  schedulerContractsDir,
  schedulerClaimReconcilePlanPath,
  schedulerClaimReconcilePlansDir,
  schedulerDispatchDryRunPath,
  schedulerDispatchDryRunsDir,
  schedulerLaunchPreflightPath,
  schedulerLaunchPreflightsDir,
  schedulerRunJournalPath,
  schedulerRunPath,
  schedulerRunsDir,
  schedulerWorkerSessionPlanPath,
  schedulerWorkerSessionPlansDir,
} from "./paths.js";
import { renderSchedulerClaimReconcilePlanMarkdown, renderSchedulerContractMarkdown, renderSchedulerDispatchDryRunMarkdown, renderSchedulerLaunchPreflightMarkdown, renderSchedulerRunMarkdown, renderSchedulerWorkerSessionPlanMarkdown } from "./rendering.js";
import { schedulerClaimReconcilePlanSchema, schedulerContractSchema, schedulerDispatchDryRunSchema, schedulerLaunchPreflightSchema, schedulerRunJournalEventSchema, schedulerRunSchema, schedulerWorkerSessionPlanSchema } from "./schemas.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerRunJournalEvent, SchedulerRunJournalEventType, SchedulerWorkerSessionPlan } from "./types.js";

export async function writeSchedulerContract(memory: SchedulerArtifactStore, changePath: string, contract: SchedulerContract): Promise<void> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, contract, "SchedulerContract");
  const dir = schedulerContractsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${contract.id}.json`), contract);
  await writeFile(join(dir, `${contract.id}.md`), renderSchedulerContractMarkdown(contract), "utf8");
  await writeJsonFile(latestSchedulerContractPath(memory, changePath), contract);
  await writeFile(latestSchedulerContractMarkdownPath(memory, changePath), renderSchedulerContractMarkdown(contract), "utf8");
}

export async function readLatestSchedulerContract(memory: SchedulerArtifactStore, changePath: string): Promise<SchedulerContract> {
  const contract = await readRequiredJsonFile(latestSchedulerContractPath(memory, changePath), schedulerContractSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, contract, "SchedulerContract");
  return contract;
}

export async function readSchedulerContract(memory: SchedulerArtifactStore, changePath: string, schedulerContractId: string): Promise<SchedulerContract> {
  const contract = await readRequiredJsonFile(schedulerContractPath(memory, changePath, schedulerContractId), schedulerContractSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, contract, "SchedulerContract");
  return contract;
}

export function schedulerContractArtifactRefs(memory: SchedulerArtifactStore, changePath: string, schedulerContractId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerContractsDir(memory, changePath);
  return {
    artifact: schedulerArtifactRef(memory, join(dir, `${schedulerContractId}.json`)),
    markdownArtifact: schedulerArtifactRef(memory, join(dir, `${schedulerContractId}.md`)),
  };
}

export async function writeSchedulerDispatchDryRun(memory: SchedulerArtifactStore, changePath: string, dryRun: SchedulerDispatchDryRun): Promise<void> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerDispatchDryRun");
  const dir = schedulerDispatchDryRunsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${dryRun.id}.json`), dryRun);
  await writeFile(join(dir, `${dryRun.id}.md`), renderSchedulerDispatchDryRunMarkdown(dryRun), "utf8");
  await writeJsonFile(latestSchedulerDispatchDryRunPath(memory, changePath), dryRun);
  await writeFile(latestSchedulerDispatchDryRunMarkdownPath(memory, changePath), renderSchedulerDispatchDryRunMarkdown(dryRun), "utf8");
}

export async function readLatestSchedulerDispatchDryRun(memory: SchedulerArtifactStore, changePath: string): Promise<SchedulerDispatchDryRun> {
  const dryRun = await readRequiredJsonFile(latestSchedulerDispatchDryRunPath(memory, changePath), schedulerDispatchDryRunSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerDispatchDryRun");
  return dryRun;
}

export async function readSchedulerDispatchDryRun(memory: SchedulerArtifactStore, changePath: string, dryRunId: string): Promise<SchedulerDispatchDryRun> {
  const dryRun = await readRequiredJsonFile(schedulerDispatchDryRunPath(memory, changePath, dryRunId), schedulerDispatchDryRunSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerDispatchDryRun");
  return dryRun;
}

export function schedulerDispatchDryRunArtifactRefs(memory: SchedulerArtifactStore, changePath: string, dryRunId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerDispatchDryRunsDir(memory, changePath);
  return {
    artifact: schedulerArtifactRef(memory, join(dir, `${dryRunId}.json`)),
    markdownArtifact: schedulerArtifactRef(memory, join(dir, `${dryRunId}.md`)),
  };
}

export async function writeSchedulerWorkerSessionPlan(memory: SchedulerArtifactStore, changePath: string, plan: SchedulerWorkerSessionPlan): Promise<void> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, plan, "SchedulerWorkerSessionPlan");
  const dir = schedulerWorkerSessionPlansDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${plan.id}.json`), plan);
  await writeFile(join(dir, `${plan.id}.md`), renderSchedulerWorkerSessionPlanMarkdown(plan), "utf8");
  await writeJsonFile(latestSchedulerWorkerSessionPlanPath(memory, changePath), plan);
  await writeFile(latestSchedulerWorkerSessionPlanMarkdownPath(memory, changePath), renderSchedulerWorkerSessionPlanMarkdown(plan), "utf8");
}

export async function readLatestSchedulerWorkerSessionPlan(memory: SchedulerArtifactStore, changePath: string): Promise<SchedulerWorkerSessionPlan> {
  const plan = await readRequiredJsonFile(latestSchedulerWorkerSessionPlanPath(memory, changePath), schedulerWorkerSessionPlanSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, plan, "SchedulerWorkerSessionPlan");
  return plan;
}

export async function readSchedulerWorkerSessionPlan(memory: SchedulerArtifactStore, changePath: string, workerPlanId: string): Promise<SchedulerWorkerSessionPlan> {
  const plan = await readRequiredJsonFile(schedulerWorkerSessionPlanPath(memory, changePath, workerPlanId), schedulerWorkerSessionPlanSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, plan, "SchedulerWorkerSessionPlan");
  return plan;
}

export function schedulerWorkerSessionPlanArtifactRefs(memory: SchedulerArtifactStore, changePath: string, workerPlanId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerWorkerSessionPlansDir(memory, changePath);
  return {
    artifact: schedulerArtifactRef(memory, join(dir, `${workerPlanId}.json`)),
    markdownArtifact: schedulerArtifactRef(memory, join(dir, `${workerPlanId}.md`)),
  };
}

export async function writeSchedulerClaimReconcilePlan(memory: SchedulerArtifactStore, changePath: string, plan: SchedulerClaimReconcilePlan): Promise<void> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, plan, "SchedulerClaimReconcilePlan");
  const dir = schedulerClaimReconcilePlansDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${plan.id}.json`), plan);
  await writeFile(join(dir, `${plan.id}.md`), renderSchedulerClaimReconcilePlanMarkdown(plan), "utf8");
  await writeJsonFile(latestSchedulerClaimReconcilePlanPath(memory, changePath), plan);
  await writeFile(latestSchedulerClaimReconcilePlanMarkdownPath(memory, changePath), renderSchedulerClaimReconcilePlanMarkdown(plan), "utf8");
}

export async function readLatestSchedulerClaimReconcilePlan(memory: SchedulerArtifactStore, changePath: string): Promise<SchedulerClaimReconcilePlan> {
  const plan = await readRequiredJsonFile(latestSchedulerClaimReconcilePlanPath(memory, changePath), schedulerClaimReconcilePlanSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, plan, "SchedulerClaimReconcilePlan");
  return plan;
}

export async function readSchedulerClaimReconcilePlan(memory: SchedulerArtifactStore, changePath: string, claimReconcilePlanId: string): Promise<SchedulerClaimReconcilePlan> {
  const plan = await readRequiredJsonFile(schedulerClaimReconcilePlanPath(memory, changePath, claimReconcilePlanId), schedulerClaimReconcilePlanSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, plan, "SchedulerClaimReconcilePlan");
  return plan;
}

export function schedulerClaimReconcilePlanArtifactRefs(memory: SchedulerArtifactStore, changePath: string, claimReconcilePlanId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerClaimReconcilePlansDir(memory, changePath);
  return {
    artifact: schedulerArtifactRef(memory, join(dir, `${claimReconcilePlanId}.json`)),
    markdownArtifact: schedulerArtifactRef(memory, join(dir, `${claimReconcilePlanId}.md`)),
  };
}

export async function writeSchedulerLaunchPreflight(memory: SchedulerArtifactStore, changePath: string, preflight: SchedulerLaunchPreflight): Promise<void> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, preflight, "SchedulerLaunchPreflight");
  const dir = schedulerLaunchPreflightsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${preflight.id}.json`), preflight);
  await writeFile(join(dir, `${preflight.id}.md`), renderSchedulerLaunchPreflightMarkdown(preflight), "utf8");
  await writeJsonFile(latestSchedulerLaunchPreflightPath(memory, changePath), preflight);
  await writeFile(latestSchedulerLaunchPreflightMarkdownPath(memory, changePath), renderSchedulerLaunchPreflightMarkdown(preflight), "utf8");
}

export async function readLatestSchedulerLaunchPreflight(memory: SchedulerArtifactStore, changePath: string): Promise<SchedulerLaunchPreflight> {
  const preflight = await readRequiredJsonFile(latestSchedulerLaunchPreflightPath(memory, changePath), schedulerLaunchPreflightSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, preflight, "SchedulerLaunchPreflight");
  return preflight;
}

export async function readSchedulerLaunchPreflight(memory: SchedulerArtifactStore, changePath: string, preflightId: string): Promise<SchedulerLaunchPreflight> {
  const preflight = await readRequiredJsonFile(schedulerLaunchPreflightPath(memory, changePath, preflightId), schedulerLaunchPreflightSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, preflight, "SchedulerLaunchPreflight");
  return preflight;
}

export function schedulerLaunchPreflightArtifactRefs(memory: SchedulerArtifactStore, changePath: string, preflightId: string): { artifact: string; markdownArtifact: string } {
  const dir = schedulerLaunchPreflightsDir(memory, changePath);
  return {
    artifact: schedulerArtifactRef(memory, join(dir, `${preflightId}.json`)),
    markdownArtifact: schedulerArtifactRef(memory, join(dir, `${preflightId}.md`)),
  };
}

export async function writeSchedulerRun(memory: SchedulerArtifactStore, changePath: string, run: SchedulerRun): Promise<void> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, run, "SchedulerRun");
  const dir = schedulerRunsDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, `${run.id}.json`), run);
  await writeFile(join(dir, `${run.id}.md`), renderSchedulerRunMarkdown(run), "utf8");
  await writeJsonFile(latestSchedulerRunPath(memory, changePath), run);
  await writeFile(latestSchedulerRunMarkdownPath(memory, changePath), renderSchedulerRunMarkdown(run), "utf8");
}

export async function readLatestSchedulerRun(memory: SchedulerArtifactStore, changePath: string): Promise<SchedulerRun> {
  const run = await readRequiredJsonFile(latestSchedulerRunPath(memory, changePath), schedulerRunSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, run, "SchedulerRun");
  return run;
}

export async function readSchedulerRun(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): Promise<SchedulerRun> {
  const run = await readRequiredJsonFile(schedulerRunPath(memory, changePath, schedulerRunId), schedulerRunSchema);
  await assertSchedulerWorkflowArtifactScope(memory, changePath, run, "SchedulerRun");
  if (run.id !== schedulerRunId) throw new Error("SchedulerRun id mismatch.");
  return run;
}

export function schedulerRunArtifactRefs(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): { artifact: string; markdownArtifact: string; journalArtifact: string } {
  const dir = schedulerRunsDir(memory, changePath);
  return {
    artifact: schedulerArtifactRef(memory, join(dir, `${schedulerRunId}.json`)),
    markdownArtifact: schedulerArtifactRef(memory, join(dir, `${schedulerRunId}.md`)),
    journalArtifact: schedulerArtifactRef(memory, join(dir, `${schedulerRunId}.jsonl`)),
  };
}

export async function appendSchedulerRunJournalEvent(
  memory: SchedulerArtifactStore,
  changePath: string,
  run: SchedulerRun,
  type: SchedulerRunJournalEventType,
  input: Partial<SchedulerRunJournalEvent> = {},
): Promise<SchedulerRunJournalEvent> {
  await assertSchedulerWorkflowArtifactScope(memory, changePath, run, "SchedulerRun journal");
  const now = new Date().toISOString();
  const event: SchedulerRunJournalEvent = {
    version: "1.0",
    id: `scheduler-run-event-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${type}:${now}:${Math.random()}`).slice(0, 8)}`,
    schedulerRunId: run.id,
    changeId: run.changeId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    type,
    timestamp: now,
    status: input.status,
    summary: input.summary,
    artifactRefs: input.artifactRefs,
    payload: input.payload,
  };
  schedulerRunJournalEventSchema.parse(event);
  await mkdir(schedulerRunsDir(memory, changePath), { recursive: true });
  await appendFile(schedulerRunJournalPath(memory, changePath, run.id), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readSchedulerRunJournal(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): Promise<SchedulerRunJournalEvent[]> {
  const run = await readSchedulerRun(memory, changePath, schedulerRunId);
  const path = schedulerRunJournalPath(memory, changePath, run.id);
  if (!existsSync(path)) return [];
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const event = schedulerRunJournalEventSchema.parse(JSON.parse(line));
    if (event.changeId !== run.changeId || event.schedulerRunId !== run.id || event.schedulerLaunchPreflightId !== run.schedulerLaunchPreflightId) {
      throw new Error("SchedulerRun journal event scope mismatch.");
    }
    return event;
  });
}
