# Project Status

## Current Handoff

- Current date: 2026-07-07.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived docs/architecture change:
  `harness/changes/archive/20260707-unified-agent-authored-workflowplan-architecture-correction-v1/summary.md`.
  It corrected current architecture wording for Goal / Plan / Workflow /
  worktree: main Agent owns the visible Goal brief and next-round judgment,
  Plan Agent drafts or revises Plan / WorkflowPlan, Workflow Runtime owns
  orchestration, write-capable leaves use AHO-owned worktrees, and Harness
  docs/evidence remain project memory.
- Latest archived runtime change:
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
  confirmed TaskQueue queue-level start/resume, and TaskRun stage execution now
  run through `workflow-runtime`. Remaining compatibility paths are
  demand-worker role-chain entrypoints and Scheduler worker paths.
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

The next structured runtime work should choose exactly one path:

- begin Scheduler ready-set / wave migration; or
- migrate demand-worker role-chain entrypoints.

Do not combine Scheduler migration and demand-worker role-chain migration in
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
