import { knownSchedulerUserFacingActionLabel } from "./confirmation/scheduler-user-surface.js";
import type { WorkbenchControlledSchedulerNextCandidate, WorkbenchGoalLoopSummary } from "../../read-model-types.js";

export function buildControlledSchedulerNextCandidate(
  summary: Omit<WorkbenchGoalLoopSummary, "controlledSchedulerNextCandidate">,
): WorkbenchControlledSchedulerNextCandidate | undefined {
  if (!summary.recommendedActionType) return undefined;
  if (!summary.recommendedActionType.startsWith("planning.scheduler.")) return undefined;
  const actionLabel = knownSchedulerUserFacingActionLabel(summary.recommendedActionType) ?? "当前受控步骤";
  const routingPosture = buildRoutingPostureCopy(summary);
  const readinessEvidencePrepared = Boolean(
    summary.controllerPolicyId
      && summary.controllerVerdict === "recommend-existing-gate"
      && summary.controllerGateStatus === "matches-current-gate"
      && summary.gateReadinessPreflightId,
  );
  const evidenceRefs = [
    summary.nextStepPacketMarkdownArtifact ?? summary.nextStepPacketArtifact,
    summary.controllerMarkdownArtifact ?? summary.controllerArtifact,
    summary.gateReadinessPreflightMarkdownArtifact ?? summary.gateReadinessPreflightArtifact,
  ].filter((value): value is string => Boolean(value));
  if (readinessEvidencePrepared) {
    return {
      status: "ready-for-confirmation",
      label: "下一步候选已刷新",
      body: `下一步候选：${actionLabel}。当前步骤检查已刷新；继续仍需要你再次确认。`,
      actionLabel,
      routingPosture,
      readinessEvidencePrepared: true,
      humanConfirmationStillRequired: true,
      evidenceRefs,
    };
  }
  return {
    status: "needs-review",
    label: "下一步候选需要复核",
    body: `下一步候选：${actionLabel}。下一步判断已刷新，但当前步骤检查还需要重新评估或查看证据；不会自动继续。`,
    actionLabel,
    routingPosture,
    readinessEvidencePrepared: false,
    humanConfirmationStillRequired: true,
    evidenceRefs,
  };
}

function buildRoutingPostureCopy(
  summary: Omit<WorkbenchGoalLoopSummary, "controlledSchedulerNextCandidate">,
): WorkbenchControlledSchedulerNextCandidate["routingPosture"] {
  const label = conflictLabel(summary.conflictLevel);
  const body = routingBody(summary.routingPosture, summary.parallelEligible);
  const boundary = schedulerModeBoundary(summary.schedulerExecutionMode?.mode);
  const reasons = summary.conflictReasons
    .map((reason) => sanitizeRoutingReason(reason))
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, 2);
  if (!reasons.length) {
    reasons.push(defaultRoutingReason(summary.routingPosture));
  }
  return { label, body, boundary, reasons };
}

function conflictLabel(level: string): string {
  if (level === "low") return "低冲突，仍需单步确认";
  if (level === "medium") return "需要顺序推进";
  if (level === "high") return "高冲突，先处理当前证据";
  return "等待更多证据";
}

function routingBody(posture: string, parallelEligible: boolean): string {
  if (posture === "single-worker-gate") {
    return parallelEligible
      ? "当前证据只支持继续一个已限定范围的任务步骤；可以评估低冲突并行，但本次仍只确认这一步。"
      : "当前证据只支持继续一个已限定范围的任务步骤；本次仍只确认这一步。";
  }
  if (posture === "sequential-current-worker") {
    return "当前结果链路还没有完成，应该先按顺序处理当前步骤，不能并行推进。";
  }
  if (posture === "candidate-refresh-required") {
    return "已有输出需要先刷新组合候选，再决定能否继续推进。";
  }
  if (posture === "integration-check-required") {
    return "当前必须先完成组合检查，不能直接继续执行、应用或合并。";
  }
  if (posture === "blocked-or-rework") {
    return "当前存在阻塞或返工证据，需要先处理质量问题或等待用户方向。";
  }
  if (posture === "close-gate-required") {
    return "当前已经到达完成或关闭门禁，后续只能走现有人工确认。";
  }
  return "当前证据还不足以证明可以继续，应先等待或补充证据。";
}

function schedulerModeBoundary(mode: string | undefined): string {
  if (mode === "single-gate-staged") return "调度能力仍是单步受控：不会自动循环、整批派发、分配资源槽或启动完整并行执行器。";
  if (mode === "terminal-human-close-gate") return "当前只能通过现有人工完成门禁继续；不会自动应用、合并或关闭。";
  if (mode === "blocked-or-waiting") return "当前没有可自动推进的调度权限；需要先处理阻塞、返工、组合检查或补充证据。";
  return "当前只是只读建议；具体执行仍需要右侧确认区的单独确认。";
}

function defaultRoutingReason(posture: string): string {
  if (posture === "single-worker-gate") return "证据指向一个当前可确认步骤，但确认后仍会停下等待新的证据。";
  if (posture === "integration-check-required") return "多个结果组合前必须先完成组合检查。";
  if (posture === "blocked-or-rework") return "阻塞或返工证据优先于继续执行。";
  if (posture === "close-gate-required") return "完成或关闭属于高影响门禁，需要人工确认。";
  return "当前证据不足以授权自动继续。";
}

function sanitizeRoutingReason(reason: string): string | null {
  const text = reason
    .replace(/\bplanning\.scheduler\.worker\.start-first\b/g, "继续执行第一个任务")
    .replace(/\bplanning\.scheduler\.worker\.start-next\b/g, "继续执行下一个任务")
    .replace(/\bplanning\.scheduler\.worker\.reconcile-result\b/g, "检查当前结果")
    .replace(/\bplanning\.scheduler\.integration-candidate\.compile\b/g, "准备组合候选")
    .replace(/\bplanning\.scheduler\.integration-check\.run\b/g, "执行组合检查")
    .replace(/\bplanning\.scheduler\.integration-outcome\.reconcile\b/g, "检查组合结果")
    .replace(/\bplanning\.scheduler\.run\.complete\b/g, "完成本轮执行记录")
    .replace(/\bplanning\.scheduler\.run\.close-blocked\b/g, "标记当前无法继续")
    .replace(/Recommended action /g, "建议步骤 ")
    .replace(/ is limited to the existing scoped first worker-start gate\./g, "只限于当前已限定范围的第一个任务启动步骤。")
    .replace(/ is the current existing scoped worker gate; parallel eligibility is limited to this single human-confirmed transition\./g, "是当前已限定范围的步骤；即使冲突较低，也只允许这一次人工确认。")
    .replace(/The first worker-start gate is scoped and current\./g, "当前第一个任务启动步骤的范围有效。")
    .trim();
  if (!text) return null;
  if (/\b(planning\.scheduler|SchedulerRun|worker|slot|whole-wave|start-all)\b/i.test(text)) return null;
  return text;
}
