# Controlled Scheduler Continuation Window Evolution

Date: 2026-06-21
Status: proposed-noop
Evaluation mode: independent_review
Active change: `auto-evolve-harness-controlled-scheduler-continuation-window`

## Candidate Window

- `harness/changes/archive/20260621-controlled-scheduler-post-step-routing-decision/summary.md`
- `harness/changes/archive/20260621-controlled-scheduler-post-step-routing-prompt-context/summary.md`
- `harness/changes/archive/20260621-controlled-scheduler-post-step-routing-preflight-handoff/summary.md`
- `harness/changes/archive/20260621-controlled-scheduler-continuation-preflight-support/summary.md`
- `harness/changes/archive/20260621-controlled-scheduler-continuation-acceptance/summary.md`

## Assessment

The window repeats a product convergence lesson rather than exposing a new
Harness gap: controlled Scheduler continuation should reuse existing Goal Loop,
Workbench confirmation, scheduler-runtime, stale-target, ToolPolicy, and
human-gate mechanisms. Evidence can explain and preflight the next existing
gate, but it must not become authority for an automatic loop, source mutation,
apply/close/merge, remote landing, or Harness evolution.

The latest acceptance change also shows a product-planning lesson: after several
small read-only evidence layers, the next useful slice was acceptance and
correction of the real path, not another evidence family. Existing Core
Mechanism Reuse, Documentation Entropy, Workbench honesty, Goal Loop boundary,
Proposal/Runtime boundary, and Close/Handoff Drift rules already express that
lesson in general form.

The archive window includes two test-health signals:

- aggregate `web-app.test.tsx` DOM timing failures that passed standalone;
- a broad slow Workbench scheduler flow timing out at the Vitest default 300s
  with temp cleanup `EBUSY`.

These are real testing debts, but existing review rules already require
recording selected verification scope, aggregate/full suite skips, residual
risk, and environment failures. The evidence supports a future bounded
test-stability product/change if prioritized, not a generic Harness rule.

## Existing Coverage

- `docs/ECL.md` already distinguishes structured changes, requires spec/plan
  artifacts, and requires selected verification scope plus rationale when broad
  suites are skipped.
- Goal Loop Boundary Coverage already blocks recommendation evidence from
  becoming execution authority.
- Proposal / Runtime Boundary Coverage already distinguishes evidence and
  preflight artifacts from workflow truth or executable runtime.
- Workbench User-Surface Honesty and Scoped Workbench Action Payload Coverage
  already require real, implemented, scoped high-impact action paths.
- Module Boundary and Core Mechanism Reuse coverage already push shared
  artifact, lineage, stale-revalidation, authority, projection, gate, and
  ToolPolicy behavior into existing owners instead of feature-local frameworks.
- Documentation Entropy, Experience Lifecycle, and Close/Handoff Drift rules
  already require stale current-state wording to be merged or retired instead of
  copied forward.

## Decision

Proposed result: `noop / independent_review`.

Do not add a new ECL rule, template field, lint check, script, CI gate, product
runtime path, or current-doc rule for this window. The existing rules are broad
enough and adding controlled-Scheduler-specific process text would increase
documentation entropy without lowering future risk.

## Experience Retention Scan

| Candidate | Decision | Evidence | Current-doc impact |
| --- | --- | --- | --- |
| Controlled Scheduler continuation remains one human-confirmed existing gate at a time; evidence/preflight support does not authorize loops or source/apply/close/remote actions. | Retain | all five candidate summaries | Covered by existing Goal Loop, proposal/runtime, Workbench honesty, scoped action, and product-boundary docs. |
| Prefer acceptance and real-path correction over another read-only evidence layer when product behavior is not advancing. | Retain | `controlled-scheduler-continuation-acceptance` | Covered by existing Core Mechanism Reuse and Documentation Entropy rules; no new rule needed. |
| Aggregate Workbench DOM and broad slow-flow timing issues should not obscure product health without targeted evidence. | Archive-only / follow-up debt | `controlled-scheduler-post-step-routing-prompt-context`, `controlled-scheduler-post-step-routing-preflight-handoff`, `controlled-scheduler-continuation-preflight-support`, `controlled-scheduler-continuation-acceptance` | Existing review verification-scope rules cover recording this; future test-stability change can address it. |
| Stale handoff wording should be retired after close. | Retain | `controlled-scheduler-post-step-routing-preflight-handoff`, `controlled-scheduler-continuation-acceptance` | Existing Close/Handoff Drift and ECL lint cover active-path drift; update handoff docs for this active evolution and final close only. |
| Full-auto task mode is the next product direction, not part of controlled Scheduler continuation acceptance. | Retain | `controlled-scheduler-continuation-acceptance` | Keep roadmap pointer in `docs/CURRENT-DEVELOPMENT-PLAN.md` / `docs/STATUS.md`; no Harness rule. |

Promote:

- None.

Merge:

- Merge current handoff state into concise `AGENTS.md` / `docs/STATUS.md`
  updates while this active evolution is open and after close.

Retire:

- Retire any active-path or pending-evolution wording that becomes stale after
  `mark-complete` and close.

Archive-only:

- Keep per-phase controlled Scheduler evidence-family chronology and slow-test
  details in archive summaries and tests.

## Target Files

Expected durable edits if the proposal remains noop:

- `harness/evolution/proposals/20260621-controlled-scheduler-continuation-window-noop.md`
- `harness/evolution/results.tsv`
- `harness/evolution/state.json`
- `AGENTS.md`
- `docs/STATUS.md`
- active/archived change files and generated `harness/changes/INDEX.json`

No ECL rule/template/lint/script/product source file is targeted.

## Score

| Dimension | Score | Notes |
| --- | ---: | --- |
| Evidence grounding /30 | 28 | Five archive summaries plus review evidence show repeated continuation/non-authority and test-scope lessons. |
| Project relevance /25 | 24 | Directly applies to current pending evolution and next product handoff. |
| Mechanical enforceability /15 | 13 | Existing ECL/lint/status checks already enforce active-path and review evidence; no new check needed. |
| Regression safety /20 | 19 | No product/runtime rule changes; only lifecycle state and handoff updates. |
| Context cost /10 | 9 | No new process text beyond proposal/result record. |
| Total | 93 | Supports noop with independent review. |

## Validation

- Independent/subagent review.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode independent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Product test suites are not rerun for this evolution because no product source,
runtime, Workbench, Goal Loop, scheduler, ToolPolicy, or UI code is changed.

## Decision Record

- Decision: proposed `noop`
- eval_mode: proposed `independent_review`
- results.tsv note: `controlled Scheduler continuation window reviewed; existing ECL rules cover non-authority, human-gated continuation, real-path convergence, handoff drift, and test-scope evidence; no durable Harness rule/template/lint/runtime change`
