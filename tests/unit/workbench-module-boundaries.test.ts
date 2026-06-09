import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { createProgram } from "../../src/cli/program.js";
import type { MaintenanceLedgerEntry, ManagedProject, RemoteLandingResult, RunMetadata, WorkflowRun } from "../../src/types/index.js";
import { appendTopicThreadEntry, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchWorkflowGraphPlanProjection } from "../../src/workbench/manager.js";
import { getCodeStatus, listCodeRuns, showCodeRun, startCodeRun } from "../../src/code/manager.js";
import { applyIntegrationCheck, discardIntegrationCheck, findIntegrationCheckCandidate, listIntegrationChecks, readIntegrationCheck, runIntegrationCheck } from "../../src/integration-check/manager.js";
import { collectReadyTargets } from "../../src/integration-check/candidates.js";
import { runAggregateValidation } from "../../src/integration-check/aggregate-validation.js";
import { runAggregateAudit } from "../../src/integration-check/aggregate-audit.js";
import { runIntegrationFixAttempt } from "../../src/integration-check/fix-attempts.js";
import { prepareIntegrationCheckout } from "../../src/integration-check/patch-workspace.js";
import { readTopicThreadLog } from "../../src/workbench/thread-log.js";
import { runWorkbenchWorkflowActionService } from "../../src/workbench/actions/service.js";
import { assertWorkflowActionScope } from "../../src/workbench/actions/boundary.js";
import { dispatchWorkbenchWorkflowAction } from "../../src/workbench/actions/dispatcher.js";
import { generatePlanningDraft } from "../../src/workbench/actions/handlers/planning.js";
import { runCodexChat } from "../../src/workbench/codex-chat/bridge.js";
import { runMainAgentToolOrchestration } from "../../src/workbench/demand-workers/orchestration.js";
import { recordWorkbenchDecision } from "../../src/workbench/decisions.js";
import { emitAssistantEvent } from "../../src/workbench/live-events.js";
import { buildDeterministicPlanningBundle } from "../../src/workbench/planning/builders.js";
import { createLiveSink, readWorkbenchActionEvents } from "../../src/server/workbench/live.js";
import { getWorkbenchProjection } from "../../src/server/workbench/projections.js";
import { matchProjectWorkbenchRoute } from "../../src/server/workbench/routes.js";
import { assertCurrentWorkflowAction } from "../../src/server/workbench/action-revalidation.js";
import { executeWorkbenchAction as executeWorkbenchServerAction } from "../../src/server/workbench/actions.js";
import { handleApi } from "../../src/server/workbench/api-router.js";
import { allowedActionIds } from "../../src/server/workbench/approval-actions.js";
import { handleDirectWorkbenchApi } from "../../src/server/workbench/direct-routes.js";
import { sendJson } from "../../src/server/workbench/http.js";
import { sendWorkbenchActionLive } from "../../src/server/workbench/live-actions.js";
import { buildNativeFolderDialogCommand } from "../../src/server/workbench/native-dialog.js";
import { handleProjectWorkbenchApi } from "../../src/server/workbench/project-routes.js";
import { serveStatic } from "../../src/server/workbench/static.js";
import { summarizeRunArtifacts } from "../../src/workbench/projections/artifact-preview.js";
import { findWorkbenchTopicPath } from "../../src/workbench/projections/typed-workflow.js";
import { buildConfirmationQueue, scopeConfirmationQueueItemActions } from "../../src/workbench/projections/read-model/confirmation-queue.js";
import { buildApprovalInbox } from "../../src/workbench/projections/read-model/approval-inbox.js";
import { buildMaintenanceSummary } from "../../src/workbench/projections/read-model/maintenance-summary.js";
import { listWorkbenchTopicsFromMemory } from "../../src/workbench/projections/read-model/topics.js";
import { workpadNextActionToConfirmationItems } from "../../src/workbench/projections/read-model/confirmation/typed-workflow.js";
import { buildDemandAgentRunGraph, emptyAgentRunGraph } from "../../src/workbench/projections/read-model/run-graph.js";
import { buildThreadStream, isConcreteChangeFile } from "../../src/workbench/projections/read-model/thread-stream.js";
import { buildDecisionInspector } from "../../src/workbench/projections/read-model/decision-inspector.js";
import { readLatestPlanningBundleProjection } from "../../src/workbench/projections/read-model/lazy-projections.js";
import { buildResultReview } from "../../src/workbench/projections/read-model/result-review.js";
import { buildTaskGraph, buildTaskQueueSummary, emptyTaskGraph } from "../../src/workbench/projections/read-model/task-graph.js";
import { buildDiagnosticWorkpad, buildWorkbenchWorkpad } from "../../src/workbench/projections/read-model/workpad.js";
import {
  assertKnownTaskIds,
  requireSingleTaskId,
  requireTaskRunId,
  runCodeValidateAuditSequence,
  runTaskQueueSequence,
  runTaskRunCodeValidateAuditSequence,
  sourceRefreshReworkPrompt,
} from "../../src/workflow-runtime/code-workflow.js";
import { shouldAutoReworkTaskRun } from "../../src/workflow-runtime/kernel/bounded-rework.js";
import { emitValidationAssistantEvents } from "../../src/workflow-runtime/kernel/live-events.js";
import { findTaskQueueStageResumeCandidate } from "../../src/workflow-runtime/kernel/stage-resume-runner.js";
import { executeStartedTaskRunWorkflow } from "../../src/workflow-runtime/kernel/task-run-sequence.js";
import { startOrResumeWorkflowTaskQueue, validateWorkflowTaskQueueProposalStart } from "../../src/workflow-runtime/taskqueue.js";
import { fetchJson } from "../../src/web/src/api.js";
import { workflowActionLabel } from "../../src/web/src/action-labels.js";
import { userFacingText } from "../../src/web/src/formatters.js";
import { emptyParentAgentTranscript } from "../../src/web/src/liveTranscript.js";
import { MainConversationView, DecisionInspectorPane, WorkpadView } from "../../src/web/src/panels/WorkbenchPanels.js";
import { RunReplay } from "../../src/web/src/panels/workbench/RunReplayPanel.js";
import {
  ProjectConversationSidebar,
  appendProseBlock,
  blockFromAssistantEvent,
  threadItemFromTopicEntry,
} from "../../src/web/src/shell/WorkbenchShellParts.js";
import { workflowActionPayloadFromTaskAction } from "../../src/web/src/workflow-actions.js";

describe("Workbench module boundaries", () => {
  it("keeps legacy facades available while exposing split modules", () => {
    expect(typeof appendTopicThreadEntry).toBe("function");
    expect(typeof runWorkbenchWorkflowAction).toBe("function");
    expect(typeof getWorkbenchSnapshot).toBe("function");
    expect(typeof getWorkbenchWorkflowGraphPlanProjection).toBe("function");
    expect(typeof createProgram).toBe("function");
    expect(typeof startCodeRun).toBe("function");
    expect(typeof getCodeStatus).toBe("function");
    expect(typeof listCodeRuns).toBe("function");
    expect(typeof showCodeRun).toBe("function");
    expect(typeof findIntegrationCheckCandidate).toBe("function");
    expect(typeof runIntegrationCheck).toBe("function");
    expect(typeof applyIntegrationCheck).toBe("function");
    expect(typeof discardIntegrationCheck).toBe("function");
    expect(typeof listIntegrationChecks).toBe("function");
    expect(typeof readIntegrationCheck).toBe("function");
    expect(typeof collectReadyTargets).toBe("function");
    expect(typeof runAggregateValidation).toBe("function");
    expect(typeof runAggregateAudit).toBe("function");
    expect(typeof runIntegrationFixAttempt).toBe("function");
    expect(typeof prepareIntegrationCheckout).toBe("function");

    expect(typeof readTopicThreadLog).toBe("function");
    expect(typeof runWorkbenchWorkflowActionService).toBe("function");
    expect(typeof assertWorkflowActionScope).toBe("function");
    expect(typeof dispatchWorkbenchWorkflowAction).toBe("function");
    expect(typeof generatePlanningDraft).toBe("function");
    expect(typeof runCodexChat).toBe("function");
    expect(typeof runMainAgentToolOrchestration).toBe("function");
    expect(typeof recordWorkbenchDecision).toBe("function");
    expect(typeof emitAssistantEvent).toBe("function");
    expect(typeof buildDeterministicPlanningBundle).toBe("function");
    expect(typeof createLiveSink).toBe("function");
    expect(typeof readWorkbenchActionEvents).toBe("function");
    expect(typeof getWorkbenchProjection).toBe("function");
    expect(typeof matchProjectWorkbenchRoute).toBe("function");
    expect(typeof assertCurrentWorkflowAction).toBe("function");
    expect(typeof executeWorkbenchServerAction).toBe("function");
    expect(typeof handleApi).toBe("function");
    expect(allowedActionIds.has("change.close")).toBe(true);
    expect(typeof handleDirectWorkbenchApi).toBe("function");
    expect(typeof sendJson).toBe("function");
    expect(typeof sendWorkbenchActionLive).toBe("function");
    expect(typeof buildNativeFolderDialogCommand).toBe("function");
    expect(typeof handleProjectWorkbenchApi).toBe("function");
    expect(typeof serveStatic).toBe("function");
    expect(typeof summarizeRunArtifacts).toBe("function");
    expect(typeof buildConfirmationQueue).toBe("function");
    expect(typeof scopeConfirmationQueueItemActions).toBe("function");
    expect(typeof buildApprovalInbox).toBe("function");
    expect(typeof buildMaintenanceSummary).toBe("function");
    expect(typeof listWorkbenchTopicsFromMemory).toBe("function");
    expect(typeof workpadNextActionToConfirmationItems).toBe("function");
    expect(typeof emptyAgentRunGraph).toBe("function");
    expect(typeof buildDemandAgentRunGraph).toBe("function");
    expect(typeof buildThreadStream).toBe("function");
    expect(typeof isConcreteChangeFile).toBe("function");
    expect(typeof buildDecisionInspector).toBe("function");
    expect(typeof readLatestPlanningBundleProjection).toBe("function");
    expect(typeof buildResultReview).toBe("function");
    expect(typeof emptyTaskGraph).toBe("function");
    expect(typeof buildTaskGraph).toBe("function");
    expect(typeof buildTaskQueueSummary).toBe("function");
    expect(typeof buildDiagnosticWorkpad).toBe("function");
    expect(typeof buildWorkbenchWorkpad).toBe("function");
    expect(typeof startOrResumeWorkflowTaskQueue).toBe("function");
    expect(typeof validateWorkflowTaskQueueProposalStart).toBe("function");
    expect(typeof runTaskQueueSequence).toBe("function");
    expect(typeof runTaskRunCodeValidateAuditSequence).toBe("function");
    expect(typeof runCodeValidateAuditSequence).toBe("function");
    expect(typeof sourceRefreshReworkPrompt).toBe("function");
    expect(typeof requireSingleTaskId).toBe("function");
    expect(typeof requireTaskRunId).toBe("function");
    expect(typeof assertKnownTaskIds).toBe("function");
    expect(typeof shouldAutoReworkTaskRun).toBe("function");
    expect(typeof emitValidationAssistantEvents).toBe("function");
    expect(typeof findTaskQueueStageResumeCandidate).toBe("function");
    expect(typeof executeStartedTaskRunWorkflow).toBe("function");
    expect(typeof fetchJson).toBe("function");
    expect(typeof MainConversationView).toBe("function");
    expect(typeof DecisionInspectorPane).toBe("function");
    expect(typeof WorkpadView).toBe("function");
    expect(typeof RunReplay).toBe("function");
    expect(typeof ProjectConversationSidebar).toBe("function");
    expect(typeof appendProseBlock).toBe("function");
    expect(typeof blockFromAssistantEvent).toBe("function");
    expect(typeof threadItemFromTopicEntry).toBe("function");
    expect(typeof workflowActionPayloadFromTaskAction).toBe("function");
    expect(emptyParentAgentTranscript().title).toBe("需求对话");
    expect(userFacingText("Task queue started")).toBe("本地顺序执行已开始");
    expect(workflowActionLabel("planning.workflowgraph.compile")).toBe("编译执行图");
  });

  it("keeps CLI command modules behind the createProgram facade", () => {
    const program = createProgram();
    expect(program.name()).toBe("aho");

    expect(findCommand(program, ["project", "add"]).description()).toBe("");
    expect(findCommand(program, ["harness", "init"]).opts()).toMatchObject({ memory: "repo-local" });
    expect(findCommand(program, ["workbench", "serve"]).opts()).toMatchObject({ host: "127.0.0.1", port: 4317 });
    expect(findCommand(program, ["change", "spec", "propose"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--prompt", "--prompt-file", "--json"]));
    expect(findCommand(program, ["worktree", "apply"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--commit", "--message", "--json"]));
    expect(findCommand(program, ["code", "run"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--prompt", "--prompt-file", "--task", "--model", "--profile", "--json"]));
    expect(findCommand(program, ["spec-test", "generate"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--ac", "--missing", "--prompt", "--json"]));
  });

  it("keeps legacy type barrel imports compile-compatible", () => {
    const compileOnly: {
      project?: ManagedProject;
      run?: RunMetadata;
      workflow?: WorkflowRun;
      remote?: RemoteLandingResult;
      maintenance?: MaintenanceLedgerEntry;
    } = {};
    expect(Object.keys(compileOnly)).toEqual([]);
  });

  it("resolves typed workflow topic paths outside the manager facade", () => {
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "change-1")).toBe("harness/changes/active/phase-x");
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "phase-x")).toBe("harness/changes/active/phase-x");
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "missing")).toBeNull();
  });

  it("keeps split modules from depending on large compatibility facades", () => {
    const checks = [
      {
        roots: ["src/workbench/projections", "src/workbench/actions"],
        forbidden: [/from\s+["']\.\.\/manager\.js["']/, /from\s+["']\.\.\/chat\.js["']/],
      },
      {
        roots: ["src/workbench/projections/read-model"],
        forbidden: [
          /from\s+["']\.\.\/\.\.\/manager\.js["']/,
          /from\s+["']\.\.\/\.\.\/chat\.js["']/,
          /from\s+["']\.\.\/\.\.\/\.\.\/server\//,
          /from\s+["']\.\.\/\.\.\/\.\.\/web\//,
        ],
      },
      {
        roots: ["src/workbench/read-model-types.ts", "src/workbench/artifact-types.ts"],
        forbidden: [
          /from\s+["']\.\/projections\//,
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\/chat\.js["']/,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
        ],
      },
      {
        roots: ["src/server/workbench"],
        forbidden: [
          /from\s+["']\.\.\/workbench-server\.js["']/,
          /from\s+["']\.\.\/\.\.\/web\//,
          /from\s+["']\.\.\/\.\.\/cli\//,
          /from\s+["']\.\.\/\.\.\/workbench\/projections\/read-model\/implementation\.js["']/,
        ],
      },
      {
        roots: ["src/web/src/panels"],
        forbidden: [/from\s+["']\.\.\/App\.js["']/],
      },
      {
        roots: ["src/web/src/shell", "src/web/src/panels/workbench"],
        forbidden: [/from\s+["']\.\.\/App\.js["']/, /from\s+["']\.\.\/\.\.\/App\.js["']/],
      },
      {
        roots: ["src/workflow-runtime"],
        forbidden: [
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/workbench\/chat\.js["']/,
          /from\s+["']\.\.\/workbench\/manager\.js["']/,
        ],
      },
      {
        roots: [
          "src/workbench/codex-chat",
          "src/workbench/demand-workers",
          "src/workbench/planning",
          "src/workbench/topic-resolver.ts",
          "src/workbench/topic-runtime.ts",
          "src/workbench/topic-thread.ts",
          "src/workbench/decisions.ts",
          "src/workbench/live-events.ts",
        ],
        forbidden: [
          /from\s+["']\.\.?\/chat\.js["']/,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\/projections\//,
        ],
      },
      {
        roots: ["src/cli/commands"],
        forbidden: [/from\s+["']\.\.\/program\.js["']/],
      },
      {
        roots: ["src/agent-task"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
          /from\s+["']\.\.\/workbench\//,
        ],
      },
      {
        roots: ["src/change/proposals"],
        forbidden: [
          /from\s+["']\.\.\/proposals\.js["']/,
          /from\s+["']\.\.\/\.\.\/cli\//,
          /from\s+["']\.\.\/\.\.\/server\//,
          /from\s+["']\.\.\/\.\.\/web\//,
          /from\s+["']\.\.\/\.\.\/workbench\//,
        ],
      },
      {
        roots: ["src/code"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/cli\//,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
        ],
      },
      {
        roots: ["src/integration-check"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: [
          "src/types/change-ecl.ts",
          "src/types/maintenance.ts",
          "src/types/pr-remote-landing.ts",
          "src/types/project-memory.ts",
          "src/types/proposals.ts",
          "src/types/run-worktree.ts",
          "src/types/spec-test.ts",
          "src/types/task-agent-workflow.ts",
        ],
        forbidden: [
          /from\s+["']\.\.\/cli\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/workflow-runtime\//,
          /from\s+["']\.\.\/code\//,
          /from\s+["']\.\.\/agent\//,
        ],
      },
    ];
    const offenders = checks.flatMap((check) => listSourceFiles(check.roots)
      .flatMap((file) => check.forbidden.some((pattern) => pattern.test(readFileSync(file, "utf8"))) ? [file] : []));
    expect(offenders).toEqual([]);
  });

  it("keeps change proposals as a compatibility facade", () => {
    const facade = readFileSync("src/change/proposals.ts", "utf8");
    expect(facade).toContain('from "./proposals/service.js"');
    expect(facade).toContain('from "./proposals/acceptance.js"');
    expect(facade).toContain('from "./proposals/parser-renderer.js"');
    expect(facade).not.toMatch(/function startSpecProposalRun/);
    expect(facade).not.toMatch(/function acceptPlanProposal/);
    expect(facade).not.toMatch(/detectCodexCapabilities/);
  });

  it("keeps code manager as a compatibility facade with scoped app-server role metadata", () => {
    const facade = readFileSync("src/code/manager.ts", "utf8");
    expect(facade).toContain('from "./execution-gate.js"');
    expect(facade).toContain('from "./codex-app-server-runner.js"');
    expect(facade).toContain('from "./codex-exec-runner.js"');
    expect(facade).toContain('from "./status.js"');
    expect(facade).not.toMatch(/runCodexAppServerTurn/);
    expect(facade).not.toMatch(/executeProcessStreaming/);
    expect(facade).not.toMatch(/createCodexJsonlStreamParser/);

    const appServerRunner = readFileSync("src/code/codex-app-server-runner.ts", "utf8");
    expect(appServerRunner).toContain("roleId: input.roleId");
    expect(appServerRunner).not.toContain('roleId: "coder-agent"');
  });

  it("keeps integration-check manager as a compatibility facade", () => {
    const facade = readFileSync("src/integration-check/manager.ts", "utf8");
    expect(facade).toContain('from "./service.js"');
    expect(facade).toContain('from "./apply-discard.js"');
    expect(facade).toContain('from "./repository.js"');
    expect(facade).toContain('from "./candidates.js"');
    expect(facade).not.toMatch(/async function runIntegrationCheck/);
    expect(facade).not.toMatch(/async function applyIntegrationCheck/);
    expect(facade).not.toMatch(/async function collectReadyTargets/);
    expect(facade).not.toMatch(/async function runAggregateValidation/);
  });

  it("keeps type index as a compatibility re-export barrel", () => {
    const barrel = readFileSync("src/types/index.ts", "utf8");
    expect(barrel).toContain('export * from "./project-memory.js";');
    expect(barrel).toContain('export * from "./change-ecl.js";');
    expect(barrel).toContain('export * from "./spec-test.js";');
    expect(barrel).toContain('export * from "./proposals.js";');
    expect(barrel).toContain('export * from "./run-worktree.js";');
    expect(barrel).toContain('export * from "./task-agent-workflow.js";');
    expect(barrel).toContain('export * from "./pr-remote-landing.js";');
    expect(barrel).toContain('export * from "./maintenance.js";');
    expect(barrel).not.toMatch(/export interface ManagedProject/);
    expect(barrel).not.toMatch(/export interface RunMetadata/);
    expect(barrel).not.toMatch(/export interface WorkflowRun/);
  });

  it("keeps the read-model compatibility facade thin", () => {
    const facade = readFileSync("src/workbench/projections/read-model.ts", "utf8");
    expect(facade.trim()).toBe('export * from "./read-model/implementation.js";');

    const implementation = readFileSync("src/workbench/projections/read-model/implementation.ts", "utf8");
    expect(implementation).toContain('from "./approval-inbox.js"');
    expect(implementation).toContain('from "./maintenance-summary.js"');
    expect(implementation).toContain('from "./topics.js"');
    expect(implementation).toContain('from "./decision-inspector.js"');
    expect(implementation).toContain('from "./workpad.js"');
    const workpad = readFileSync("src/workbench/projections/read-model/workpad.ts", "utf8");
    expect(workpad).toContain('from "./task-graph.js"');
    expect(workpad).toContain('from "./result-review.js"');
    expect(implementation).not.toMatch(/function buildApprovalInbox/);
    expect(implementation).not.toMatch(/function listWorkbenchTopicsFromMemory/);
    expect(implementation).not.toMatch(/function buildMaintenanceSummary/);
    expect(implementation).not.toMatch(/function buildDecisionInspector/);
    expect(implementation).not.toMatch(/function buildTaskGraph/);
    expect(implementation).not.toMatch(/function buildTaskQueueSummary/);
    expect(implementation).not.toMatch(/function buildResultReview/);
    expect(implementation).not.toMatch(/function buildWorkbenchWorkpad/);
    expect(implementation).not.toMatch(/function getWorkbenchDecompositionPlanProjection/);
  });

  it("keeps confirmation queue planning copy non-executing and preserves explicit action scope", () => {
    const typedWorkflow = readFileSync("src/workbench/projections/read-model/confirmation/typed-workflow.ts", "utf8");
    expect(typedWorkflow).toContain("不会启动 coder、validator、auditor、TaskQueue、TaskRun 或 AgentTask");
    expect(typedWorkflow).not.toContain("需要你确认当前方案进入执行");
    expect(typedWorkflow).not.toContain("确认后，主 agent 会通过受控委派启动后续角色执行");

    const item = {
      id: "confirm:scope",
      kind: "planning-confirm",
      changeId: "change-from-item",
      worktreeId: "worktree-from-item",
      applyCheckId: "apply-from-item",
      landingPackageId: "landing-from-item",
      summary: "summary",
      whyNeedsConfirmation: "why",
      confirmEffect: "effect",
      riskSummary: "risk",
      evidenceRefs: [],
      primary: true,
      status: "pending",
      actions: [{
        id: "action:scope",
        label: "Action",
        kind: "workflow-action",
        actionType: "planning.taskqueue.confirm-start",
        changeId: "change-explicit",
        taskQueueProposalId: "proposal-1",
        workflowGraphPlanId: "graph-1",
        readinessManifestId: "readiness-1",
        decompositionPlanId: "decomposition-1",
        workflowRunId: "workflow-1",
        queueRunId: "queue-1",
        taskRunId: "task-run-1",
        taskIds: ["task-1"],
        enabled: true,
        requiresConfirmation: true,
      }],
    } as const;

    const scoped = scopeConfirmationQueueItemActions(item);
    expect(scoped.actions[0]?.changeId).toBe("change-explicit");
    expect(scoped.actions[0]?.worktreeId).toBe("worktree-from-item");
    expect(scoped.actions[0]?.landingPackageId).toBe("landing-from-item");
    expect(scoped.actions[0]?.taskQueueProposalId).toBe("proposal-1");
    expect(scoped.actions[0]?.workflowGraphPlanId).toBe("graph-1");
    expect(scoped.actions[0]?.readinessManifestId).toBe("readiness-1");
    expect(scoped.actions[0]?.decompositionPlanId).toBe("decomposition-1");
    expect(scoped.actions[0]?.workflowRunId).toBe("workflow-1");
    expect(scoped.actions[0]?.queueRunId).toBe("queue-1");
    expect(scoped.actions[0]?.taskRunId).toBe("task-run-1");
    expect(scoped.actions[0]?.taskIds).toEqual(["task-1"]);
  });

  it("keeps frontend surface facades and scoped payload helpers centralized", () => {
    const app = readFileSync("src/web/src/App.tsx", "utf8");
    expect(app).not.toMatch(/function ProjectConversationSidebar/);
    expect(app).not.toMatch(/function TopicComposer/);
    expect(app).not.toMatch(/function AssistantTurnBlocks/);

    const facade = readFileSync("src/web/src/panels/WorkbenchPanels.tsx", "utf8");
    expect(facade).toContain('export { MainConversationView, BottomStatusBar } from "./workbench/ConversationPanel.js";');
    expect(facade).toContain('export { DecisionInspectorPane } from "./workbench/DecisionPanels.js";');
    expect(facade).toContain('export { WorkpadView } from "./workbench/WorkpadPanel.js";');

    const shell = readFileSync("src/web/src/shell/WorkbenchShellParts.tsx", "utf8");
    expect(shell).toContain('from "./assistant-blocks.js"');
    expect(shell).toContain('from "./assistant-rendering.js"');
    expect(shell).toContain('from "./sidebar.js"');
    expect(shell).not.toMatch(/function ProjectConversationSidebar/);
    expect(shell).not.toMatch(/function TopicComposer/);
    expect(shell).not.toMatch(/function AssistantTurnBlocks/);

    const assistantBlocks = readFileSync("src/web/src/shell/assistant-blocks.ts", "utf8");
    expect(assistantBlocks).toContain("function isMainThreadAssistantEvent");
    expect(assistantBlocks).toContain("function hasInternalRunMetadata");
    expect(assistantBlocks).toContain("function dedupeBlocks");

    const assistantRendering = readFileSync("src/web/src/shell/assistant-rendering.tsx", "utf8");
    expect(assistantRendering).toContain("workflowActionPayloadFromScope(confirmingAction)");
    expect(assistantRendering).toContain("workflowActionPayloadFromScope(action)");

    const workpad = readFileSync("src/web/src/panels/workbench/WorkpadPanel.tsx", "utf8");
    expect(workpad).toContain('from "./workpad/WorkpadDetails.js"');
    expect(workpad).toContain('from "./workpad/WorkpadActionButton.js"');
    expect(workpad).not.toMatch(/function PlanningNarrativeCard/);
    expect(workpad).not.toMatch(/function TaskGraphCard/);
    expect(workpad).not.toMatch(/function WorkpadActionButton/);

    const taskGraphCards = readFileSync("src/web/src/panels/workbench/workpad/TaskGraphCards.tsx", "utf8");
    expect(taskGraphCards).toContain("workflowActionPayloadFromTaskAction");
    expect(taskGraphCards).not.toMatch(/taskIds:\s*action\.taskIds/);

    const workpadActionButton = readFileSync("src/web/src/panels/workbench/workpad/WorkpadActionButton.tsx", "utf8");
    expect(workpadActionButton).toContain("workflowActionPayloadFromScope(action)");
  });

  it("keeps workflow runtime code-workflow as a compatibility facade", () => {
    const facade = readFileSync("src/workflow-runtime/code-workflow.ts", "utf8");
    expect(facade).toContain('export { sourceRefreshReworkPrompt } from "./kernel/bounded-rework.js";');
    expect(facade).toContain('export { runCodeValidateAuditSequence } from "./kernel/role-stage-runner.js";');
    expect(facade).toContain('export { runTaskRunCodeValidateAuditSequence } from "./kernel/task-run-sequence.js";');
    expect(facade).toContain('export { runTaskQueueSequence } from "./kernel/task-queue-runner.js";');
    expect(facade).not.toMatch(/startCodeRun\(/);
    expect(facade).not.toMatch(/startValidationRun\(/);
    expect(facade).not.toMatch(/startAuditRun\(/);
  });

  it("keeps workbench-server as a compatibility facade", () => {
    const facade = readFileSync("src/server/workbench-server.ts", "utf8");
    expect(facade).toContain('export { executeWorkbenchAction } from "./workbench/actions.js";');
    expect(facade).toContain('export { buildNativeFolderDialogCommand, openNativeFolderDialog } from "./workbench/native-dialog.js";');
    expect(facade).toContain("startWorkbenchServer");
    expect(facade).not.toMatch(/function handleProjectWorkbenchApi/);
    expect(facade).not.toMatch(/function runAllowlistedAction/);
    expect(facade).not.toMatch(/function assertCurrentWorkflowAction/);
    expect(facade).not.toMatch(/function sendWorkbenchActionLive/);
    expect(facade).not.toMatch(/event: snapshot/);
  });
});

function listSourceFiles(roots: string[]): string[] {
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  return files.filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

function collect(path: string, files: string[]): void {
  const stats = statSync(path);
  if (stats.isFile()) {
    files.push(path);
    return;
  }
  for (const entry of readdirSync(path)) collect(join(path, entry), files);
}

function findCommand(program: Command, path: string[]): Command {
  let current = program;
  for (const name of path) {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) throw new Error(`Missing command ${path.join(" ")}`);
    current = next;
  }
  return current;
}
