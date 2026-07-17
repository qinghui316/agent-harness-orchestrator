// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionInspectorPane } from "../../src/web/src/panels/workbench/DecisionPanels.js";
import type { ConfirmationQueue, ConfirmationQueueItem, DecisionAction, DecisionContext, DecisionInspector } from "../../src/web/src/types.js";

afterEach(cleanup);

describe("Decision inspector panel", () => {
  it("keeps apply confirmation explicit and submits the original action once", async () => {
    const action = decisionAction("apply", "应用并本地提交", "approval", true);
    const queue = confirmationQueue(confirmation("apply-item", "确认应用到项目", [action]));
    const onConfirmingChange = vi.fn();
    const onExecuteAction = vi.fn(async () => undefined);
    const view = renderPane(queue, { onConfirmingChange, onExecuteAction });

    fireEvent.click(screen.getByRole("button", { name: /应用并本地提交/ }));
    expect(onConfirmingChange).toHaveBeenCalledWith("apply");
    view.rerender(pane(queue, { confirming: "apply", onConfirmingChange, onExecuteAction }));
    fireEvent.click(screen.getByRole("button", { name: "确认" }));

    expect(onExecuteAction).toHaveBeenCalledTimes(1);
    expect(onExecuteAction).toHaveBeenCalledWith(action, expect.objectContaining({ id: "apply-item" }));
  });

  it("renders a blocked queue item as primary without inventing approval controls", () => {
    const evidence = decisionAction("evidence", "查看证据", "evidence", false);
    const blocked = {
      ...confirmation("blocked-item", "任务已暂停", [evidence]),
      status: "failed",
      summary: "验证失败，需要修改",
      riskSummary: "失败原因已经记录。",
    };
    renderPane(confirmationQueue(blocked));

    expect(screen.getByText("任务已暂停")).toBeTruthy();
    expect(screen.getByText("验证失败，需要修改")).toBeTruthy();
    expect(screen.getByRole("button", { name: /查看证据/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "确认" })).toBeNull();
    expect(screen.getByText("历史")).toBeTruthy();
  });
});

function renderPane(queue: ConfirmationQueue, overrides: Partial<PaneProps> = {}) {
  return render(pane(queue, overrides));
}

type PaneProps = {
  confirming: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
};

function pane(queue: ConfirmationQueue, overrides: Partial<PaneProps> = {}) {
  const inspector: DecisionInspector = { primary: null, related: [], history: [] };
  return <DecisionInspectorPane
    inspector={inspector}
    confirmationQueue={queue}
    confirming={overrides.confirming ?? null}
    busy={false}
    error={null}
    onConfirmingChange={overrides.onConfirmingChange ?? vi.fn()}
    onExecuteAction={overrides.onExecuteAction ?? vi.fn(async () => undefined)}
    onFeedback={vi.fn(async () => undefined)}
    onSelectContext={vi.fn()}
  />;
}

function confirmationQueue(primary: ConfirmationQueueItem): ConfirmationQueue {
  return { primary, current: [primary], otherDemands: [], maintenance: [], history: [] };
}

function confirmation(id: string, title: string, actions: DecisionAction[]): ConfirmationQueueItem {
  return {
    id,
    kind: "apply",
    conversationId: "conv-1",
    changeId: "change-1",
    summary: "Ready",
    whyNeedsConfirmation: title,
    confirmEffect: "Apply the accepted result.",
    riskSummary: "Local source will change.",
    evidenceRefs: ["validation.json"],
    actions,
    primary: true,
  };
}

function decisionAction(id: string, label: string, kind: DecisionAction["kind"], requiresConfirmation: boolean): DecisionAction {
  return { id, label, kind, enabled: true, requiresConfirmation };
}
