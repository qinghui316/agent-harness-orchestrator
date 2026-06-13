# Phase 9R-9V Scheduler Integration Apply Evidence Evolution Proposal

## Window

- `harness/changes/archive/20260613-phase-9r-scheduler-integration-outcome-bridge/summary.md`
- `harness/changes/archive/20260613-phase-9s-scheduler-next-worker-start-gate/summary.md`
- `harness/changes/archive/20260613-phase-9t-scheduler-current-worker-quality-gate-candidate-refresh-surface/summary.md`
- `harness/changes/archive/20260613-phase-9u-scheduler-two-worker-acceptance-surface/summary.md`
- `harness/changes/archive/20260613-phase-9v-scheduler-integration-apply-discard-outcome-acceptance/summary.md`

## Recommendation

Status: `noop`

EvalMode: `subagent_review`

Phase 9R-9V shows the scheduler integration chain maturing from outcome evidence through next-worker dispatch, candidate refresh, two-worker acceptance, and existing IntegrationCheck apply/discard outcome acceptance. The reviewed changes repeatedly enforce the same durable boundaries:

- scheduler runtime evidence is not workflow truth;
- scheduler integration handoff delegates to the existing IntegrationCheck engine;
- source-root mutation remains under existing `apply-check.apply` / `apply-check.discard` human gates;
- Workbench actions preserve explicit scoped target ids;
- owner modules contain scheduler state-machine logic;
- product guard fixes are verified with focused tests and Workbench acceptance paths.

The concrete gap found in Phase 9V was not a missing Harness rule. It was a product owner-module direct-call guard gap: `reconcileSchedulerIntegrationOutcome()` needed to re-read latest `SchedulerIntegrationCandidate` rather than relying on Workbench stale-target revalidation. Existing Harness rules already cover that class through Source Apply Safety Coverage, Scoped Workbench Action Payload Coverage, Proposal/Runtime Boundary Coverage, and Module Boundary Coverage.

## Why No New Rule

Adding another rule would duplicate existing coverage and likely overfit this exact scheduler artifact chain. The review templates already require:

- owner module declaration;
- forbidden write-back locations;
- source apply gate coverage;
- action payload target ids;
- stale/forged target behavior;
- compatibility and behavior-path tests.

The right response was to fix the product guard in the owner module and prove it with unit/Workbench acceptance tests, which Phase 9V did.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Limitations

- This proposal does not perform manual UI smoke with a real Codex worker. Automated Workbench action flow is the evidence used for this Harness evaluation.
- Future full parallel executor phases may require new Harness rules once actual concurrency, leases, and multi-worker recovery become real behavior rather than bounded evidence slices.
