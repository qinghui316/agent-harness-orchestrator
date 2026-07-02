# Spec: main-agent-child-agent-workspace-flow-v2

## Goal

AHO Workbench must present bounded child agents as scoped workspaces instead of mixing child-agent output into the parent Agent conversation. Planning must become an interactive planning-agent workspace: users can review and revise the draft there, then click "实施此计划" to promote the accepted bundle through the existing Harness action path.

## Users

- AHO users running Harness-mode demand conversations.
- Developers validating main-agent / child-agent orchestration behavior.

## Acceptance Criteria

- AC-001: The main conversation remains parent-agent only: it shows user messages, real main-agent output, and compact delegation/result process rows, but not full planning draft prose, AC/task tables, raw artifact refs, Change ids, TaskRun/WorkflowRun ids, or internal gate wording.
- AC-002: The right rail exposes an `Agent` workspace that can show the selected agent's status, transcript/process rows, input/output summaries, evidence refs, and valid scoped interactions.
- AC-003: The main conversation and the right Agent workspace reuse the same transcript cell renderer/component path for assistant, user, process, evidence, Markdown, and long-message folding.
- AC-004: Planning draft review and feedback happen in the planning-agent workspace, not as a long main-conversation assistant message and not as a normal confirmationQueue primary planning card.
- AC-005: "实施此计划" continues to call existing `planning.confirm-execution` with the current planning bundle id and stale-target/cross-change revalidation intact.
- AC-006: Normal main composer messages go to main-agent chat and do not auto-trigger `planning.generate`, `planning.revise`, or `planning.confirm-execution`.
- AC-007: Child-agent workspace does not add workflow truth or authority; confirmationQueue remains responsible for non-planning Harness execution gates such as apply, close, Scheduler/IntegrationCheck, remote/PR/merge, request changes, abandon, and Harness evolution.
- AC-008: Planning-agent live/status/result events are scoped to the child-agent workspace and do not stream into the main Agent assistant bubble.
- AC-009: Documentation records the new interaction model and retires the old "planning draft in the main conversation / ordinary planning confirmation card" guidance.

## Non-Goals

- Do not implement ordinary Agent mode.
- Do not add new workflow action types or automation allowlist entries.
- Do not change canonical planning artifact promotion semantics.
- Do not let child agents recursively delegate, schedule, apply, close, merge, or mutate source outside existing Harness gates.
- Do not introduce fake child-agent chat state that is disconnected from existing AgentTask, Codex run, planning bundle, or workflow evidence.

## Constraints

- Reuse existing transcript cell types and renderer as far as practical.
- Keep `planning.confirm-execution` as the backend action for accepting a plan.
- Preserve current revalidation, ToolPolicyGate, validation/audit, Scheduler, IntegrationCheck, apply/close, remote/PR/merge, and Harness evolution boundaries.
- Do not include unrelated untracked `README.md`.
- Preserve UTF-8 and avoid writing terminal mojibake into source.

## Risks

- Moving planning out of confirmationQueue may break existing full-access post-plan automation if the planning confirmation payload is not forwarded exactly.
- Adding the Agent rail may duplicate graph/detail projections unless it reuses existing read-model data.
- If planning-agent events are stored as ordinary assistant messages, the main transcript will continue to look fake or system-generated.
- Existing docs still describe planning draft in the main conversation; leaving them stale will cause future regressions.
