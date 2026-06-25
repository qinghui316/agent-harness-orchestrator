# Post Scheduler Integration Window Evolution Proposal

## Window

Pending file: `harness/evolution/pending.md`

Candidate archives:

- `harness/changes/archive/20260624-auto-evolve-post-bounded-rework-window/summary.md`
- `harness/changes/archive/20260625-workbench-low-conflict-taskgraph-scheduler-reachability-v1/summary.md`
- `harness/changes/archive/20260625-workbench-scheduler-worker-integration-real-acceptance-v1/summary.md`
- `harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`
- `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`

## Recommendation

Status: `docs_merge`

No new ECL rule, review-template field, lint rule, or product runtime change is
recommended for this window. The existing rules already cover the repeated
safety and boundary lessons:

- Workbench user-surface honesty and scoped action payload coverage for visible
  gates and target ids.
- Source apply safety coverage for external E-drive sandboxes and no automatic
  source mutation.
- Goal Loop, proposal/runtime, module-boundary, and core-mechanism reuse
  coverage for scheduler/automation boundaries.
- Documentation entropy and close/handoff drift coverage for keeping current
  docs compact and archive details archive-only.

The only durable current-doc action is compact handoff alignment after
`mark-complete`: clear pending evolution pointers, record this archive as the
latest completed Harness evolution, and keep product blocker details in
`docs/STATUS.md` / `docs/CURRENT-DEVELOPMENT-PLAN.md` at handoff scale.

## Evidence Summary

### Scheduler Reachability

`workbench-low-conflict-taskgraph-scheduler-reachability-v1` proved ordinary
Workbench demand can reach low-conflict scheduler preparation and controlled
scheduler path through existing `planning.goal-loop.controlled-continue.run`.
The final blocker was missing external source dependencies, recorded as
environment/dependency setup rather than a Harness rule gap.

### Scheduler Worker / Integration

`workbench-scheduler-worker-integration-real-acceptance-v1` proved E-drive
source with installed dependencies can run two real `coder-codex` scheduler
workers, worker validation/audit, and a ready integration candidate. It also
fixed a product bug in task-scoped worker prompt/diff boundaries. Existing
module-boundary and source-safety rules were sufficient.

### Scheduler IntegrationCheck

`workbench-scheduler-integrationcheck-real-acceptance-v1` proved manual
`planning.scheduler.integration-check.run` remains a human gate and produces
aggregate validation/audit before stopping at human integration apply/discard.
Two product fixes stayed inside existing owners: automation max-step finalizing
and manual scheduler gate projection. Existing Goal Loop / Workbench honesty /
human-gate rules were sufficient.

### Integration Apply/Discard

`workbench-scheduler-integration-apply-discard-real-acceptance-v1` hardened
`discardIntegrationCheck` so terminal/non-discardable checks fail closed at the
handler. Real UI re-entry of an old passed IntegrationCheck sandbox exposed a
product restore-path blocker: existing `AHO_HOME` artifacts plus a source
marker can reopen as Harness-uninitialized / memory unknown. This should become
a product hardening slice, not a Harness process rule.

## Experience Retention Scan

### Promote

None. The window does not reveal an uncovered general ECL/template/lint rule.

### Retain

- Retain Workbench user-surface honesty, scoped action payload, source apply
  safety, Goal Loop boundary, proposal/runtime boundary, module boundary, core
  mechanism reuse, close/handoff drift, documentation entropy, and experience
  lifecycle rules.
- Retain the current product boundary: `完全访问权限` does not directly consume
  raw scheduler actions or integration apply/discard, and high-impact terminal
  actions remain human-gated.

### Merge

- Merge latest handoff wording so AGENTS/STATUS/CURRENT agree on: no active
  change, no pending evolution after completion, latest Harness evolution, and
  next product blocker.

### Retire

- Retire pending-evolution current-state text after `mark-complete`.

### Archive-only

- Detailed E-drive paths, run ids, retry history, Codex artifacts, and sandbox
  setup details stay in archived summaries.
- The Open Dynamic Workflows comparison remains future architecture reference
  only; it is not current Integration apply/discard implementation guidance.

## Product Follow-Up Candidates

These are not Harness evolution changes:

- Workbench external-local restore: reopen old E-drive acceptance sandboxes from
  source marker plus `AHO_HOME` artifacts without showing memory unknown.
- Planning/decomposition honesty: do not expand explicit two-file demands into
  tests/index/package changes unless the expansion is justified and accepted.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review ...`

Product tests are not required because no product source/runtime behavior is
changed by this evolution pass.
