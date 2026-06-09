import type { ReactElement } from "react";
import {
  humanStatus,
  resultReviewStatusLabel,
  roleLabel,
  userFacingText,
} from "../../../formatters.js";
import type { Workpad } from "../../../types.js";
import { parentSurfaceText, stripInternalPlanningText } from "./surface-text.js";

export function PlanningNarrativeCard({ bundle }: { bundle: NonNullable<Workpad["planningArtifactBundle"]> }): ReactElement {
  const criteria = bundle.acceptanceCriteria.filter((item) => !/^\s*(AC-\d+|TBD)\s*$/i.test(item)).slice(0, 4);
  const tasks = bundle.tasks.filter((task) => task.title && !/^\s*TBD\s*$/i.test(task.title)).slice(0, 3);
  return (
    <section className="parent-agent-section" data-testid="planning-draft-card">
      <div className="parent-section-header">
        <h3>{bundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
        <span>{bundle.status === "confirmed" ? "准备执行" : "等待确认"}</span>
      </div>
      <p className="parent-agent-lead">我理解你要做的是：{parentSurfaceText(bundle.goal)}</p>
      {bundle.design ? <p>实现上，我会按现有代码结构处理：{userFacingText(stripInternalPlanningText(bundle.design))}</p> : null}
      {criteria.length > 0 ? (
        <div className="parent-chip-list">
          {criteria.map((item) => <span key={item}>{userFacingText(stripInternalPlanningText(item))}</span>)}
        </div>
      ) : null}
      {tasks.length > 0 ? (
        <div className="role-result-list">
          {tasks.map((task) => (
            <div className="role-result-row" key={task.id}>
              <strong>会处理</strong>
              <span>{userFacingText(stripInternalPlanningText(task.title))}</span>
            </div>
          ))}
        </div>
      ) : null}
      {bundle.openQuestions.length > 0 ? (
        <p className="parent-agent-note">还有 {bundle.openQuestions.length} 个点需要确认后再执行。</p>
      ) : null}
    </section>
  );
}

export function RoleToolResultRows({ pipeline }: { pipeline: NonNullable<Workpad["rolePipeline"]> }): ReactElement {
  const rows = [
    ...pipeline.runs.map((run) => ({ id: `${run.roleId}:${run.runId ?? run.artifact ?? run.status}`, roleId: run.roleId, status: run.status, summary: run.summary, artifact: run.artifact })),
    ...pipeline.agentTasks.slice(-6).map((task) => ({ id: task.id, roleId: task.roleId, status: task.status, summary: task.resultSummary ?? task.summary, artifact: task.evidenceRefs[0] })),
  ];
  if (rows.length === 0) return <></>;
  return (
    <section className="parent-agent-section" data-testid="role-pipeline-summary">
      <div className="parent-section-header">
        <h3>执行过程</h3>
        <span>{humanStatus(pipeline.status)}</span>
      </div>
      <div className="role-result-list">
        {rows.map((row) => (
          <div className="role-result-row" key={row.id}>
            <strong>{roleLabel(row.roleId)}</strong>
            <span>{parentSurfaceText(row.summary)}</span>
            <small>{humanStatus(row.status)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ResultReviewNarrative({ review }: { review: NonNullable<Workpad["resultReview"]> }): ReactElement {
  return (
    <section className={`parent-agent-section result-review ${review.status}`} data-testid="result-review-card">
      <div className="parent-section-header">
        <h3>结果</h3>
        <span>{resultReviewStatusLabel(review.status)}</span>
      </div>
      <p className="parent-agent-lead">{userFacingText(review.title)}</p>
      <p>{userFacingText(review.summary)}</p>
      {review.changedFiles.length > 0 ? (
        <div className="parent-chip-list">
          {review.changedFiles.slice(0, 6).map((file) => <span key={file}>{file}</span>)}
        </div>
      ) : null}
      <div className="role-result-list">
        <div className="role-result-row"><strong>验证</strong><span>{review.validation ? humanStatus(review.validation.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>审查</strong><span>{review.audit ? humanStatus(review.audit.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>下一步</strong><span>{userFacingText(review.applyReadiness.message ?? review.applyReadiness.label)}</span></div>
      </div>
      {review.audit?.notes.length ? <p className="parent-agent-note">注意事项：{userFacingText(review.audit.notes[0])}</p> : null}
    </section>
  );
}
