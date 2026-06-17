# Project Status

## Current Handoff

- Current date: 2026-06-18.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-11t-11x-goal-loop-handoff-evidence/summary.md`.
- Active product phase: none. Active Harness evolution phase: none.
- Active close status: no active change.

This file is the short resume point. Phase 12A is archived after defining a design-only boundary for a future controlled Scheduler/parallel loop before any runtime executor work. Phase 11Y remains the latest runtime/test hardening phase for the existing `planning.scheduler.plan.prepare` Goal Loop handoff as non-executing evidence for the first scheduler plan gate. The latest Harness evolution reviewed Phase 11T-11X as `noop/independent_review` with Hooke score 92/100. For full history, use `harness/changes/INDEX.json` and archived `summary.md` files.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`.

## Recent Completed Work

### Phase 12A Controlled Scheduler Loop Design Boundary

Archived at `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.

Phase 12A adds the accepted design boundary for a future controlled Scheduler/parallel loop in `docs/design-docs/controlled-scheduler-loop.md`. It defines the evidence-driven loop state machine, owner modules, conflict routing, fail-closed stale/forged/cross-Change rules, and final integration barrier: `SchedulerIntegrationCandidate` -> `IntegrationCheck` -> aggregate validation/audit -> human apply gate. The change is documentation/design only; it adds no scheduler loop runtime, worker auto-start, whole-wave dispatch, slot allocator, Workbench action, ToolPolicy change, child Change creation, source mutation, automatic apply/merge/close, or Harness evolution automation.

### Phase 11Y Goal Loop Plan Prepare Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11y-goal-loop-plan-prepare-handoff-regression/summary.md`.

Phase 11Y locks down the existing `planning.scheduler.plan.prepare` Goal Loop handoff. The regression proves the initial scheduler plan gate keeps public recommendation scope to exactly `changeId`, carries false execution/scheduler-loop/full-executor/whole-wave/slot authority through decision, next-step packet, controller policy, preflight, and assisted concrete confirmation, and rejects forged request action/change, forged visible target/preflight, disabled visible gate, recursive Goal Loop action, accepted-artifact drift, and incomplete/forged launch-confirmation ids. The only production change is a narrow assisted-confirmation guard that rejects forged visible gate `changeId`; no scheduler runtime, worker start, Workbench projection/server action, ToolPolicy, source mutation, IntegrationCheck, apply/merge/close, or child Change behavior was added.

### Auto Evolve Harness Phase 11T-11X Goal Loop Handoff Evidence

Archived at `harness/changes/archive/20260618-auto-evolve-harness-phase-11t-11x-goal-loop-handoff-evidence/summary.md`.

The pending Phase 11T-11X Goal Loop handoff evidence window was handled as `noop/independent_review` with Hooke score 92/100. Existing Goal Loop Boundary, Proposal/Runtime Boundary, Scoped Workbench Action Payload by analogy, Module Boundary, Documentation Entropy, Experience Lifecycle, and ToolPolicy/human gate rules are sufficient; no Harness rule, template, lint, product runtime, Workbench, Scheduler, ToolPolicy, source apply, or human gate change was added. `harness-evolve mark-complete` removed `harness/evolution/pending.md`, updated `state.json`, and appended the results row.

### Phase 11U Goal Loop Rework Plan Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11u-goal-loop-rework-plan-handoff-regression/summary.md`.

Phase 11U adds focused regression coverage for the existing `planning.scheduler.worker.rework-plan.compile` Goal Loop handoff. It proves failed-validation rework planning carries exactly `changeId`, `schedulerRunId`, and `schedulerWorkerValidationId` through decision, next-step packet, controller policy, gate-readiness preflight, and assisted concrete confirmation; audit-driven rework planning after blocked/failed audit also requires the exact `schedulerWorkerAuditId`. Missing current gates, wrong actions, forged run/validation/audit ids, disabled visible gates, accepted-artifact drift, and superseding rework-plan evidence fail closed. The change adds no production runtime, Workbench action/projection, server route, ToolPolicy path, source mutation, scheduler loop, whole-wave dispatch, slot allocation, child Change, IntegrationCheck, apply, merge, or close behavior.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`. Full `npm run test` and `npm run test:workbench` exceeded local command timeouts without a returned failed assertion.

### Auto Evolve Harness Phase 11P-11T Goal Loop Gate Evidence

Archived at `harness/changes/archive/20260618-auto-evolve-harness-phase-11p-11t-goal-loop-gate-evidence/summary.md`.

The pending Phase 11P-11T Goal Loop gate evidence window was handled as `noop/independent_review` with independent review score 86/100. Existing Goal Loop Boundary, Proposal/Runtime Boundary, Scoped Workbench Action Payload, Module Boundary, Documentation Entropy, Experience Lifecycle, and ToolPolicy/human gate rules are sufficient; no Harness rule, template, lint, product runtime, Workbench, Scheduler, ToolPolicy, source apply, or human gate change was added.

### Phase 11T Goal Loop Rework Audit Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11t-goal-loop-rework-audit-handoff-regression/summary.md`.

Phase 11T adds focused regression coverage for the existing `planning.scheduler.worker.rework-audit-first` Goal Loop handoff. It proves the exact `changeId`, `schedulerRunId`, and `schedulerWorkerReworkValidationId` scope flows through decision, next-step packet, controller policy, gate-readiness preflight, and assisted concrete confirmation; forged run/rework-validation ids, missing or wrong current gates, disabled or forged visible gates, superseding rework audit evidence, and accepted-artifact drift fail closed. The change adds no production runtime, Workbench action/projection, server route, ToolPolicy path, source mutation, scheduler loop, whole-wave dispatch, slot allocator, automatic apply/merge/close, or child Change behavior.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, and `scripts/harness-evolve.ps1 check`.

### Phase 11S Goal Loop Rework Validation Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11s-goal-loop-rework-validation-handoff-regression/summary.md`.

Phase 11S adds focused regression coverage for the existing `planning.scheduler.worker.rework-validate-first` Goal Loop handoff. It proves the exact `changeId`, `schedulerRunId`, and `schedulerWorkerReworkResultId` scope flows through decision, next-step packet, controller policy, gate-readiness preflight, and assisted concrete confirmation; forged run/rework result ids, missing or wrong current gates, disabled visible gates, and accepted-artifact drift fail closed. The change adds no production runtime, Workbench action/projection, server route, ToolPolicy path, source mutation, scheduler loop, whole-wave dispatch, slot allocator, automatic apply/merge/close, or child Change behavior.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`.

### Phase 11R Goal Loop Worker Audit Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11r-goal-loop-worker-audit-handoff-regression/summary.md`.

Phase 11R adds focused regression coverage for the existing `planning.scheduler.worker.audit-first` Goal Loop handoff. It proves the exact `changeId`, `schedulerRunId`, and `schedulerWorkerValidationId` scope flows through decision, next-step packet, controller policy, gate-readiness preflight, and assisted concrete confirmation; forged run/validation ids, missing or wrong current gates, disabled visible gates, and accepted-artifact drift fail closed. The change adds no production runtime, Workbench action/projection, server route, ToolPolicy path, source mutation, scheduler loop, whole-wave dispatch, slot allocator, automatic apply/merge/close, or child Change behavior.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`.

### Phase 11Q Goal Loop Worker Validation Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11q-goal-loop-worker-validation-handoff-regression/summary.md`.

Phase 11Q adds focused regression coverage for the existing `planning.scheduler.worker.validate-first` Goal Loop handoff. It proves the exact `changeId`, `schedulerRunId`, and `schedulerWorkerResultId` scope flows through decision, next-step packet, controller policy, gate-readiness preflight, and assisted concrete confirmation; forged run/result ids, missing or wrong current gates, disabled visible gates, and accepted-artifact drift fail closed. The change adds no production runtime, Workbench action/projection, server route, ToolPolicy path, source mutation, scheduler loop, whole-wave dispatch, slot allocator, automatic apply/merge/close, or child Change behavior.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`.

### Auto Evolve Harness Phase 11L-11P Goal Loop Gate Evidence

Archived at `harness/changes/archive/20260618-auto-evolve-harness-phase-11l-11p-goal-loop-gate-evidence/summary.md`.

The pending Phase 11L-11P evidence window was handled as `keep/independent_review` with independent review score 82/100. It promoted a narrow `scripts/lint-ecl.ps1` check that rejects close-ready active summaries retaining the `Before close, replace this with` template instruction, while leaving active non-close-ready summaries and the summary template valid. The targeted lint validation proved non-close-ready instruction text passes and close-ready instruction text fails; product runtime, Workbench, Goal Loop, Scheduler, ToolPolicy, source apply, and human gate behavior were not changed.

### Phase 11P Goal Loop Start-First Handoff Regression

Archived at `harness/changes/archive/20260618-phase-11p-goal-loop-start-first-handoff-regression/summary.md`.

Phase 11P locks down the existing Goal Loop handoff path for `planning.scheduler.worker.start-first`. The regression proves the first-worker recommendation, controller policy, gate-readiness preflight, and assisted concrete confirmation stay scoped to the matching `changeId`, `schedulerRunId`, and `schedulerClaimReservationId`; forged targets, disabled visible gates, missing current gates, wrong current actions, and stale packet evidence fail closed. The change is test-only and adds no scheduler runtime, Workbench projection, handler, ToolPolicy, source mutation, scheduler loop, whole-wave dispatch, slot allocator, apply/merge/close, or child Change behavior.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`. Full `npm run test` exceeded the local 184 second command timeout without returning a failed assertion.

### Phase 11O Goal Loop Blocked Closeout Handoff

Archived at `harness/changes/archive/20260618-phase-11o-goal-loop-blocked-closeout-handoff/summary.md`.

Phase 11O locks down the existing Goal Loop handoff path for `planning.scheduler.run.close-blocked`. A blocked scheduler decision that already carries the close-blocked recommended action is classified as `separate-gate-required`, then passes through the existing controller policy, gate-readiness preflight, and assisted concrete confirmation chain only when `changeId`, `schedulerRunId`, `schedulerClaimReservationId`, and `schedulerIntegrationCandidateId` match the enabled visible concrete gate. Generic blocked/no-action Goal Loop states remain suppressed and cannot compile preflight authority. The change adds regression coverage only; no production controller, scheduler runtime, Workbench projection, handler, ToolPolicy, apply/merge/close, or source mutation behavior changed.

Verification passed for focused/full Goal Loop decision tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`. Full `npm run test` exceeded the local 180 second command timeout without returning a failed assertion.

### Phase 11N Goal Loop Enabled Gate Revalidation Guard

Archived at `harness/changes/archive/20260618-phase-11n-goal-loop-enabled-gate-revalidation-guard/summary.md`.

Phase 11N extends the Phase 11M enabled-gate rule into server-side current workflow action revalidation and the assisted concrete gate guard. Goal Loop-assisted concrete requests carrying `goalLoopGateReadinessPreflightId` now fail closed when the matched visible concrete gate is disabled, and a supplied disabled `visibleGate` is rejected before assisted confirmation can proceed. Enabled matching gates continue through the existing concrete action path.

Verification passed for focused action revalidation and Goal Loop tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, `npm run test:integration`, `scripts/lint-ecl.ps1`, and `scripts/lint-encoding.ps1`. Full `npm run test` exceeded the local 184 second command timeout without returning a failed assertion.

### Phase 11M Goal Loop Enabled Gate Projection Guard

Archived at `harness/changes/archive/20260618-phase-11m-goal-loop-enabled-gate-projection-guard/summary.md`.

Phase 11M tightens the Workbench Goal Loop confirmation projection so Goal Loop feedback, controller refresh, gate-readiness preflight, and assisted concrete gate actions attach only beside an enabled matching concrete Harness gate. A disabled same-type/same-scope concrete gate now remains disabled without receiving Goal Loop-derived enabled affordances. The change is projection-only: it adds no Goal Loop policy change, scheduler runtime behavior, handler/route path, source mutation, ToolPolicy bypass, human-gate bypass, scheduler loop, whole-wave dispatch, slot allocator, apply/merge/close behavior, or child Change behavior.

### Auto Evolve Harness Phase 11H-11L Goal Loop Scheduler Mode Guard

Archived at `harness/changes/archive/20260617-auto-evolve-harness-phase-11h-11l-goal-loop-scheduler-mode-guard/summary.md`.

The pending Phase 11H-11L Goal Loop scheduler mode guard evidence window was handled as `noop/independent_review` with independent review score 82/100. Existing Goal Loop Boundary, Proposal/Runtime Boundary, Scoped Workbench Action Payload, Source Apply Safety, Module Boundary, Close/Handoff Drift, Documentation Entropy, and Experience Lifecycle rules are sufficient. Current-plan drift found by review was fixed; no new Harness rule, template, lint, product runtime, Workbench, scheduler, or Goal Loop change was added.

### Phase 11L Goal Loop Assisted Gate Scheduler Mode Guard

Archived at `harness/changes/archive/20260617-phase-11l-goal-loop-assisted-gate-scheduler-mode-guard/summary.md`.

Phase 11L hardens the Goal Loop-assisted concrete gate confirmation guard so scheduler execution-mode evidence must match across latest decision, iteration, continuation brief, next-step packet, controller policy, and gate-readiness preflight before a concrete Workbench gate can carry `goalLoopGateReadinessPreflightId` as evidence. It adds a scheduler-owned equality helper reused by preflight/main-agent checks, adds deterministic forged latest preflight and upstream artifact rejection tests, and adds no Workbench action, route, scheduler runtime behavior, source mutation, ToolPolicy bypass, or human-gate bypass.

### Phase 11K Goal Loop Scheduler Mode Preflight Handoff

Archived at `harness/changes/archive/20260617-phase-11k-goal-loop-scheduler-mode-preflight-handoff/summary.md`.

Phase 11K carries the fresh Goal Loop packet's scheduler execution-mode assessment into `GoalLoopControllerPolicy` and `GoalLoopGateReadinessPreflight`. Preflight now fails closed if controller policy scheduler mode evidence differs from the packet, and main-Agent controller-policy context omits mismatched policy evidence. Controller/preflight markdown and prompt context explicitly show scheduler loop, full parallel executor, whole-wave dispatch, and slot allocation remain unauthorized. It adds no Workbench action, confirmation queue item, server route, scheduler runtime behavior, Goal Loop decision-policy change, IntegrationCheck/apply/close/merge behavior, source mutation, or ToolPolicy/human-gate bypass.

### Phase 11J Workpad Scheduler Execution Mode Surface

Archived at `harness/changes/archive/20260617-phase-11j-workpad-scheduler-execution-mode-surface/summary.md`.

Phase 11J projects the existing fresh Goal Loop packet's scheduler execution-mode assessment into the Workbench Goal Loop read-model summary and existing Workpad read-only evidence card. The card now shows scheduler mode plus explicit false authorization for scheduler loop, full parallel executor, whole-wave dispatch, and slot allocation. It adds no Workbench action, confirmation queue item, server route, scheduler runtime behavior, Goal Loop policy change, IntegrationCheck/apply/close/merge behavior, source mutation, or ToolPolicy/human-gate bypass.

### Phase 11I Scheduler Execution Mode Evidence

Archived at `harness/changes/archive/20260617-phase-11i-scheduler-execution-mode-evidence/summary.md`.

Phase 11I adds scheduler-owned, typed execution-mode assessment to GoalLoopDecision, GoalLoopIteration, GoalLoopContinuationBrief, GoalLoopNextStepPacket, Goal Loop markdown, and main-Agent context. The assessment explicitly classifies current continuation as single-gate staged, terminal, blocked, or waiting evidence with scheduler loop/full executor authorization set to false. It adds no Workbench action, scheduler loop, whole-wave dispatch, slot allocator, worker auto-start, IntegrationCheck/apply/close/merge behavior, source mutation, or ToolPolicy/human-gate bypass.

### Auto Evolve Harness Phase 11D-11H Goal Loop Scheduler Handoff Evidence

Archived at `harness/changes/archive/20260617-auto-evolve-harness-phase-11d-11h-goal-loop-scheduler-handoff-evidence/summary.md`.

The pending Phase 11D-11H Goal Loop scheduler handoff evidence window was handled as `noop/independent_review` with independent review score 84/100. Existing Goal Loop Boundary, Scoped Workbench Action Payload, Source Apply Safety, Module Boundary, Close/Handoff Drift, Documentation Entropy, Experience Lifecycle, and ToolPolicy/human-gate rules are sufficient; no new Harness rule, template, lint, product runtime, Workbench, scheduler, or Goal Loop change was added.

### Phase 11H Goal Loop SchedulerRun Completion Handoff Hardening

Archived at `harness/changes/archive/20260617-phase-11h-goal-loop-scheduler-run-completion-handoff-hardening/summary.md`.

Phase 11H hardens the Goal Loop-guided handoff for the existing `planning.scheduler.run.complete` gate. It carries current scheduler run, reconcile snapshot, claim reservation, scheduler integration candidate, IntegrationCheck handoff, scheduler integration outcome, apply check, and ready `worktreeIds` scope through the Goal Loop packet, Workpad summary, controller refresh, gate-readiness preflight, and assisted concrete confirmation. Boundary validation rejects stale or forged reconcile, claim, candidate, handoff, apply, outcome, worktree, and latest-reconcile lineage targets; completion records scheduler-owned terminal evidence with `sourceMutated: false` and leaves close/archive to the existing human close gate.

### Phase 11G Goal Loop Scheduler Integration Outcome Handoff Hardening

Archived at `harness/changes/archive/20260617-phase-11g-goal-loop-scheduler-integration-outcome-handoff-hardening/summary.md`.

Phase 11G hardens the Goal Loop-guided handoff for the existing `planning.scheduler.integration-outcome.reconcile` gate. It carries current scheduler integration candidate, IntegrationCheck handoff, apply check, and ready `worktreeIds` scope through the Goal Loop packet, Workpad summary, controller refresh, gate-readiness preflight, and assisted concrete confirmation. Workbench boundary validation now rejects forged supplied `schedulerIntegrationCandidateId`, `applyCheckId`, and `worktreeIds`; Goal Loop uses the current IntegrationCheck status so passed handoffs wait for existing apply/discard and terminal handoffs can reconcile outcome evidence without adding a scheduler loop, source mutation, apply/discard, landing, PR, merge, close, or SchedulerRun completion executor.

### Phase 11F Goal Loop Scheduler IntegrationCheck Handoff Hardening

Archived at `harness/changes/archive/20260617-phase-11f-goal-loop-scheduler-integration-check-handoff-hardening/summary.md`.

Phase 11F hardens the Goal Loop-guided handoff for the existing `planning.scheduler.integration-check.run` gate. It carries ready `worktreeIds` in the Goal Loop recommendation scope, proves visible Workpad guidance, controller refresh, gate-readiness preflight, and assisted concrete confirmation stay aligned, rejects forged IntegrationCheck target ids through the Workbench execution path, and records source-safety evidence that assisted IntegrationCheck creates check evidence only before existing apply/discard confirmation.

### Phase 11E Goal Loop Start-Next Handoff Hardening

Archived at `harness/changes/archive/20260617-phase-11e-goal-loop-start-next-handoff-hardening/summary.md`.

Phase 11E hardens the Goal Loop-guided handoff for the existing `planning.scheduler.worker.start-next` gate. It proves packet scope, Workpad visibility, controller refresh, gate-readiness preflight, and assisted concrete confirmation stay aligned on `changeId`, `schedulerRunId`, `schedulerClaimReservationId`, `reservationIntentId`, and `claimIntentId`. The path remains evidence-only until the user confirms the concrete scheduler gate; it adds no scheduler loop, whole-wave dispatch, source mutation, ToolPolicy bypass, human-gate bypass, or Goal Loop executor.

### Auto Evolve Harness Phase 10Z-11D Goal Loop Context Evidence

Archived at `harness/changes/archive/20260617-auto-evolve-harness-phase-10z-11d-goal-loop-context-evidence/summary.md`.

The pending Phase 10Z-11D Goal Loop context evidence window was handled as `noop/independent_review` with independent review score 86/100. Existing Goal Loop Boundary, Runtime Bridge Boundary, Module Boundary, Workbench honesty, scoped action, documentation entropy, Experience Lifecycle, and ToolPolicy/human-gate rules are sufficient; no new Harness rule, template, lint, or product runtime change was added.

### Phase 11D Goal Loop Routing Posture Main-Agent Context

Archived at `harness/changes/archive/20260617-phase-11d-goal-loop-routing-posture-main-agent-context/summary.md`.

Phase 11D exposes the fresh Goal Loop routing posture and label to main-Agent prompt/context markdown and `context.prepared` runtime evidence for `chat.ask` and `orchestrator.plan`. It preserves Workpad-visible gating, packet freshness, stale-controller stripping, ToolPolicy/human gates, and adds no scheduler/runtime/action/source mutation authority.

### Phase 11C Goal Loop Routing Posture Evidence

Archived at `harness/changes/archive/20260617-phase-11c-goal-loop-routing-posture-evidence/summary.md`.

Phase 11C adds a non-executing typed routing posture and short label to Goal Loop conflict assessments, carries them through schemas, markdown, Workbench read-model summaries, and the Workpad read-only card, and keeps legacy artifacts safe with a `wait-for-evidence` default. It adds no scheduler execution, Workbench action, ToolPolicy path, source mutation, apply, close, merge, or child Change behavior.

### Phase 11B Goal Loop Workpad Explanation Card

Archived at `harness/changes/archive/20260617-phase-11b-goal-loop-workpad-explanation-card/summary.md`.

Phase 11B renders the current Workpad `goalLoop` projection as a read-only details card. It exposes recommendation state, conflict level, parallel eligibility, conflict reasons, and evidence links without adding any Workbench action, confirmation item, server route, CLI path, source mutation, or ToolPolicy/human-gate change.

### Phase 11A Goal Loop Conflict Reasons Read Model

Archived at `harness/changes/archive/20260617-phase-11a-goal-loop-conflict-reasons-read-model/summary.md`.

Phase 11A exposes existing Goal Loop conflict-assessment reasons through the Workbench Goal Loop read-model summary. The change is projection-only: `src/goal-loop/` continues to own conflict policy, and Workbench displays derived reasons without adding actions, execution, source mutation, or ToolPolicy/human-gate changes.

### Auto Evolve Harness Phase 10V-10Z Goal Loop Routing Evidence

Archived at `harness/changes/archive/20260616-auto-evolve-harness-phase-10v-10z-goal-loop-routing-evidence/summary.md`.

The pending Phase 10V-10Z Goal Loop routing evidence window was handled as `noop/subagent_review`. Two independent explorer reviews found no missing Harness rule/template/check. Existing Goal Loop Boundary, Proposal/Runtime Boundary, Scoped Workbench Action Payload, Source Apply Safety, Module Boundary, Close/Handoff Drift, Documentation Entropy, Experience Lifecycle, and ToolPolicy/human-gate rules are sufficient.

### Phase 10Z Goal Loop Conflict-Aware Routing

Archived at `harness/changes/archive/20260616-phase-10z-goal-loop-conflict-aware-routing/summary.md`.

Phase 10Z tightens Goal Loop conflict assessment so low conflict is limited to the existing scoped first/next worker-start gates, while active worker sequencing, rework, IntegrationCheck, blocked closeout, scheduler completion, and close-ready states remain non-parallel and human-gated. It adds `test:fast`, `test:workbench`, and `test:integration` scripts so local iteration can avoid the heavy Workbench/CLI suites without weakening the full close gate.

### Phase 10Y Goal Loop Human Close Gate Handoff Boundary

Archived at `harness/changes/archive/20260616-phase-10y-goal-loop-human-close-gate-handoff-boundary/summary.md`.

Phase 10Y adds derived Goal Loop close-gate handoff metadata for the existing `change.close` approval. It lets Workpad and main-Agent context explain that close is ready only when the fresh Goal Loop packet, accepted artifact hashes, selected Change, scheduler completion, and existing close approval match. It adds no Goal Loop close executor, `WorkflowActionType` close action, duplicate close approval, source mutation, scheduler loop, apply, merge, child Change, or archive bypass.

### Phase 10W Goal Loop Assisted Concrete Gate Confirmation

Archived at `harness/changes/archive/20260616-phase-10w-goal-loop-assisted-concrete-gate-confirmation/summary.md`.

Phase 10W connects `GoalLoopGateReadinessPreflight` to the concrete Workbench confirmation path without adding a Goal Loop wrapper executor. Matching concrete actions can carry `goalLoopGateReadinessPreflightId` as additional evidence, while the concrete action type remains the stale-target, ToolPolicyGate, handler, decision/audit, and human-gated transition path.

### Phase 10X Goal Loop Accepted Artifact Freshness Boundary

Archived at `harness/changes/archive/20260616-phase-10x-goal-loop-accepted-artifact-freshness-boundary/summary.md`.

Phase 10X makes accepted `spec.md`, `plan.md`, `tasks.md`, and `ac-map.json` content hashes part of Goal Loop source evidence. If those accepted artifacts drift, stale Goal Loop packet, Workpad summary, main-Agent context, controller/preflight lineage, and assisted concrete gate confirmation must fail closed until fresh Goal Loop evidence is recorded. The phase adds no runtime action, source mutation, scheduler execution, apply, close, merge, or child Change behavior.

### Auto Evolve Harness Phase 10R-10V Goal Loop Gate Evidence

Archived at `harness/changes/archive/20260616-auto-evolve-harness-phase-10r-10v-goal-loop-gate-evidence/summary.md`.

The pending Phase 10R-10V Goal Loop controller/gate evidence window was handled as `noop/subagent_review` with subagent scores 88/100 and 90/100. Existing Goal Loop Boundary, Module Boundary, Runtime/Proposal Boundary, ToolPolicy/human gate, workflow-truth, and documentation entropy rules were sufficient; no new Harness rule was added.

### Phase 10V Goal Loop Concrete Gate Readiness Preflight

Archived at `harness/changes/archive/20260616-phase-10v-goal-loop-concrete-gate-readiness-preflight/summary.md`.

Phase 10V adds `GoalLoopGateReadinessPreflight` as non-executing evidence that the latest Goal Loop packet, controller policy, and current concrete Workbench gate still match before a future concrete gate invocation phase. It adds a secondary readiness action only; it does not invoke the concrete gate, authorize ToolPolicy, mutate source, create workers/runs/worktrees, or replace the separate human-gated confirmation.

### Phase 10U Goal Loop Guided Gate Handoff Acceptance

Archived at `harness/changes/archive/20260616-phase-10u-goal-loop-guided-gate-handoff-acceptance/summary.md`.

Phase 10U hardens the main-Agent prompt handoff from fresh Goal Loop controller policy to the current concrete Harness gate. Fresh `chat.ask` and `orchestrator.plan` prompt artifacts now include a guided concrete gate handoff with action type and scoped target ids only while Workpad-visible controller policy evidence is current. The handoff is non-executing prompt/audit evidence only; it does not add actions, routes, UI controls, scheduler execution, source mutation, child Changes, or workflow-truth authority.

### Harness Self Evolution Slimming Rule Tuning

Archived at `harness/changes/archive/20260615-harness-self-evolution-slimming-rule-tuning/summary.md`.

This change strengthens Harness self-evolution slimming rules without adding product runtime behavior. It adds roadmap/current-direction stale-language checks to ECL and templates, historicalizes the old Phase 7F/7H current-state wording in `docs/AGENT-DEVELOPMENT-OS.md`, and updates the `ecl-harness-engineer` skill recommendation document.

### Harness Doc Entropy And Experience Lifecycle

Archived at `harness/changes/archive/20260615-harness-doc-entropy-and-experience-lifecycle/summary.md`.

This change compressed the current handoff documents and added Harness rules/templates so future self-evolution can both summarize new experience and retire stale or archive-only experience. It does not change product runtime behavior, Workbench actions, CLI actions, schemas, source execution paths, or the user-local `ecl-harness-engineer` skill.

### Phase 10T Goal Loop Controller Policy Runtime Prompt Evidence Acceptance

Archived at `harness/changes/archive/20260615-phase-10t-goal-loop-controller-policy-runtime-prompt-evidence-acceptance/summary.md`.

Phase 10T verifies that actual `chat.ask` and `orchestrator.plan` run artifacts include controller policy prompt context only when the Workpad-visible packet/policy match the selected Change, and that stale or mismatched policy evidence stays out of prompt stack and context. It is acceptance hardening only; it does not add actions, routes, CLI commands, UI controls, worker prompts, scheduler/runtime execution, source mutation, child Changes, or workflow-truth authority.

### Phase 10S Goal Loop Controller Policy Main Agent Context Boundary

Archived at `harness/changes/archive/20260615-phase-10s-goal-loop-controller-policy-main-agent-context-boundary/summary.md`.

Phase 10S connects latest valid `GoalLoopControllerPolicy` evidence into main-Agent prompt context so the main Agent can see controller verdict, gate status, and summary while still requiring the concrete scoped Harness gate, ToolPolicyGate, and human confirmation for any transition.

### Auto Evolve Harness Phase 10P-10T Goal Loop Controller Evidence

Archived at `harness/changes/archive/20260615-auto-evolve-harness-phase-10p-10t-goal-loop-controller-evidence/summary.md`.

The pending Phase 10P-10T Goal Loop controller/feedback/context/prompt evidence window was handled as `noop/subagent_review` with subagent score `92/100`. Existing Goal Loop Boundary, Runtime Bridge Boundary, Module Boundary, ToolPolicy/human gate, and workflow-truth rules were sufficient.

## Current Baseline

- User-facing product model: project folders contain demand conversations.
- Internal workflow model: each demand conversation binds to Change/Workpad/Topic state, role pipeline evidence, validation/audit, result review, apply/close records, and later landing/remote handoff evidence.
- `planning-agent` and `coder-agent` may use Codex app-server when available; `codex exec` fallback remains valid and must be labeled honestly.
- Validator and auditor remain independent evidence runners.
- Workbench conversation rendering centers on user-visible parent-agent/Codex runtime transcript cells; AHO orchestration, evidence, maintenance, policy, and boundary records stay in graph/detail/confirmation/evidence surfaces unless literally surfaced in the main transcript.
- Goal Loop evidence is non-executing. GoalLoopDecision, GoalLoopIteration, continuation brief, next-step packet, feedback evidence, controller policy, and gate-readiness preflight can explain continuation posture or recommend existing Harness gates, but cannot execute, mutate source, bypass ToolPolicyGate/human gates, or become workflow truth.
- Phase 10V adds non-executing Goal Loop gate-readiness preflight evidence for a fresh packet / controller policy / current concrete gate match. It can record that the concrete gate is ready to present, but it cannot invoke the gate, authorize ToolPolicy, start workers, mutate source, or replace the separate human-gated confirmation.
- Phase 10W allows a matching concrete confirmation to carry the preflight id as evidence. The executable path remains the concrete action and its existing stale revalidation, ToolPolicyGate, handler, decision/audit, and human gate.
- Phase 10X anchors Goal Loop freshness to accepted Spec/Plan/Tasks/AC artifact hashes. Accepted artifact drift suppresses stale Goal Loop guidance and assisted gate evidence until refreshed, but does not create a new executable path.
- Phase 10Y allows close-ready Goal Loop evidence to attach derived handoff context to the existing `change.close` approval only while fresh and scoped. The close/archive transition remains the existing human gate.
- Phase 11C makes Goal Loop routing posture machine-readable for Workbench and main-Agent inspection while staying evidence-only and non-executing.
- Phase 11E proves the existing `planning.scheduler.worker.start-next` gate can be guided by fresh Goal Loop packet/controller/preflight evidence while the executable transition remains the concrete scheduler gate.
- Phase 11F proves the existing `planning.scheduler.integration-check.run` gate can be guided by fresh Goal Loop packet/controller/preflight evidence with ready `worktreeIds` scope while the executable transition remains the concrete scheduler IntegrationCheck gate.
- Phase 11G proves the existing `planning.scheduler.integration-outcome.reconcile` gate can be guided by fresh Goal Loop packet/controller/preflight evidence with candidate, handoff, apply check, and ready `worktreeIds` scope while the executable transition remains the concrete scheduler outcome gate.
- Phase 11H proves the existing `planning.scheduler.run.complete` gate can be guided by fresh Goal Loop packet/controller/preflight evidence with reconcile snapshot, claim reservation, candidate, handoff, outcome, apply check, and ready `worktreeIds` scope while the executable transition remains the concrete scheduler completion gate and close remains a separate human gate.
- Phase 11I makes scheduler execution mode explicit in Goal Loop artifacts and main-Agent context. The current scheduler path is still evidence-guided single-gate staged or terminal/waiting/blocked; scheduler loop, full parallel executor, whole-wave dispatch, slot allocation, and worker auto-start authorization remain false.
- Phase 11J makes the same scheduler execution-mode evidence visible in the Workpad Goal Loop card as read-only evidence, including false authorization chips for scheduler loop, full executor, whole-wave dispatch, and slot allocation.
- Phase 11K makes controller policy and gate-readiness preflight handoff artifacts carry the same scheduler execution-mode false-authority evidence from the fresh packet, and rejects preflight/context handoff when controller scheduler mode evidence is forged or stale.
- Phase 11M requires Goal Loop feedback, controller refresh, gate-readiness, and assisted concrete projection affordances to attach only beside an enabled matching concrete Workbench gate; disabled same-scope gates cannot gain Goal Loop-derived enabled actions.
- Phase 11N extends that enabled-gate requirement into server-side current action revalidation and assisted concrete gate confirmation, so forged assisted payloads cannot make disabled visible gates executable.
- Phase 12A defines the future controlled Scheduler loop boundary in `docs/design-docs/controlled-scheduler-loop.md`. It is an accepted design contract only; current runtime still has no scheduler loop, whole-wave dispatch, slot allocator, worker auto-start, automatic apply/merge/close, child Change creation, ToolPolicy change, or Harness evolution automation.
- Scheduler runtime remains staged and bounded. Existing scheduler worker/result/validation/audit/rework/integration/completion gates do not authorize scheduler loops, whole-wave dispatch, slot allocation, automatic child Changes, automatic apply/merge, or a full parallel executor.
- Documentation entropy is now an explicit Harness concern: `AGENTS.md` is the routing map, `docs/STATUS.md` is the short handoff, `docs/ECL.md` owns reusable process rules, and archived summaries / `harness/changes/INDEX.json` own history.

## Next Resume Point

No active change or pending Harness evolution exists. Next structured work may start from `docs/design-docs/controlled-scheduler-loop.md` for a narrow implementation slice, or continue Goal Loop/Scheduler hardening, but any runtime loop/full executor/whole-wave/slot authority still requires a separate ECL implementation change. `README.md` remains unrelated and must stay untracked unless the user explicitly asks to include it.

## Verification Commands

Harness checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product checks:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

Documentation entropy checks for docs/Harness changes:

```powershell
(Get-Content -LiteralPath AGENTS.md -Encoding UTF8).Count
(Get-Content -LiteralPath docs/STATUS.md -Encoding UTF8).Count
rg "harness/changes/active/" AGENTS.md docs/STATUS.md
rg "Latest Harness evolution|Pending Harness evolution|Current active phase|Active ECL change" AGENTS.md docs/STATUS.md
```

## History Index

- Full generated index: `harness/changes/INDEX.json`
- Archive summaries: `harness/changes/archive/*/summary.md`
- Evolution proposals and results: `harness/evolution/proposals/`, `harness/evolution/results.tsv`
