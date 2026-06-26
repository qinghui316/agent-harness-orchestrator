# Project Status

## Current Handoff

- Current date: 2026-06-26.
- Active ECL change: none.
- Pending Harness evolution: `harness/evolution/pending.md`.
- Latest archived product audit: `harness/changes/archive/20260625-workbench-goal-loop-decision-surface-audit-v1/summary.md`.
- Latest archived product change: `harness/changes/archive/20260626-workbench-paged-virtual-transcript-with-pretext-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260626-workbench-local-scheduler-terminal-path-real-ui-scout-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260626-workbench-local-loop-scheduler-handoff-boundary-scout-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260626-workbench-local-landing-ready-terminal-close-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260626-workbench-integration-apply-outcome-completion-v1/summary.md`.
- Latest archived product acceptance: `harness/changes/archive/20260626-workbench-integration-applied-local-landing-close-real-ui-scout-v1/summary.md`.
- Previous repaired integration apply acceptance: `harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`.
- Previous IntegrationFix real UI acceptance: `harness/changes/archive/20260626-workbench-integrationfix-real-ui-acceptance-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260625-workbench-codex-backed-integrationfix-real-repair-v1/summary.md`.
- Previous scheduler progression: `harness/changes/archive/20260625-workbench-scheduler-worker-progression-to-integration-candidate-v1/summary.md`.
- Latest archived boundary guard: `harness/changes/archive/20260625-workbench-loop-per-change-boundary-guard-v1/summary.md`.
- Latest archived product acceptance: `harness/changes/archive/20260625-workbench-confirmation-feedback-real-ui-scout-v1/summary.md`.
- Previous archived product change: `harness/changes/archive/20260625-workbench-confirmation-feedback-to-rework-v1/summary.md`.
- Previous post-apply landing autonomy: `harness/changes/archive/20260625-workbench-post-apply-local-landing-autonomy-v1/summary.md`.
- Previous Codex Plan Mode + post-plan local autonomy: `harness/changes/archive/20260625-workbench-codex-plan-mode-post-plan-local-autonomy-v1/summary.md`.
- Previous post-plan local autonomy change: `harness/changes/archive/20260625-workbench-post-plan-scoped-local-autonomy-v1/summary.md`.
- Previous post-plan automation hardening: `harness/changes/archive/20260625-workbench-post-plan-scoped-automation-execution-v1/summary.md`.
- Previous planning/decomposition hardening: `harness/changes/archive/20260625-workbench-planning-decomposition-scope-honesty-v1/summary.md`.
- Previous external-local restore change: `harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
- Latest archived Harness docs change: `harness/changes/archive/20260625-document-minimality-gate-and-complexity-review/summary.md`.
- Previous scheduler integration apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.
- Latest real UI continuation scout: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest completed Harness evolution: `harness/changes/archive/20260626-auto-evolve-post-mode-aware-loop-window/summary.md`.
- Previous completed Harness evolution: `harness/changes/archive/20260625-auto-evolve-post-feedback-real-ui-window/summary.md`.
- Latest scheduler reachability change: `harness/changes/archive/20260625-workbench-low-conflict-taskgraph-scheduler-reachability-v1/summary.md`.
- Latest scheduler worker/integration acceptance: `harness/changes/archive/20260625-workbench-scheduler-worker-integration-real-acceptance-v1/summary.md`.
- Latest scheduler IntegrationCheck acceptance: `harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
- Latest scheduler integration apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.

Latest product closeout:
`harness/changes/archive/20260626-workbench-paged-virtual-transcript-with-pretext-v1/summary.md`.
It makes long Workbench conversations usable by adding paged transcript
projection reads, frontend virtual transcript rendering, long-message folding,
and `@chenglou/pretext` height estimation with fallback. The full transcript
projection remains available for compatibility. No central workflow database,
durable UI scroll/expanded state, new markdown renderer, workflow truth change,
or source/apply/close behavior change was added.

Previous product closeout:
`harness/changes/archive/20260626-workbench-local-scheduler-terminal-path-real-ui-scout-v1/summary.md`.
It composes the local scheduler terminal path through real in-app browser
acceptance: Codex Plan Mode, human plan confirmation with `完全访问权限`,
controlled scheduler workers, manual IntegrationCheck, human integration apply,
and local landing readiness. The run fixed two real blockers: local landing
now wins over stale scheduler/audit primary context, and landing attribution
now compares applied IntegrationCheck patches with a source-comparable diff
hash. The final visible primary gate is an explicit local close blocker:
`Review status is pending`. No central workflow DB, raw scheduler full-access
allowlist, PR/remote/merge, integration apply/discard automation, or Harness
evolution automation was added.

Previous product closeout:
`harness/changes/archive/20260626-workbench-local-loop-scheduler-handoff-boundary-scout-v1/summary.md`.
It verifies the local Goal Loop scheduler handoff boundary through real
in-app browser acceptance. `请求批准` waits on the real current gate. Scoped
`完全访问权限` can enter low-conflict scheduler work only through the existing
controlled scheduler wrapper, progressed two same-Change worker worktrees to a
ready `SchedulerIntegrationCandidate`, and then stopped at the manual
`planning.scheduler.integration-check.run` gate.

Previous product closeout:
`harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1/summary.md`.
It adds real in-app browser acceptance for the mode-aware local Goal Loop.
`请求批准` stopped at the real next gate after plan confirmation; scoped
`完全访问权限` completed a sequential local apply/landing/close path and stopped
with no primary gate; a low-conflict scheduler-shaped demand stopped before
raw scheduler preparation, preserving the intended boundary.

Previous product closeout:
`harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-v1/summary.md`.
It adds the first thin mode-aware local Goal Loop coordinator. Both
`请求批准` and `完全访问权限` observe the selected Change's current primary gate;
request-approval does not dispatch and leaves the real confirmation card for
the user, while full-access delegates only allowed local gates to existing
scoped automation after human plan confirmation. Plan confirmation, raw
scheduler actions, manual IntegrationCheck, integration apply/discard,
PR/remote/merge, and Harness evolution remain outside automatic execution.
Real browser acceptance was attempted but blocked by the local in-app browser
connector before navigation; DOM, targeted runtime, and daily Workbench
aggregate checks passed.

Previous product closeout:
`harness/changes/archive/20260626-workbench-local-landing-ready-terminal-close-v1/summary.md`.
It fixes the local terminal Workbench surface after a ready landing package:
when PR/remote are unavailable or out of scope, PR provider readiness no longer
becomes the selected Change primary gate. Workbench now surfaces local
`change.close` when the existing close gate is ready, or an explicit local
terminal blocker backed by the same close requirements when close is not ready.
PR provider readiness may remain background evidence.

Previous product acceptance:
`harness/changes/archive/20260626-workbench-integration-applied-local-landing-close-real-ui-scout-v1/summary.md`.
It verified the local post-integration-apply route through scheduler
outcome/completion and local `landing.prepare` on the E-drive external source.
The scout fixed shared untracked-file patch rendering so repaired IntegrationFix
patches that add new files can be attributed by landing review.

Previous product closeout:
`harness/changes/archive/20260626-workbench-integration-apply-outcome-completion-v1/summary.md`.
It completes the post-integration-apply surface. Deterministic fixture coverage
now applies a real `combined.patch` through `apply-check.apply`, confirms old
integration apply/discard gates disappear, advances through the existing
controlled scheduler outcome/completion wrappers, and lands on the real local
`landing.prepare` gate. `decisionInspector.primary` now aligns with the
authoritative `confirmationQueue.primary` for this selected-Change gate, while
Goal Loop fallback-only evaluation remains excluded from inspector primary.

Previous product acceptance:
`harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`.
It verified through the real Workbench UI that the Codex-backed repaired
IntegrationFix artifact can be manually applied to the E-drive external source
root. Before apply the source was clean and the visible primary gate was the
human integration apply card. After the browser confirmation, IntegrationCheck
`apply-check-20260625165935-fa41891a` became `applied`, source files reflected
the repaired result, and Workbench no longer showed the stale integration
apply/discard gate as primary. Integration apply/discard remains a human gate
outside scoped `完全访问权限`.

Previous product acceptance:
`harness/changes/archive/20260626-workbench-integrationfix-real-ui-acceptance-v1/summary.md`.
It verified the Codex-backed IntegrationFix path through real Workbench UI in
`E:\aho-accept\integrationfix-real-ui-v1`: two same-Change scheduler worker
worktrees reached a ready candidate, IntegrationCheck hit a real aggregate
validation failure, Codex repaired the integration checkout, aggregate
validation/audit passed, and Workbench stopped at the human integration
apply/discard gate. Marker-only repair was not used as product acceptance.

Previous product closeout:
`harness/changes/archive/20260625-workbench-codex-backed-integrationfix-real-repair-v1/summary.md`.
It upgrades IntegrationFix from marker-only repair to Codex-backed bounded
repair in the integration fix checkout. Failed conflict, aggregate validation,
or aggregate audit paths can now create a repaired artifact only after Codex
produces a real checkout diff and aggregate validation/audit pass.

Previous product closeout:
`harness/changes/archive/20260625-workbench-scheduler-worker-progression-to-integration-candidate-v1/summary.md`.
It confirmed that existing scheduler owners already cover same-Change
two-worker progression to a ready `SchedulerIntegrationCandidate`. The only
product fix was stop evidence honesty: when bounded controlled continuation
lands on the manual `planning.scheduler.integration-check.run` gate at the
step budget, scoped automation now records `terminal-human-gate` instead of
misleading `max-steps`. Raw scheduler actions remain outside direct
`完全访问权限`.

The latest archived product audit is at
`harness/changes/archive/20260625-workbench-goal-loop-decision-surface-audit-v1/summary.md`.
It verified the existing Goal Loop decision surface without adding product code:
Goal Loop evidence remains explanation/assisted-gate context over the
authoritative Workbench `confirmationQueue.primary`, and it does not become a
new decision engine or execution authority.

The latest archived product change is at
`harness/changes/archive/20260625-workbench-confirmation-feedback-to-rework-v1/summary.md`.
It implements confirmation-point feedback routing for two V1 loops:
plan-confirm feedback records a scoped decision and routes to existing
`planning.revise`; result/apply feedback records a scoped decision and routes
to existing bounded `result.refresh-rework`. Feedback is evidence, not approval:
it does not write canonical planning artifacts, apply source root, close,
remote, merge, PR, or Harness evolution. Unsupported confirmation feedback
remains record-only.

The latest real UI acceptance scout is at
`harness/changes/archive/20260625-workbench-confirmation-feedback-real-ui-scout-v1/summary.md`.
It verified both V1 feedback loops in an E-drive external sandbox. Plan-confirm
feedback routed to `planning.revise` and returned to plan confirmation without
prematurely accepting canonical artifacts. Result/apply feedback routed to
bounded `result.refresh-rework`; source root stayed clean before apply. The
scout fixed one projection blocker: a newer validation/audit blocker now
prevents older same-Change worktree apply approvals from remaining current
primary gates.

The previous post-apply landing autonomy change is at
`harness/changes/archive/20260625-workbench-post-apply-local-landing-autonomy-v1/summary.md`.
It extends scoped post-plan local automation by allowing the existing local
`landing.prepare` gate after local `result.apply`. The action remains selected
Change scoped, current-gate revalidated, and local evidence/readiness only. If
the next gate is local `change.close`, automation may close; if the next gate
is PR, remote, merge, post-merge, integration apply/discard, Harness evolution,
or a blocker, automation stops and returns the real gate to the user. This
change was verified by targeted automation/revalidation/read-model/DOM suites
and the daily Workbench aggregate; no new real UI acceptance is claimed.

The previous Codex Plan Mode + post-plan autonomy change is at
`harness/changes/archive/20260625-workbench-codex-plan-mode-post-plan-local-autonomy-v1/summary.md`.
It routes Workbench planning through Codex proposal mode where available and
stores the raw `proposedPlanMd` as proposal evidence. In the accepted E-drive
run, native PlanDelta was unavailable, so AHO used the prompt-level
`<proposed_plan>` fallback. Plan confirmation remains human-only. When the
user confirms the plan with `完全访问权限`, the existing scoped automation
runtime can continue through local execution, validation/audit, safe
`audit.accept`, local `result.apply`, and local `change.close`, then stop with
no primary gate after archive. The real E-drive acceptance used
`E:\aho-accept\codex-plan-post-auto-v1-clean4` and produced local apply commit
`fc35509` without running remote, merge, PR, integration apply/discard, raw
scheduler, or Harness evolution actions.

The previous product hardening is at
`harness/changes/archive/20260625-workbench-post-plan-scoped-automation-execution-v1/summary.md`.
It tightens scoped `完全访问权限` so `planning.confirm-execution` cannot be
automated. Plan confirmation remains human-only, while existing post-plan
execution-stage gates continue through scoped automation.

The previous planning/decomposition hardening is at
`harness/changes/archive/20260625-workbench-planning-decomposition-scope-honesty-v1/summary.md`.
It tightens low-conflict scheduler readiness: accepted planning and
DecompositionPlan scopes must stay within explicit user source constraints, and
unaccepted expansion into tests, docs, indexes, or other files blocks
`ready-for-scheduler-contract`.

The previous external-local restore change is at
`harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
It fixes direct `workbench serve <sourcePath>` restore for old E-drive
sandboxes when marker and `AHO_HOME/projects/<projectId>` memory match.

The latest archived scheduler integration apply/discard hardening is at
`harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.
It hardens the final scheduler IntegrationCheck human decision. Apply keeps the
existing source clean, HEAD, artifact hash, aggregate validation, and audit
guards. Discard now fails closed at the handler for terminal or non-discardable
check states. Targeted and Workbench aggregate tests passed.

Previous scheduler IntegrationCheck acceptance is at
`harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
It verifies the scheduler IntegrationCheck handoff on an E-drive external
source with dependencies installed as acceptance setup. The real browser UI run
used ordinary planning, manual confirmation, `完全访问权限`, Goal Loop
preparation, and controlled scheduler continuation to reach two real
`coder-codex` worker worktrees, worker validation/audit, and a ready integration
candidate. The raw `planning.scheduler.integration-check.run` gate remained
manual. After manual confirmation, existing IntegrationCheck ran aggregate
validation/audit, passed, and stopped at the existing human integration
apply/discard gate.

The latest Harness evolution handled the five-archive window ending with
`20260625-workbench-goal-loop-decision-surface-audit-v1`. Authorized subagent
review recommended `noop` with score 89: existing ECL/template/handoff rules
already cover the lessons, so no durable ECL/template/lint/docs/product runtime
change was applied. It is archived at
`harness/changes/archive/20260625-auto-evolve-post-goal-loop-decision-surface-window/summary.md`.

## Current Baseline

The accepted product baseline is a local, manual-gated Workbench loop: ordinary
demand conversation, planning, decomposition/readiness, real `coder-codex`
`code.run`, validation/audit, result review, human-confirmed apply, and
human-confirmed close/archive have all passed real browser acceptance in
external sandboxes.

Bounded continuation V1 is implemented only for matching controlled Scheduler
gates. One explicit Workbench confirmation may run a small step budget and must
stop at blockers, unsupported gates, high-impact human gates, or budget limits.
It is not full-auto, not a parallel executor, and not automatic
apply/merge/close.

Two-tier scoped automation V1 is implemented for the ordinary Workbench
decision surface. A user can keep per-step `请求批准`, or choose
`完全访问权限` on the plan confirmation card as the post-plan execution mode.
The plan is still manually confirmed. V1 repeatedly consumes the current
authoritative `confirmationQueue.primary` only when the action is in the local
allowed set. It can run bounded local execution/recovery gates, accept safe
approved audit evidence through `audit.accept`, apply the local result, run
local `landing.prepare`, and close/archive the local Change. It does not
auto-run planning confirmation,
raw scheduler actions, integration apply/discard, merge, push, PR, remote
landing, or Harness evolution.

Scheduler worker and IntegrationCheck acceptance now verifies that strict
independent source scopes can continue past worker start when the external
source has dependencies installed. Two workers produced ready worktree outputs,
validation passed, audit approved, the integration candidate was ready, and
IntegrationCheck passed aggregate validation/audit before stopping at the human
integration apply/discard gate. This is still bounded scheduler execution, not
full parallel executor behavior.

External-local restore is now implemented for direct `workbench serve <path>`
sessions. Reopening an E-drive source with a valid marker and matching
`AHO_HOME` rehydrates the project, conversations, and current gate without
writing the registry or mutating the source root.

Verification baseline: daily `npm run test:workbench` is the fast Workbench
unit-capability gate. Heavier full-chain scheduler/apply/Goal Loop coverage is
kept in `npm run test:workbench:release` and other explicit slow/deep package
scripts.

## Next Resume Point

Active change: none.

Pending Harness evolution:
`harness/evolution/pending.md`.

Latest product closeout:
`harness/changes/archive/20260626-workbench-paged-virtual-transcript-with-pretext-v1/summary.md`.

Latest real UI acceptance:
`harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1/summary.md`.

Next product work should build on existing Workbench gate/action/runtime owners.
Good candidates are either a focused closeout-quality hardening slice for
auto-closed archive summaries, or the next explicitly bounded local
Goal-Loop/scheduler capability. Do not widen `完全访问权限` into raw scheduler,
manual IntegrationCheck, integration apply/discard, PR/remote/merge, Harness
evolution, or full parallel execution without a separate structured change.

Latest completed Harness evolution:
`harness/changes/archive/20260626-auto-evolve-post-mode-aware-loop-window/summary.md`.
Decision: `docs_merge`. Subagent Aquinas scored the window `86/100`.
`harness-evolve mark-complete` removed `pending.md`, advanced the archive
counter to `492`, and recorded the result in `results.tsv`. No new
ECL/template/lint/product runtime rule was made; only compact current-doc
alignment was applied.

After this evolution, product work should continue from existing Workbench
gate/action/runtime owners rather than adding a new framework.

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
npm run test:integration
npm run test:workbench
npm run test:workbench:release
```

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with
archived `summary.md` files; open specs, plans, reviews, or source only when the
current task needs that evidence.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
