import { useCallback, useRef } from "react";
import { consumeWorkbenchLiveStream, postJson } from "../api.js";
import type { ConversationInteractionDraft } from "../panels/workbench/ConversationInteractionDock.js";
import type {
  ConversationInteractionSettlement,
  DecisionAction,
  DecisionContext,
  Snapshot,
  WorkbenchLiveEvent,
} from "../types.js";
import { workflowActionPayloadFromScope } from "../workflow-actions.js";
import type { WorkbenchOperationToken } from "./useGlobalOperationGate.js";

export interface ConversationActionOperationGate {
  begin: (key: string) => WorkbenchOperationToken;
  release: (token: WorkbenchOperationToken) => void;
}

export interface ConversationActionSession {
  projectId: string | null;
  conversationId: string | null;
  selectedTopicId: string | null;
  snapshot: Snapshot;
  composerText: string;
}

export interface ConversationActionPorts {
  operationGate: ConversationActionOperationGate;
  routeProjectionEvent: (projectId: string, event: WorkbenchLiveEvent) => void;
  refreshSession: (projectId: string, conversationId: string | null) => Promise<Snapshot | null | void>;
  calibrateTimeline: (input: {
    projectId: string;
    conversationId: string;
    agentSurfaceId: "main-agent";
  }) => Promise<void>;
  postJson?: <T>(url: string, body: unknown) => Promise<T>;
  consumeLiveStream?: (
    url: string,
    body: unknown,
    onEvent: (event: WorkbenchLiveEvent) => void,
  ) => Promise<void>;
  applySnapshot: (snapshot: Snapshot) => void;
  cacheProjectSnapshot: (projectId: string, snapshot: Snapshot) => void;
  setComposerText: (value: string) => void;
  setError: (message: string | null) => void;
  clearConfirmation: () => void;
  chooseRun: (runId: string) => Promise<void>;
  openOrchestration: () => void;
  requestReanalysisMessage?: () => string | null;
}

export interface UseConversationActionControllerOptions {
  session: ConversationActionSession;
  ports: ConversationActionPorts;
}

export interface ConversationActionController {
  executeDecisionAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  requestDecisionFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
  runWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  settleInteraction: (interactionId: string, settlement: ConversationInteractionSettlement) => Promise<void>;
  getInteractionDraft: (interactionId: string) => ConversationInteractionDraft | undefined;
  setInteractionDraft: (interactionId: string, draft: ConversationInteractionDraft) => void;
  clearInteractionDrafts: (scope?: { projectId?: string; conversationId?: string }) => void;
}

export function useConversationActionController({
  session,
  ports,
}: UseConversationActionControllerOptions): ConversationActionController {
  const sessionRef = useRef(session);
  const portsRef = useRef(ports);
  const interactionDraftsRef = useRef(new Map<string, ConversationInteractionDraft>());
  sessionRef.current = session;
  portsRef.current = ports;
  const isCurrentScope = (projectId: string, conversationId: string | null): boolean => (
    sessionRef.current.projectId === projectId && sessionRef.current.conversationId === conversationId
  );

  const runWorkflowAction = useCallback(async (
    actionType: string,
    options: Record<string, unknown> = {},
  ): Promise<void> => {
    const current = sessionRef.current;
    const actionPorts = portsRef.current;
    const request = actionPorts.postJson ?? postJson;
    const consume = actionPorts.consumeLiveStream ?? consumeWorkbenchLiveStream;
    const { preserveSelectedTopic, ...actionOptions } = options;
    const shouldPreserveSelectedTopic = preserveSelectedTopic === true;
    if (!current.projectId || !current.conversationId) return;

    const projectId = current.projectId;
    const conversationId = current.conversationId;
    const topicBeforeAction = conversationId ?? current.selectedTopicId;
    const snapshotBeforeAction = current.snapshot;
    const operationToken = actionPorts.operationGate.begin(actionType);
    actionPorts.setError(null);
    try {
      if (actionType === "intake.scan") {
        const result = await request<{ snapshot: Snapshot }>(
          `/api/projects/${encodeURIComponent(projectId)}/workbench/intake/scan`,
          {
            changeId: conversationId,
            prompt: current.composerText.trim() || snapshotBeforeAction.center.selectedTopic?.title || "",
          },
        );
        if (isCurrentScope(projectId, conversationId)) {
          actionPorts.applySnapshot(result.snapshot);
          if (current.composerText.trim()) actionPorts.setComposerText("");
        }
        return;
      }

      if (actionType === "intake.reanalyze") {
        const requested = actionPorts.requestReanalysisMessage
          ? actionPorts.requestReanalysisMessage()
          : typeof window === "undefined" ? null : window.prompt("补充需求或回答需要确认的问题");
        const message = (current.composerText.trim() || requested || "").trim();
        if (!message) return;
        const result = await request<{ snapshot: Snapshot }>(
          `/api/projects/${encodeURIComponent(projectId)}/workbench/intake/reanalyze`,
          { changeId: conversationId, message },
        );
        if (isCurrentScope(projectId, conversationId)) {
          actionPorts.applySnapshot(result.snapshot);
          actionPorts.setComposerText("");
        }
        return;
      }

      await consume(
        `/api/projects/${encodeURIComponent(projectId)}/workbench/actions/live`,
        {
          actionType,
          changeId: conversationId,
          confirm: true,
          prompt: current.composerText.trim() || undefined,
          ...actionOptions,
        },
        (event) => {
          if (isCurrentScope(projectId, conversationId)) actionPorts.routeProjectionEvent(projectId, event);
        },
      );

      if (shouldPreserveSelectedTopic && topicBeforeAction && isCurrentScope(projectId, conversationId)) {
        const refreshed = await actionPorts.refreshSession(projectId, topicBeforeAction);
        if (refreshed && !refreshed.center.selectedTopic && snapshotBeforeAction.center.selectedTopic?.id === topicBeforeAction) {
          const restored = preserveSelectedWorkbenchTopic(refreshed, snapshotBeforeAction);
          actionPorts.applySnapshot(restored);
          actionPorts.cacheProjectSnapshot(projectId, restored);
        }
      }
      if (current.composerText.trim() && isCurrentScope(projectId, conversationId)) actionPorts.setComposerText("");
    } finally {
      try {
        if (isCurrentScope(projectId, conversationId)) {
          await actionPorts.calibrateTimeline({ projectId, conversationId, agentSurfaceId: "main-agent" });
        }
      } finally {
        actionPorts.operationGate.release(operationToken);
      }
    }
  }, []);

  const executeDecisionAction = useCallback(async (
    action: DecisionAction,
    context: DecisionContext,
  ): Promise<void> => {
    const current = sessionRef.current;
    const actionPorts = portsRef.current;
    if (!current.projectId || !action.enabled) return;

    if (action.kind === "workflow-action" && action.actionType) {
      await runWorkflowAction(action.actionType, workflowActionPayloadFromScope(action, {
        changeId: action.changeId ?? context.changeId,
        worktreeId: action.worktreeId ?? context.targetId,
      }));
      return;
    }

    if (action.kind === "evidence" && context.runId) {
      await actionPorts.chooseRun(context.runId);
      actionPorts.openOrchestration();
      return;
    }

    if (action.kind !== "approval" && action.kind !== "abandon") return;
    if (action.kind === "approval" && !action.action) return;

    const projectId = current.projectId;
    const operationToken = actionPorts.operationGate.begin(`decision.${action.id}`);
    try {
      const body = action.kind === "approval"
        ? action.options
          ? { action: action.action, confirm: true, options: action.options }
          : { action: action.action, confirm: true }
        : {
            abandon: { changeId: context.changeId, reason: "用户选择放弃这个需求。" },
            confirm: true,
            feedbackContext: {
              contextId: context.id,
              changeId: context.changeId,
              targetId: context.targetId,
              runId: context.runId,
            },
          };
      await (actionPorts.postJson ?? postJson)(`/api/projects/${encodeURIComponent(projectId)}/workbench/actions`, body);
      actionPorts.clearConfirmation();
      if (isCurrentScope(projectId, current.conversationId)) {
        await actionPorts.refreshSession(projectId, current.conversationId);
      }
    } finally {
      actionPorts.operationGate.release(operationToken);
    }
  }, [runWorkflowAction]);

  const requestDecisionFeedback = useCallback(async (
    context: DecisionContext,
    action: DecisionAction,
    feedback: string,
  ): Promise<void> => {
    const current = sessionRef.current;
    const trimmedFeedback = feedback.trim();
    if (!current.projectId || !trimmedFeedback) return;
    if (action.actionType) {
      await runWorkflowAction(action.actionType, {
        ...workflowActionPayloadFromScope(action, {
          changeId: action.changeId ?? context.changeId,
          worktreeId: action.worktreeId ?? context.targetId,
        }),
        feedback: trimmedFeedback,
      });
      return;
    }

    const projectId = current.projectId;
    const actionPorts = portsRef.current;
    const operationToken = actionPorts.operationGate.begin(`decision.feedback.${action.id}`);
    try {
      await (actionPorts.postJson ?? postJson)(`/api/projects/${encodeURIComponent(projectId)}/workbench/actions`, {
        action: action.action,
        feedback: trimmedFeedback,
        feedbackContext: {
          contextId: context.id,
          actionId: action.id,
          actionKind: action.kind,
          actionType: action.actionType,
          approvalActionId: action.action?.actionId,
          approvalId: action.approvalId,
          changeId: context.changeId,
          targetId: context.targetId,
          runId: context.runId,
          worktreeId: action.worktreeId ?? context.targetId,
          applyCheckId: action.applyCheckId,
          landingPackageId: action.landingPackageId,
          artifact: action.artifact ?? context.artifact,
        },
      });
      if (isCurrentScope(projectId, current.conversationId)) {
        await actionPorts.refreshSession(projectId, current.conversationId);
      }
    } finally {
      actionPorts.operationGate.release(operationToken);
    }
  }, [runWorkflowAction]);

  const settleInteraction = useCallback(async (
    interactionId: string,
    settlement: ConversationInteractionSettlement,
  ): Promise<void> => {
    const current = sessionRef.current;
    const actionPorts = portsRef.current;
    if (!current.projectId || !current.conversationId) return;
    const projectId = current.projectId;
    const conversationId = current.conversationId;
    const draftKey = interactionDraftKey(projectId, conversationId, interactionId);
    const operationToken = actionPorts.operationGate.begin(`interaction.${settlement.action}`);
    actionPorts.setError(null);
    let failed = false;
    try {
      await (actionPorts.consumeLiveStream ?? consumeWorkbenchLiveStream)(
        `/api/projects/${encodeURIComponent(projectId)}/workbench/conversations/${encodeURIComponent(conversationId)}/interactions/${encodeURIComponent(interactionId)}/settle`,
        settlement,
        (event) => {
          if (event.event === "error") failed = true;
          if (event.event === "snapshot") {
            const interaction = event.data.center.conversationInteractions?.items.find(
              (item) => item.interactionId === interactionId,
            );
            if (interaction?.status === "submitting") interactionDraftsRef.current.delete(draftKey);
          }
          if (isCurrentScope(projectId, conversationId)) actionPorts.routeProjectionEvent(projectId, event);
        },
      );
      if (!failed) interactionDraftsRef.current.delete(draftKey);
    } finally {
      try {
        if (isCurrentScope(projectId, conversationId)) {
          await actionPorts.calibrateTimeline({ projectId, conversationId, agentSurfaceId: "main-agent" });
        }
      } finally {
        actionPorts.operationGate.release(operationToken);
      }
    }
  }, []);

  const getInteractionDraft = useCallback((interactionId: string): ConversationInteractionDraft | undefined => {
    const current = sessionRef.current;
    if (!current.projectId || !current.conversationId) return undefined;
    return interactionDraftsRef.current.get(interactionDraftKey(current.projectId, current.conversationId, interactionId));
  }, []);

  const setInteractionDraft = useCallback((interactionId: string, draft: ConversationInteractionDraft): void => {
    const current = sessionRef.current;
    if (!current.projectId || !current.conversationId) return;
    interactionDraftsRef.current.set(interactionDraftKey(current.projectId, current.conversationId, interactionId), draft);
  }, []);

  const clearInteractionDrafts = useCallback((scope?: { projectId?: string; conversationId?: string }): void => {
    if (!scope?.projectId && !scope?.conversationId) {
      interactionDraftsRef.current.clear();
      return;
    }
    for (const key of interactionDraftsRef.current.keys()) {
      const [projectId, conversationId] = JSON.parse(key) as [string, string, string];
      if (scope.projectId && scope.projectId !== projectId) continue;
      if (scope.conversationId && scope.conversationId !== conversationId) continue;
      interactionDraftsRef.current.delete(key);
    }
  }, []);

  return {
    executeDecisionAction,
    requestDecisionFeedback,
    runWorkflowAction,
    settleInteraction,
    getInteractionDraft,
    setInteractionDraft,
    clearInteractionDrafts,
  };
}

export function preserveSelectedWorkbenchTopic(next: Snapshot, previous: Snapshot): Snapshot {
  return {
    ...next,
    center: {
      ...next.center,
      selectedTopic: previous.center.selectedTopic,
      workpad: previous.center.workpad,
      agentLoop: previous.center.agentLoop,
    },
    right: {
      ...next.right,
    },
  };
}

function interactionDraftKey(projectId: string, conversationId: string, interactionId: string): string {
  return JSON.stringify([projectId, conversationId, interactionId]);
}
