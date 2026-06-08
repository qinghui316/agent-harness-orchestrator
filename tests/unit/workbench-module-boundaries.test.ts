import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { appendTopicThreadEntry, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchWorkflowGraphPlanProjection } from "../../src/workbench/manager.js";
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
import { summarizeRunArtifacts } from "../../src/workbench/projections/artifact-preview.js";
import { findWorkbenchTopicPath } from "../../src/workbench/projections/typed-workflow.js";
import { buildDemandAgentRunGraph, emptyAgentRunGraph } from "../../src/workbench/projections/read-model/run-graph.js";
import { buildThreadStream, isConcreteChangeFile } from "../../src/workbench/projections/read-model/thread-stream.js";
import { runTaskQueueSequence } from "../../src/workflow-runtime/code-workflow.js";
import { startOrResumeWorkflowTaskQueue, validateWorkflowTaskQueueProposalStart } from "../../src/workflow-runtime/taskqueue.js";
import { fetchJson } from "../../src/web/src/api.js";
import { workflowActionLabel } from "../../src/web/src/action-labels.js";
import { userFacingText } from "../../src/web/src/formatters.js";
import { emptyParentAgentTranscript } from "../../src/web/src/liveTranscript.js";
import { MainConversationView, DecisionInspectorPane, WorkpadView } from "../../src/web/src/panels/WorkbenchPanels.js";
import { RunReplay } from "../../src/web/src/panels/workbench/RunReplayPanel.js";
import { ProjectConversationSidebar, appendProseBlock, threadItemFromTopicEntry } from "../../src/web/src/shell/WorkbenchShellParts.js";
import { workflowActionPayloadFromTaskAction } from "../../src/web/src/workflow-actions.js";

describe("Workbench module boundaries", () => {
  it("keeps legacy facades available while exposing split modules", () => {
    expect(typeof appendTopicThreadEntry).toBe("function");
    expect(typeof runWorkbenchWorkflowAction).toBe("function");
    expect(typeof getWorkbenchSnapshot).toBe("function");
    expect(typeof getWorkbenchWorkflowGraphPlanProjection).toBe("function");

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
    expect(typeof summarizeRunArtifacts).toBe("function");
    expect(typeof emptyAgentRunGraph).toBe("function");
    expect(typeof buildDemandAgentRunGraph).toBe("function");
    expect(typeof buildThreadStream).toBe("function");
    expect(typeof isConcreteChangeFile).toBe("function");
    expect(typeof startOrResumeWorkflowTaskQueue).toBe("function");
    expect(typeof validateWorkflowTaskQueueProposalStart).toBe("function");
    expect(typeof runTaskQueueSequence).toBe("function");
    expect(typeof fetchJson).toBe("function");
    expect(typeof MainConversationView).toBe("function");
    expect(typeof DecisionInspectorPane).toBe("function");
    expect(typeof WorkpadView).toBe("function");
    expect(typeof RunReplay).toBe("function");
    expect(typeof ProjectConversationSidebar).toBe("function");
    expect(typeof appendProseBlock).toBe("function");
    expect(typeof threadItemFromTopicEntry).toBe("function");
    expect(typeof workflowActionPayloadFromTaskAction).toBe("function");
    expect(emptyParentAgentTranscript().title).toBe("需求对话");
    expect(userFacingText("Task queue started")).toBe("本地顺序执行已开始");
    expect(workflowActionLabel("planning.workflowgraph.compile")).toBe("编译执行图");
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
        forbidden: [/from\s+["']\.\.\/workbench-server\.js["']/],
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
    ];
    const offenders = checks.flatMap((check) => listSourceFiles(check.roots)
      .flatMap((file) => check.forbidden.some((pattern) => pattern.test(readFileSync(file, "utf8"))) ? [file] : []));
    expect(offenders).toEqual([]);
  });

  it("keeps the read-model compatibility facade thin", () => {
    const facade = readFileSync("src/workbench/projections/read-model.ts", "utf8");
    expect(facade.trim()).toBe('export * from "./read-model/implementation.js";');
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

    const workpad = readFileSync("src/web/src/panels/workbench/WorkpadPanel.tsx", "utf8");
    expect(workpad).toContain("workflowActionPayloadFromTaskAction");
    expect(workpad).not.toMatch(/taskIds:\s*action\.taskIds/);

    const shell = readFileSync("src/web/src/shell/WorkbenchShellParts.tsx", "utf8");
    expect(shell).toContain("workflowActionPayloadFromScope(confirmingAction)");
    expect(shell).toContain("workflowActionPayloadFromScope(action)");
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
