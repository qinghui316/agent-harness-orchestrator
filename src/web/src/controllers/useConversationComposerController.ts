import { useEffect, useRef } from "react";
import { projectComposerModelLabel } from "./ComposerExperienceProjection.js";
import {
  composerProductMode,
  composerScopeIdentity,
  resolveAgentTurnModeDisabledReason,
  resolveAgentTurnModelDisabledReason,
  resolveAttachmentCapabilityDisabledReason,
  resolveDraftProviderDisabledReason,
  type ConversationComposerPorts,
  type ConversationComposerScope,
} from "./conversation-composer-contract.js";
import { useConversationComposerResources } from "./useConversationComposerResources.js";
import { useConversationDraftLifecycle } from "./useConversationDraftLifecycle.js";
import { useConversationExecutionActions } from "./useConversationExecutionActions.js";
import { useConversationSubmissionCoordinator } from "./useConversationSubmissionCoordinator.js";

export * from "./conversation-composer-contract.js";
export type {
  ComposerAttachmentUpload,
  ComposerCreateConversationRequest,
  ComposerCreatedConversation,
  ComposerMessageRequest,
  ComposerSkillOverride,
} from "./conversation-submission-contract.js";

export function useConversationComposerController(
  scope: ConversationComposerScope,
  ports: ConversationComposerPorts,
) {
  const scopeRef = useRef(scope);
  const portsRef = useRef(ports);
  const scopeGenerationRef = useRef(0);
  const scopeIdentityRef = useRef(composerScopeIdentity(scope));
  scopeRef.current = scope;
  portsRef.current = ports;

  useEffect(() => {
    const identity = composerScopeIdentity(scope);
    if (identity === scopeIdentityRef.current) return;
    scopeIdentityRef.current = identity;
    scopeGenerationRef.current += 1;
  }, [
    scope.productMode,
    scope.projectId,
    scope.conversation?.id,
    scope.conversation?.productMode,
    scope.conversation?.selectedProviderId,
    scope.selectedProviderId,
  ]);

  const draft = useConversationDraftLifecycle(scope, portsRef, scopeRef, scopeGenerationRef);
  const resources = useConversationComposerResources(scope, portsRef, scopeRef, scopeGenerationRef, draft);
  const submission = useConversationSubmissionCoordinator(
    portsRef,
    scopeRef,
    scopeGenerationRef,
    draft,
    resources,
  );
  const execution = useConversationExecutionActions(
    portsRef,
    scopeRef,
    scopeGenerationRef,
    draft,
    resources,
    submission,
  );

  const agentTurnModeDisabledReason = resolveDraftProviderDisabledReason(scope)
    ?? resolveAgentTurnModeDisabledReason(scope, draft.agentTurnMode)
    ?? resolveAgentTurnModelDisabledReason(
      scope,
      draft.agentTurnMode,
      draft.agentModelId,
      draft.agentReasoningEffort,
    )
    ?? resolveAttachmentCapabilityDisabledReason(scope, draft.attachments);
  const modelLabel = projectComposerModelLabel({
    productMode: composerProductMode(scope),
    composerModelId: draft.agentModelId,
    savedConversationModelId: scope.conversation?.agentModelId ?? null,
    modelSettings: scope.providerModelSettings ?? null,
  });

  return {
    composerText: draft.composerText,
    setComposerText: draft.setComposerText,
    skillItems: resources.skillItems,
    activeSkillIds: resources.activeSkillIds,
    enabledSkillCount: resources.enabledSkillCount,
    draftSkillOverrides: draft.draftSkillOverrides,
    fileRefs: draft.fileRefs,
    setFileRefs: draft.setFileRefs,
    addFileReference: draft.addFileReference,
    attachments: draft.attachments,
    draftDiagnostics: draft.draftDiagnostics,
    agentTurnMode: draft.agentTurnMode,
    agentModelId: draft.agentModelId,
    agentReasoningEffort: draft.agentReasoningEffort,
    modelLabel,
    selectAgentTurnMode: draft.selectAgentTurnMode,
    selectAgentModel: draft.selectAgentModel,
    selectAgentReasoningEffort: draft.selectAgentReasoningEffort,
    selectProvider: draft.selectProvider,
    agentTurnModeDisabledReason,
    setAttachments: resources.setAttachments,
    reloadSkills: resources.reloadSkills,
    toggleSkill: resources.toggleSkill,
    appendAttachments: resources.appendAttachments,
    removeAttachment: resources.removeAttachment,
    createConversation: submission.createConversation,
    enqueue: execution.enqueue,
    reclaimQueuedTurn: execution.reclaimQueuedTurn,
    flushDraft: draft.flushDraft,
    clearAcceptedReviewCommand: draft.clearAcceptedReviewCommand,
    send: execution.send,
    retryPendingIntent: submission.retryPendingIntent,
    restorePendingIntent: submission.restorePendingIntent,
    stop: execution.stop,
    cleanupTransition: execution.cleanupTransition,
  };
}
