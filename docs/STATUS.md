# Project Status

## Current Handoff

- Current date: 2026-07-09.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest completed Harness evolution:
  `harness/changes/archive/20260708-auto-evolve-harness-post-scheduler-transition-window-v1/summary.md`.
  Decision: `noop`; subagent Heisenberg scored 88. Existing ECL,
  BOUNDARIES, and review-template coverage is sufficient for Scheduler
  ready-set/current-gate/current-transition/code-growth lessons. The next useful
  work is product runtime compression, not another Harness rule.
- Latest archived runtime change:
  `harness/changes/archive/20260709-workflowgraph-sequential-execution-owner-v0/summary.md`.
  It made existing `WorkflowGraphPlan graphMode: "sequential-v1"` the execution
  ordering owner for confirmed TaskQueue sequential runs, thinned
  `workflow-runtime/taskqueue.ts` into facade/compatibility wiring, and kept
  TaskQueueRun / TaskQueueItem as ledger/projection records.
- Latest archived relationship-hardening change:
  `harness/changes/archive/20260709-scheduler-worker-path-read-model-compression-v0/summary.md`.
  It compressed Scheduler worker-path evidence/status/pending/approved-ref
  reads into one read-only `scheduler-runtime` worker-path read model consumed
  by workflow-runtime, Workbench boundary/projection, GoalLoop, and closeout
  paths without adding Scheduler feature behavior.
- Previous archived relationship-hardening change:
  `harness/changes/archive/20260708-scheduler-ready-set-transition-owner-v0/summary.md`.
  It consolidated Scheduler current-transition selection into a shared
  transition contract, routed Workbench / GoalLoop projections through it, and
  kept `workflow-runtime` as the final stale/barrier/source revalidation and
  dispatch authority.
- Previous archived relationship-hardening change:
  `harness/changes/archive/20260708-workflow-action-current-gate-contract-v0/summary.md`.
  It added a pure `workflow-actions` current-gate contract so Workpad
  nextAction, confirmation primary, Goal Loop visible gate evidence, controlled
  scheduler continuation, and server revalidation compare the same scoped gate
  while runtime dispatch keeps authoritative stale/reservation/barrier checks.
- Previous completed Harness evolution:
  `harness/changes/archive/20260708-architecture-relationship-thinking-rule-v1/summary.md`.
  Decision: `docs_current_delta`; subagent Averroes reviewed the delta. The
  change promoted architecture relationship thinking into AGENTS/ECL while
  leaving change templates unchanged, wrote the evolution result, and cleared
  pending evolution.
- Previous completed Harness evolution:
  `harness/changes/archive/20260708-auto-evolve-post-scheduler-owner-window/summary.md`.
  Decision: `docs_current_delta`; subagent Singer scored 85. Existing ECL,
  BOUNDARIES, and runtime-target coverage was sufficient for Workflow Runtime
  convergence and old-runner retirement; only a stale pending-evolution line in
  the current plan was repaired.
- Latest archived Scheduler acceptance:
  `harness/changes/archive/20260708-scheduler-same-wave-full-flow-acceptance-v1/summary.md`.
  It locked the same-wave ready-set with a realistic two-worker slow flow,
  persisted launch confirmation evidence, and aligned Workbench / Goal Loop
  gate ordering so current worker result / validation / audit completes before
  same-wave `start-next`.
- Previous archived runtime change:
  `harness/changes/archive/20260708-harness-workflow-runtime-scheduler-same-wave-ready-set-v0/summary.md`.
  It added Scheduler same-wave ready-set behavior under `workflow-runtime`:
  reserved same-wave workers with non-conflicting source scopes can be started
  explicitly one at a time while siblings run, while cross-wave and
  integration/close barriers still require the current wave to be terminal.
- Previous archived runtime change:
  `harness/changes/archive/20260708-harness-workflow-runtime-compression-v0/summary.md`.
  It deleted the covered old main-agent role-chain runner/step-loop and fixed
  decision policy, and merged source-refresh / PR feedback rework wrappers onto
  one shared `workflow-runtime` rework validation/audit sequence owner.
- Previous archived runtime change:
  `harness/changes/archive/20260708-harness-workflow-runtime-feedback-rework-owner-v0/summary.md`.
  It moved `pr-feedback.rework` / `pr-review.rework` behind
  `workflow-runtime`, tightened single-Change Draft PR feedback lineage, and
  added a canonical `PrFeedbackReworkResult` artifact for downstream agents.
- Previous archived runtime change:
  `harness/changes/archive/20260708-harness-workflow-runtime-source-refresh-rework-owner-v0/summary.md`.
  It moved `result.refresh-rework` source-refresh rework behind
  `workflow-runtime`, preserved the worktree-scoped prompt and validation/audit
  evidence path, and retired the covered legacy source-refresh production
  wrapper/export.
- Previous archived runtime change:
  `harness/changes/archive/20260708-harness-workflow-runtime-top-level-role-chain-owner-v0/summary.md`.
  It moved DemandWorker claimed execution and top-level role-chain action
  entrypoints behind `workflow-runtime`, reusing the default code-change
  workflow and retiring covered old production exports.
- Previous archived runtime change:
  `harness/changes/archive/20260708-harness-workflow-runtime-scheduler-owner-v0/summary.md`.
  It moved SchedulerRun-scoped worker/barrier/integration/closeout progression
  behind `workflow-runtime` ownership while preserving public Scheduler action
  ids and existing Scheduler evidence.
- Latest archived docs/current-state change:
  `harness/changes/archive/20260707-workflow-runtime-current-state-drift-cleanup-v1/summary.md`.
  It cleaned up current-state drift after the TaskRun stage runtime takeover:
  TaskRun stage execution is no longer described as pending migration, and the
  next recommended runtime slice is Scheduler owner migration.
- Latest archived docs/architecture change:
  `harness/changes/archive/20260707-unified-agent-authored-workflowplan-architecture-correction-v1/summary.md`.
  It corrected current architecture wording for Goal / Plan / Workflow /
  worktree: main Agent owns the visible Goal brief and next-round judgment,
  Plan Agent drafts or revises Plan / WorkflowPlan, Workflow Runtime owns
  orchestration, write-capable leaves use AHO-owned worktrees, and Harness
  docs/evidence remain project memory.
- Previous archived runtime change:
  `harness/changes/archive/20260707-harness-workflow-runtime-taskrun-stage-v0/summary.md`.
  It moved TaskRun stage execution into `workflow-runtime`, routed
  `task.run.start` / `task.run.retry` and TaskQueue item stages through the
  new owner, preserved TaskRun/WorkerLease/code/validation/audit leaf
  authorities, and deleted the old TaskRun lifecycle/resume production files.
- Previous runtime change:
  `harness/changes/archive/20260707-harness-workflow-runtime-taskqueue-sequential-v0/summary.md`.
  It moved confirmed TaskQueue start/resume queue-level scheduling into
  `workflow-runtime` and deleted the old queue-level
  `main-agent-orchestration` runner production path.
- Previous runtime change:
  `harness/changes/archive/20260707-harness-workflow-runtime-default-code-change-v0/summary.md`.
  It moved ordinary `code.run` default code-change workflow scheduling into
  `HarnessWorkflowRunEngine` v0.
- Latest Workbench UI repair:
  `harness/changes/archive/20260707-main-agent-transcript-lazy-restore-leak-fix-v1/summary.md`.
  Earlier Plan handoff pending-composer repair is archived at
  `harness/changes/archive/20260707-main-agent-plan-handoff-pending-composer-agent-transcript-repair-v1/summary.md`.

## Current Baseline

- Local manual-gated Workbench has real acceptance through planning, code,
  validation/audit, human apply, and close/archive.
- Runtime architecture is in transition toward the high-cohesion / low-coupling
  Harness Workflow Runtime in
  `docs/design-docs/harness-workflow-runtime-target.md`. Ordinary `code.run`,
  confirmed TaskQueue queue-level start/resume, TaskRun stage execution,
  confirmed TaskQueue `WorkflowGraphPlan graphMode: "sequential-v1"` execution,
  SchedulerRun-scoped progression, Scheduler same-wave ready-set start gates,
  DemandWorker claimed execution, top-level role-chain action entrypoints,
  source-refresh rework, and PR feedback rework now run through
  `workflow-runtime`, and the covered old role-chain runner/step-loop has been
  deleted. TaskQueue now acts as compatibility ledger/projection for the
  sequential graph path. Source-refresh and PR feedback rework share one
  rework-only runtime sequence owner. Broader Scheduler wave automation remains
  a future capability under the Workflow Runtime owner.
- New runtime takeover changes must include new-path takeover, old production
  runner deletion for the covered behavior, and negative tests proving the old
  runner is no longer called.
- Goal is required as a visible main-Agent objective brief and completion
  standard, but it is not hidden durable state and not project memory. Existing
  GoalLoop packet/controller artifacts are compatibility evidence for prompt and
  projection freshness, not a target hidden Goal state machine.
- Plan / WorkflowPlan content is Plan-Agent-authored proposal content until user
  confirmation. Harness validates, scopes, executes confirmed plans, records
  evidence, and enforces gates; it does not invent business planning content
  from raw user demand.
- Workbench conversations are project-scoped chat windows and transcripts, not
  Harness Change ids. Plan handoff execute/revise intent goes to the main Agent
  first and does not create a Change, call workflow actions, grant permission,
  or enter `confirmationQueue.primary` by itself.
- Right-side Workbench tools remain projections or human-gate surfaces. Fake
  provider controls, fake `planning-agent`, fake SubAgent chats, raw scheduler,
  manual IntegrationCheck, integration apply/discard, PR/remote/merge, and
  Harness evolution require separate explicit work and gates.
- Historical phase detail lives in archived `summary.md` files and
  `harness/changes/INDEX.json`, not in this handoff.

## Next Resume Point

No active change remains. The latest runtime slice is
`harness/changes/archive/20260709-workflowgraph-sequential-execution-owner-v0/summary.md`.
Next work should pick exactly one architecture slice after reading
`docs/design-docs/harness-workflow-runtime-target.md`; likely candidates are
broader Scheduler wave automation or WorkflowGraphPlan execution expansion.

Do not combine broader Scheduler wave automation with unrelated
WorkflowGraphPlan, Goal loop, Plan UI, Codex subagent, or remote/merge work in
one change.
Do not widen `完全访问权限` into raw scheduler, manual IntegrationCheck,
integration apply/discard, PR/remote/merge, Harness evolution, or full parallel
execution without a separate structured change.

Desktop product work can continue from `docs/design-docs/ref-desktop-cc-gui.md`
when selected.

## Verification Commands

Harness/documentation verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification when product code changes:

```powershell
npm run typecheck
npm run lint
npm run test:fast
npm run build
npm run test:workbench
```

## Archive Lookup

Use `harness/changes/INDEX.json` for historical detail. Start with archived
`summary.md` files; open specs, plans, reviews, screenshots, E-drive paths, or
source only when the current task needs that evidence.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
