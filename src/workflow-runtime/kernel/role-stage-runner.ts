import type {
  MainAgentOrchestrationDecision,
  MainAgentOrchestrationState,
} from "../../agent-task/orchestration-engine.js";
import type { CodeExecutionGateOptions } from "../../code/manager.js";
import {
  runLegacyCodeValidateAuditFacade,
  type CodeValidateAuditAttemptResult,
} from "../../main-agent-orchestration/index.js";
import type { ManagedProject } from "../../types/index.js";
import type { WorkbenchLiveSink } from "../../workbench/types.js";

/**
 * Compatibility facade for older workflow-runtime callers.
 *
 * Sequence ownership moved to `src/main-agent-orchestration/`. Keep this
 * export until task-run/rework call sites migrate to the new owner directly.
 */
export async function runCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  prompt?: string,
  live?: WorkbenchLiveSink,
  taskIds?: string[],
  taskRunId?: string,
  coderRoleId = "coder-agent",
  orchestrationState?: MainAgentOrchestrationState,
  coderDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  executionGate?: CodeExecutionGateOptions,
): Promise<CodeValidateAuditAttemptResult> {
  return runLegacyCodeValidateAuditFacade({
    project,
    changeId,
    prompt,
    live,
    taskIds,
    taskRunId,
    initialRole: coderRoleId,
    orchestrationState,
    initialDecision: coderDecision,
    executionGate,
  });
}
