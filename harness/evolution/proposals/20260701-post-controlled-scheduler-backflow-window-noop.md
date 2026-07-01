# Harness Evolution Proposal: Controlled Scheduler Backflow Window

## Candidate Window

Pending file: `harness/evolution/pending.md`.

Candidate archives:

- `harness/changes/archive/20260701-auto-evolve-post-controlled-scheduler-bridge-window/summary.md`
- `harness/changes/archive/20260701-main-agent-controlled-scheduler-result-policy-consumption-v1/summary.md`
- `harness/changes/archive/20260701-main-agent-controlled-scheduler-state-backflow-v1a/summary.md`
- `harness/changes/archive/20260701-main-agent-controlled-scheduler-worker-runtime-backflow-v1b/summary.md`
- `harness/changes/archive/20260701-main-agent-controlled-scheduler-integrationcheck-backflow-v1c/summary.md`

## Recommendation

- Status: `noop`
- Eval mode: `subagent_review`
- ECL rule changes: none
- Harness template changes: none
- Product runtime changes: none

## Rationale

This archive window reinforces existing reusable rules rather than exposing a
new durable Harness gap.

The controlled Scheduler result, state, worker, and IntegrationCheck backflow
changes all deliberately stayed read-only. They summarize existing
SchedulerRun, WorkerLease, worker validation/audit/rework, and IntegrationCheck
evidence so main-agent replay/policy can observe current posture, but they do
not execute Scheduler, start workers, create gates, change UI/actions, alter
confirmationQueue, bypass ToolPolicyGate, or affect apply/close/remote/PR/merge
or Harness evolution authority.

Existing `docs/ECL.md` and `docs/BOUNDARIES.md` already cover the reusable
lessons:

- Proposal / Runtime Boundary: scheduler/recovery/backflow artifacts are
  non-executable evidence and must fail closed on stale, forged, or cross-Change
  targets.
- Orchestration Authority Matrix: `confirmationQueue.primary` and existing
  gated actions remain the legal decision surface; main-agent replay and
  decisions are not workflow truth.
- Scheduler / parallel-work boundary: SchedulerRun completion, worker evidence,
  and IntegrationCheck handoff/outcome do not authorize whole-wave dispatch,
  scheduler loops, child Changes, automatic apply/merge, or a full parallel
  executor.
- Module Boundary and Core Mechanism Reuse: evidence readers and backflow
  summaries belong in owned modules and must not grow new authority systems.
- Documentation Entropy and Experience Lifecycle: helper names, V1a/V1b/V1c
  slice labels, exact test counts, and previous subagent scores should remain
  archive-only unless they change present agent behavior.

Adding a new controlled-Scheduler-backflow-specific ECL rule would duplicate
these broader rules and increase documentation entropy.

## Independent Review

Subagent `Carver` returned `noop` with score `88/100`.

Key review notes:

- No new Harness rule, template, lint, or product runtime change is justified.
- Existing ECL/BOUNDARIES cover non-executing evidence, Scheduler owner
  boundaries, canonical manager precedence, human gate / ToolPolicyGate
  preservation, confirmationQueue separation, and documentation entropy.
- The active-change placeholder/handoff drift visible during review was a
  process state issue already covered by ECL lint and was corrected before
  mark-complete.

## Experience Retention Scan

- Promote: none.
- Retain: existing durable rules for non-executing evidence, canonical
  Change/ECL truth, Scheduler owner authority, ToolPolicyGate/human gates,
  confirmationQueue primary-gate behavior, proposal/runtime boundaries, module
  boundaries, core mechanism reuse, documentation entropy, and controlled
  evolution.
- Merge: none. The current broader proposal/runtime, module-boundary,
  core-mechanism, and documentation-entropy rules already subsume this window.
- Retire: do not add archive-specific helper names such as controlled state,
  worker, or integration backflow as durable rules.
- Archive-only: per-run ids, helper names, exact verification counts,
  implementation slice labels V1a/V1b/V1c, and previous auto-evolve subagent
  scores.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`

## Result

Record `noop / subagent_review` in `harness/evolution/results.tsv` and mark the
pending evolution complete.
