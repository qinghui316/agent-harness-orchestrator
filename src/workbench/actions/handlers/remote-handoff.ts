import { completeAgentTask } from "../../../agent-task/manager.js";
import { resolveProjectMemory } from "../../../memory/resolver.js";
import { prepareLandingPackage, reviewLandingPackage } from "../../../landing/manager.js";
import { mergeNextLandingQueueCandidate, prepareLandingQueue, refreshLandingQueue } from "../../../landing-queue/manager.js";
import { createDraftPr, preparePrDraftPackage, refreshPrDraftStatus } from "../../../pr-draft/manager.js";
import { completePrFeedbackReworkAttempt, refreshPrFeedback, startPrFeedbackReworkAttempt, updatePrDraftFromFeedback } from "../../../pr-feedback/manager.js";
import { preparePrReviewReadiness, preparePrReviewReplyDraft, refreshPrReviewState, resolvePrReviewThread, submitPrForHumanReview, submitPrReviewReply } from "../../../pr-review/manager.js";
import { mergeRemoteLanding, prepareRemoteLandingReadiness, refreshRemoteLanding } from "../../../remote-landing/manager.js";
import { cleanupRemoteBranchAfterMerge, prepareLocalSync, preparePostMergeHandoff, prepareRemoteBranchCleanup, syncLocalAfterMerge } from "../../../post-merge/manager.js";
import { runMainAgentFeedbackRework } from "../../../main-agent-orchestration/index.js";
import type { ManagedProject } from "../../../types/index.js";
import { selectLandingReviewArtifactRef, selectLandingSummaryArtifactRef } from "../../artifact-selection.js";
import { emitAssistantEvent } from "../../live-events.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../types.js";

export async function prepareLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const pkg = await prepareLandingPackage(project, { worktreeId: request.worktreeId, applyCheckId: request.applyCheckId });
  const reviewed = await reviewLandingPackage(project, pkg.id);
  const text = [
    "已完成提交/PR 前检查。",
    reviewed.review?.summary ?? reviewed.summary,
    "",
    reviewed.review?.riskSummary ?? reviewed.riskSummary,
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-readiness",
    text,
    artifact: selectLandingSummaryArtifactRef(reviewed.artifactRefs),
    blocks: [
      {
        id: `${reviewed.id}:landing-prose`,
        runId: reviewed.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "提交/PR 前检查",
        text,
      },
      {
        id: `${reviewed.id}:landing-result`,
        runId: reviewed.id,
        sequence: 2,
        kind: "tool-result",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: reviewed.review?.verdict === "ready" ? "落地检查通过" : "落地检查需要处理",
        text: reviewed.review?.suggestedNextAction ?? "请查看证据后决定下一步。",
        artifactRef: reviewed.review ? selectLandingReviewArtifactRef(reviewed.artifactRefs, { fallback: "package" }) : reviewed.artifactRefs[0],
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: entry });
  emitAssistantEvent(live, {
    runId: reviewed.id,
    kind: "tool-result",
    phase: "landing-readiness",
    title: "Landing readiness reviewed",
    summary: reviewed.review?.summary ?? reviewed.summary,
    artifactRef: reviewed.artifactRefs[0],
  });
  return { package: reviewed };
}

export async function reviewLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("landing.review requires landingPackageId.");
  const reviewed = await reviewLandingPackage(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-review",
    text: reviewed.review?.summary ?? reviewed.summary,
    artifact: selectLandingReviewArtifactRef(reviewed.artifactRefs, { fallback: "package" }),
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: reviewed };
}

export async function preparePrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.prepare requires landingPackageId.");
  const pkg = await preparePrDraftPackage(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-prepared",
    text: `PR 草稿材料已准备好。这不会 push、创建 PR 或 merge。\n\n证据：${pkg.bodyArtifact}`,
    artifact: pkg.bodyArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

export async function createPrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.create requires landingPackageId.");
  const pkg = await createDraftPr(project, request.landingPackageId);
  const text = [
    "已创建或更新 Draft PR。",
    "",
    `PR: ${pkg.prUrl ?? "unknown"}`,
    `Branch: ${pkg.branchName}`,
    "",
    "这是远端协作草稿，不会自动 merge 或 land。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-created",
    text,
    artifact: pkg.bodyArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

export async function refreshPrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.refresh requires landingPackageId.");
  const pkg = await refreshPrDraftStatus(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-refreshed",
    text: pkg.prUrl ? `Draft PR 状态已刷新：${pkg.prUrl}` : "Draft PR 状态已刷新；还没有可用 PR URL。",
    artifact: pkg.packageArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

export async function refreshPrFeedbackForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.refresh requires landingPackageId.");
  const feedback = await refreshPrFeedback(project, request.landingPackageId);
  const text = [
    "已读取 Draft PR 远端反馈。",
    "",
    feedback.summary.summary,
    "",
    feedback.summary.actionable
      ? "主 agent 判断：这些反馈需要在同一需求中重新处理。"
      : "主 agent 判断：当前没有必须自动修改的远端反馈。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-feedback-refreshed",
    text,
    artifact: feedback.summary.evidenceRefs[0],
    blocks: [
      {
        id: `${feedback.snapshot.id}:pr-feedback-prose`,
        runId: feedback.snapshot.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "PR 反馈",
        text,
      },
      {
        id: `${feedback.snapshot.id}:pr-feedback-result`,
        runId: feedback.snapshot.id,
        sequence: 2,
        kind: "tool-result",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: feedback.summary.actionable ? "需要修改" : "暂无必须修改项",
        text: feedback.summary.recommendedAction,
        artifactRef: feedback.summary.evidenceRefs[0],
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return feedback;
}

export async function reworkPrFeedbackForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.rework requires landingPackageId.");
  const memory = await resolveProjectMemory(project);
  const started = await startPrFeedbackReworkAttempt(project, request.landingPackageId, request.prompt);
  const intro = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-feedback-rework-started",
    text: [
      "已根据 PR 反馈创建同一需求的修改任务。",
      "",
      started.feedback.summary.summary,
      "",
      "接下来主 agent 会按证据继续委派 rework-coder、validator、auditor；通过后还需要重新做落地检查，再由你确认是否更新 Draft PR。",
    ].join("\n"),
    artifact: started.feedback.summary.evidenceRefs[0],
  });
  live?.emit({ event: "assistant.message", data: intro });
  const workflow = await runMainAgentFeedbackRework({
    project,
    changeId,
    prompt: started.prompt,
    live,
  });
  const artifactRefs = compactArtifactRefs(
    ...(isRecord(workflow) && isRecord(workflow.code) && isRecord(workflow.code.run) && isRecord(workflow.code.run.artifacts) && typeof workflow.code.run.artifacts.directory === "string"
      ? [workflow.code.run.artifacts.directory]
      : []),
  );
  const failed = isRecord(workflow) && typeof workflow.stoppedAt === "string" && workflow.stoppedAt;
  await completePrFeedbackReworkAttempt(memory, started.attempt, failed ? "failed" : "completed", artifactRefs);
  await completeAgentTask(memory, started.task, {
    status: failed ? "failed" : "completed",
    summary: failed ? "PR feedback rework needs more attention." : "PR feedback rework completed through main-agent role orchestration.",
    artifactRefs: [...started.feedback.summary.evidenceRefs, ...artifactRefs],
    nextRecommendation: failed ? "Return to the main conversation for next instructions." : "Prepare a new landing review before updating the Draft PR.",
    ...(failed ? { failureClassification: "pr-feedback-rework-failed", requiresUserInputReason: "Main-agent role orchestration did not complete after PR feedback rework." } : {}),
  });
  return { attempt: started.attempt, task: started.task, workflow };
}

export async function updatePrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.update-draft requires landingPackageId.");
  const result = await updatePrDraftFromFeedback(project, request.landingPackageId);
  const text = [
    "已更新同一个 Draft PR 分支。",
    "",
    `PR: ${result.package.prUrl ?? "unknown"}`,
    `Branch: ${result.package.branchName}`,
    "",
    "这只是更新 Draft PR，不会 merge、land、标记 ready for review 或归档需求。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-updated",
    text,
    artifact: result.revision.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function preparePrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.prepare requires landingPackageId.");
  const readiness = await preparePrReviewReadiness(project, request.landingPackageId);
  const text = [
    readiness.summary,
    "",
    readiness.reason,
    "",
    readiness.canSubmit
      ? "右侧可以提交人工评审；这不会 merge、land 或启用自动合并。"
      : "当前不能提交人工评审，请先处理上面的原因。",
    readiness.prUrl ? `\nPR: ${readiness.prUrl}` : "",
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-readiness",
    text,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

export async function submitPrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.submit requires landingPackageId.");
  const result = await submitPrForHumanReview(project, request.landingPackageId);
  const text = [
    "Draft PR 已提交人工评审。",
    "",
    result.handoff.prUrl ? `PR: ${result.handoff.prUrl}` : "PR: unknown",
    "",
    "当前需求进入等待远端评审状态。后续反馈仍通过“检查 PR 反馈”回到同一需求对话处理。",
    "这不会 merge、land、push main、启用自动合并或归档需求。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-submitted",
    text,
    artifact: result.handoff.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function refreshPrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.refresh requires landingPackageId.");
  const readiness = await refreshPrReviewState(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-refreshed",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

export async function preparePrReviewReplyForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.reply-prepare requires landingPackageId.");
  const draft = await preparePrReviewReplyDraft(project, request.landingPackageId, { changeId, message: request.prompt });
  const text = [
    "已准备评审回复草稿。",
    "",
    draft.body,
    "",
    draft.canResolveThread
      ? "右侧可以确认回复评审；如果 provider 支持，也可以标记对应 thread 已处理。"
      : "右侧可以确认回复评审；当前 provider 没有可用的 thread resolve 能力。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-reply-draft",
    text,
    artifact: draft.artifactRef,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { draft };
}

export async function submitPrReviewReplyForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.reply-submit requires landingPackageId.");
  const result = await submitPrReviewReply(project, request.landingPackageId);
  const text = [
    "已回复 PR 评审反馈。",
    "",
    "这只是提交回复，不会 merge、land、push main、归档需求或标记自动合并。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-reply-submitted",
    text,
    artifact: result.handoff.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function resolvePrReviewThreadForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.thread-resolve requires landingPackageId.");
  const result = await resolvePrReviewThread(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-thread-resolved",
    text: "已标记评审 thread 为已处理。此操作不会 merge、land、push main 或归档需求。",
    artifact: result.resolution.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function prepareLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const snapshot = await prepareLandingQueue(project);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-queue-prepared",
    text: `${snapshot.summary}\n\n右侧会只显示当前需要确认的 PR 合并动作；不会自动合并全部。`,
    artifact: snapshot.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { snapshot };
}

export async function refreshLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const snapshot = await refreshLandingQueue(project);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-queue-refreshed",
    text: `${snapshot.summary}\n\n我已经重新检查队列。每次合并前仍会再次刷新选中的 PR。`,
    artifact: snapshot.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { snapshot };
}

export async function mergeNextLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const result = await mergeNextLandingQueueCandidate(project, request.landingPackageId);
  const text = [
    result.result.summary,
    "",
    result.after
      ? `剩余队列已刷新：${result.after.readyCount} 个可合并，${result.after.needsAttentionCount} 个需要先处理。`
      : "当前没有执行远端合并。",
    "",
    "每个 PR 仍需要单独确认；AHO 不会自动合并剩余 PR。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "merged" ? "landing-queue-merged-one" : "landing-queue-not-merged",
    text,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function prepareRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.prepare requires landingPackageId.");
  const readiness = await prepareRemoteLandingReadiness(project, request.landingPackageId);
  const text = [
    readiness.summary,
    "",
    readiness.reason,
    "",
    readiness.canMerge
      ? "右侧可以确认合并 PR。确认后会执行远端 squash merge，但不会同步本地源码。"
      : "当前不能合并 PR；请先处理上面的原因。",
    readiness.prUrl ? `\nPR: ${readiness.prUrl}` : "",
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "remote-landing-readiness",
    text,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

export async function mergeRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.merge requires landingPackageId.");
  const result = await mergeRemoteLanding(project, request.landingPackageId);
  const text = result.result.status === "merged"
    ? [
      "PR 已在远端合并。",
      "",
      result.result.prUrl ? `PR: ${result.result.prUrl}` : "PR: unknown",
      result.result.mergeCommit ? `Merge commit: ${result.result.mergeCommit}` : "",
      "",
      "远端代码现在是稳定边界；本地项目不会自动同步。后台已记录本次合并的需求记忆 closeout 和维护账本。",
    ].filter(Boolean).join("\n")
    : [
      "PR 远端合并失败。",
      "",
      result.result.failureReason ?? "未提供失败原因。",
      "",
      "AHO 只记录失败证据，不会自动修复、合并或改写稳定记忆。",
    ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "merged" ? "remote-landing-merged" : "remote-landing-failed",
    text,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function refreshRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.refresh requires landingPackageId.");
  const readiness = await refreshRemoteLanding(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "remote-landing-refreshed",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

export async function preparePostMergeForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.prepare requires remoteLandingResultId.");
  const handoff = await preparePostMergeHandoff(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-prepared",
    text: [
      handoff.summary,
      "",
      handoff.localStatusSummary,
      "",
      handoff.cleanupSummary,
      "",
      "本地同步和远端分支清理是合并后的可选维护动作，不影响这个需求已合并的状态。",
    ].join("\n"),
    artifact: handoff.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { handoff };
}

export async function prepareLocalSyncForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.sync-local.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.sync-local.prepare requires remoteLandingResultId.");
  const readiness = await prepareLocalSync(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-local-sync-readiness",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.readinessArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

export async function syncLocalForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.sync-local.run requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.sync-local.run requires remoteLandingResultId.");
  const result = await syncLocalAfterMerge(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "synced" ? "post-merge-local-synced" : "post-merge-local-sync-skipped",
    text: result.result.status === "synced"
      ? "本地项目已通过 fast-forward 同步到远端合并后的 base branch。AHO 没有 checkout、stash、reset、rebase 或创建 merge commit。"
      : `${result.readiness.summary}\n\n${result.result.failureReason ?? result.readiness.reason}`,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

export async function prepareRemoteBranchCleanupForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.cleanup-branch.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.cleanup-branch.prepare requires remoteLandingResultId.");
  const readiness = await prepareRemoteBranchCleanup(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-branch-cleanup-readiness",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.readinessArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

export async function cleanupRemoteBranchForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.cleanup-branch.run requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.cleanup-branch.run requires remoteLandingResultId.");
  const result = await cleanupRemoteBranchAfterMerge(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "deleted" ? "post-merge-branch-cleaned" : "post-merge-branch-cleanup-skipped",
    text: result.result.status === "deleted"
      ? "远端 PR 分支已清理。本地分支没有被删除。"
      : `${result.readiness.summary}\n\n${result.result.failureReason ?? result.readiness.reason}`,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactArtifactRefs(...refs: Array<string | undefined | null>): string[] {
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
}
