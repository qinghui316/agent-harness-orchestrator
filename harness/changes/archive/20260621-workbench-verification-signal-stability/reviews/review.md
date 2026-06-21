# Review: workbench-verification-signal-stability

Status: approved.

## Findings

No blocking findings.

One real product defect was found and fixed during diagnostics: controlled Scheduler continuation incorrectly failed closed on all prior post-step readiness warnings. The fix is intentionally narrow: only the known recoverable warning emitted when an IntegrationCheck handoff waits on the existing apply/discard gate may proceed to fresh current-transition revalidation. Arbitrary warning evidence still fails closed.

## Verification

Selected verification scope: touched scheduler continuation guards, Workbench App DOM test, split scheduler slow suites, Workbench script membership, aggregate Workbench gate, product gates, and Harness checks.

Passed before close/handoff:

- `npx vitest run tests/unit/controlled-scheduler-boundary-continuation.test.ts tests/unit/controlled-scheduler-step-contract.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npm run test:workbench:slow:scheduler`
- `npm run test:workbench:slow`
- `npm run test:workbench`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`

Harness checks passed before close and are rerun after handoff updates: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-change status`, and `harness-evolve check`.

## Acceptance Feedback

- Real/manual acceptance performed: no manual UI session; deterministic DOM and slow Workbench flows were used.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: initial full slow aggregate failed in `workbench-goal-loop-prompt-flow` because the suite still expected bare scheduler validation actions. The test was corrected to inspect controlled-advance wrapped concrete gates, then the suite, slow aggregate, and full Workbench aggregate passed.
- External source/state safety: covered through isolated temporary fixtures in scheduler discard and apply/integration slow suites; repository source root was not part of these acceptance flows.
- Remote handoff acceptance: not changed; existing remote slow suite remained passing.
- Product-fixable follow-up: scheduler slow tests are now attributable but still expensive. Future work can reduce test runtime without changing this change's pass/fail trust result.

## Documentation Entropy Coverage

- Applicable: yes, because close/handoff updates will change active/latest archive and next recommended work.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Before/after line counts:
  - `AGENTS.md`: 163 -> 163.
  - `docs/STATUS.md`: 120 -> 112.
  - `docs/CURRENT-DEVELOPMENT-PLAN.md`: 102 -> 111.
- Duplicate current-state fields checked: active change, pending evolution, latest product archive, latest Harness evolution, active phase, and next recommended work.
- Roadmap/current-direction stale language checked: full-auto remains Later Roadmap; current next work is no longer "fix Workbench aggregate flake" after this closes.
- Archive-ledger decision: detailed verification remains archive-only in this summary/review; entry/handoff docs keep only current state and next resume point.
- Over-budget documents: `docs/STATUS.md` remains a short handoff, while `docs/CURRENT-DEVELOPMENT-PLAN.md` remains the roadmap carrier.
- Tested with: close/handoff greps and Harness lint in the close pass.

## Experience Lifecycle Coverage

- Applicable: yes for handoff memory, not for Harness evolution.
- Promote: no new ECL rule; existing rules already required aggregate verification and close-ready review coverage.
- Retain: keep the rule that controlled Scheduler evidence remains non-executing and one-confirmation-per-legal-transition.
- Merge: test-stability guidance is merged into the current plan's Workbench test architecture note rather than repeated in entry docs.
- Retire: stale current-next wording about fixing Workbench aggregate flake will be retired after this closes.
- Archive-only: exact slow-suite timings and the initial failed slow run stay in this review/summary.

## Worktree Diff Artifact Coverage

- Applicable: no.
- Reason: this change does not affect worktree diff collection, diff-producing run artifacts, validation diff hashes, audit diff review, apply preview/apply gates, or Spec-Test generation.

## Read Model Projection Coverage

- Applicable: yes.
- Checked scope: confirmation queue and Workpad nextAction projections for scheduler gates after controlled-advance wrapping.
- Tested with: split scheduler slow suites, `workbench-goal-loop-prompt-flow`, `workbench-scheduler-worker-runtime`, and `npm run test:workbench`.
- Result: primary queue exposes implemented controlled-advance actions for concrete scheduler gates; tests no longer require stale bare-gate UI actions.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: Workbench confirmation queue and App run-graph tab.
- Implemented paths verified: scheduler primary actions route through `planning.scheduler.controlled-advance.run`; run-graph tab waits on rendered DOM state.
- Out-of-scope future capability check: no full-auto, scheduler loop, parallel executor, merge queue, slot allocator, whole-wave dispatch, or child Change auto creation was added.
- Duplicate primary action check: slow scheduler and Goal Loop prompt tests verify concrete scheduler gates are represented through one controlled-advance primary path rather than stale duplicate bare actions.
- High-impact action path result: source apply, close/archive, remote handoff, and Harness evolution remain human-gated.
- Tested with: `tests/unit/web-app.test.tsx`, `npm run test:workbench:slow`, `npm run test:workbench`, and `npm run test:fast`.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: `changeId`, `schedulerRunId`, `schedulerClaimReservationId`, `schedulerWorkerStartId`, `schedulerWorkerResultId`, `schedulerWorkerValidationId`, `schedulerWorkerAuditId`, `schedulerIntegrationCandidateId`, `schedulerIntegrationCheckHandoffId`, and `goalLoopCurrentGateActionType` where applicable.
- Tested action paths: scheduler worker start/result/validation/audit, integration candidate/check/outcome, run completion, and controlled-advance wrapper.
- Duplicate action/evidence affordance check: scheduler and Goal Loop prompt slow suites assert concrete scheduler gates are found through the wrapper, while evidence actions remain separate.
- Result: missing, stale, forged, or cross-target actions continue to fail closed via existing revalidation; this change did not add a fallback to global active state.

## Transcript Renderer Source-Boundary Coverage

- Applicable: no.
- Reason: this change does not alter the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Applicable: yes, because the Workbench slow aggregate includes apply, IntegrationCheck, discard, and remote handoff safety paths.
- Checked source project / fixture: isolated temporary Workbench fixture roots created by the slow suites.
- Source-root mutation gate checked: scheduler discard and apply/integration suites verify no source mutation before explicit apply/discard decisions; apply remains human-confirmed.
- Out-of-scope source mutation check: controlled Scheduler guard fix does not authorize apply/merge/close/source mutation.
- Tested with: `workbench-scheduler-discard-completion-flow`, `workbench-apply-integration-flow`, `workbench-remote-landing-flow`, and `npm run test:workbench`.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Checked boundary: controlled Scheduler boundary/runtime evidence remains prior-turn evidence and does not become loop authority.
- Result: recoverable warning handling only allows a fresh revalidation path for the current concrete gate; it does not dispatch automatically or bypass ToolPolicy/human gates.
- Tested with: controlled scheduler unit tests and scheduler slow aggregate.

## Proposal / Runtime Boundary Coverage

- Applicable: yes.
- Artifact type and authority classification: Goal Loop/preflight/controlled Scheduler evidence remains non-executing evidence; concrete Scheduler gates remain executable only through scoped human confirmation.
- Boundary matrix checked: wrapper action carries explicit target ids; server/runtime revalidates fresh gate evidence; stale/forged/cross-change targets fail closed.
- Out-of-scope execution paths checked: no scheduler loop, whole-wave dispatch, source apply, close/archive, or full-auto path was added.
- Tested with: controlled scheduler unit tests, Workbench slow scheduler suites, and Workbench aggregate.

## Goal Loop Boundary Coverage

- Applicable: yes.
- Checked scope: selected Change / current scheduler gate / fresh packet-policy-preflight evidence.
- Recommendation authority checked: Goal Loop routing remains prompt/context evidence only; primary execution stays with concrete Workbench actions.
- Fallback priority checked: concrete scheduler gates are represented by controlled-advance primary actions; Goal Loop evidence/detail actions do not replace execution authority.
- Tested with: `workbench-goal-loop-prompt-flow`, `controlled-scheduler-boundary-continuation`, and `npm run test:workbench`.

## Module Boundary Coverage

- Applicable: yes.
- Module owners checked:
  - Test topology: `tests/slow/*` and `package.json`.
  - App DOM test: `tests/unit/web-app.test.tsx`.
  - Fixture isolation: `tests/unit/workbench/fixtures.ts`.
  - Controlled continuation guard: `src/scheduler-runtime/controlled-loop-continuation-decision.ts` and `src/workflow-scheduler/controlled-step.ts`.
- Moved responsibilities: scheduler slow coverage moved out of the residual monolith into capability-domain files.
- Retained facade responsibilities: Workbench/server facades were not given new main logic.
- Compatibility surface: `test:workbench` and `test:workbench:slow` remain available; `test:workbench:unit` and `test:workbench:slow:scheduler` provide explicit layers.
- Tested with: ESLint, targeted unit tests, slow scheduler aggregate, full Workbench aggregate, and build.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused or strengthened: existing Vitest suites, shared Workbench fixtures, npm script gates, controlled Scheduler current-transition revalidation, and existing Workbench confirmation queue projection.
- New cross-cutting mechanism and owner: none.
- Domain-specific logic location: scheduler test scenarios stay under `tests/slow`; guard logic stays in scheduler-owned modules.
- Shared cross-cutting logic location: fixture cleanup remains in `tests/unit/workbench/fixtures.ts`.
- Local framework avoided: no new evidence family, summary layer, Goal Loop layer, local state machine, or fake automation.
- Future-cost result: aggregate failures now identify a capability-domain slow suite instead of a residual monolith.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: `rg "harness/changes/active/workbench-verification-signal-stability|Active ECL change: `workbench-verification-signal-stability`|Active change: `workbench-verification-signal-stability`|Active product phase: Workbench Verification Signal Stability|Next action for the active change|fix the App DOM fetch mock flake|aggregate-only DOM `fetch` mock flake" AGENTS.md docs/STATUS.md docs/CURRENT-DEVELOPMENT-PLAN.md harness/changes/archive/20260621-workbench-verification-signal-stability -n` only found this archived review evidence line; current handoff docs had no stale active path or stale next-step wording.
- Latest archive / active path alignment: `AGENTS.md` and `docs/STATUS.md` point to `harness/changes/archive/20260621-workbench-verification-signal-stability/summary.md`; no active change remains.
- Pending evolution state checked: none.

## Remote Handoff Acceptance Coverage

- Applicable: no for new behavior.
- Reason: this change does not alter Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence. Existing remote slow coverage remained passing inside `npm run test:workbench`.
