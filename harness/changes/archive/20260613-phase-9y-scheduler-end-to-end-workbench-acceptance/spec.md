# Spec: Phase 9Y Scheduler End to End Workbench Acceptance

## Goal

Prove that the scheduler path from prepared plan through terminal SchedulerRun completion is recoverable, understandable, and correctly gated in the Workbench. The acceptance must exercise the existing source-root apply/discard gate rather than adding scheduler-owned source mutation behavior.

## Users

- AHO users confirming a main-agent generated parallel plan and later reviewing the scheduler result in the Workbench.
- AHO maintainers who need durable evidence that the user-facing confirmation queue, Workpad projection, and scheduler artifacts recover from disk and do not rely on hidden in-memory state.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 9X archived and Phase 9Y active, with no stale Phase 9X active/current claim.
- AC-002: Automated acceptance covers the scheduler happy path through `planning.scheduler.plan.prepare`, `planning.scheduler.worker.start-first`, current worker result/validation/audit, `planning.scheduler.worker.start-next`, second worker quality gate, `planning.scheduler.integration-candidate.compile`, `planning.scheduler.integration-check.run`, existing apply/discard confirmation, `planning.scheduler.integration-outcome.reconcile`, and `planning.scheduler.run.complete`.
- AC-003: Applied terminal branch records SchedulerIntegrationOutcome and SchedulerRunCompletion, marks SchedulerRun completed, and leaves no executable scheduler next-worker / IntegrationCheck / outcome / completion follow-up action.
- AC-004: Discarded terminal branch records SchedulerIntegrationOutcome and SchedulerRunCompletion as `completed-discarded`, marks SchedulerRun completed, and proves discard does not mutate source root.
- AC-005: Cold-read Workbench snapshot or lazy projection recovery is verified after key transitions: claim reservation, first candidate waiting state, second worker audit, IntegrationCheck passed, apply/discard, and SchedulerRunCompletion.
- AC-006: Confirmation queue semantics are verified: IntegrationCheck `passed` exposes only existing `apply-check.apply` / `apply-check.discard`; scheduler outcome is available only after existing apply/discard terminal state; completion removes executable scheduler follow-up actions.
- AC-007: Source apply safety is verified: scheduler handoff/outcome/completion do not mutate source; source mutation, when present, occurs only through existing `apply-check.apply`.
- AC-008: Scheduler runtime events / journal evidence cover candidate, handoff, outcome, and completion as projection/recovery evidence only; they do not authorize execution or apply.
- AC-009: Blocked/exhausted or insufficient-output states are treated as probes only: no source mutation, no scheduler loop, no next-worker auto-heal, no apply/merge/PR/child Change.
- AC-010: No new runtime/action/route/CLI command/scheduler loop/slot allocator/parallel executor/child Change/ODWF runtime/cache replay is introduced.
- AC-011: New or changed acceptance helpers do not put main implementation logic into broad facades such as Workbench chat/server/read-model shell/frontend shell or scheduler manager facades.
- AC-012: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No new scheduler capability beyond acceptance coverage and minimal bug fixes discovered by that coverage.
- No full UI redesign or new Workbench action surface.
- No terminal closeout gate for blocked/exhausted runs unless recorded as a follow-up candidate.
- No real manual Codex worker/UI acceptance requirement for close; if manual UI evidence is not feasible in this phase, an equivalent local Workbench projection record must be documented.

## Constraints

- `README.md` remains unrelated and untracked.
- Existing IntegrationCheck artifact paths, JSON shape, apply/discard behavior, decision/audit scope, Workbench projection shape, and SchedulerRun artifact shape remain compatible.
- SchedulerRunCompletion is terminal projection/evidence, not source mutation or merge authority.
- References remain inspiration only: AHO keeps Change/ECL, accepted artifacts, Run/Validation/Audit, IntegrationCheck apply/discard, and human gates as workflow truth.

## Risks

- Tests may need heavy fixture orchestration; keep helper logic test-owned and avoid encoding product behavior in test-only shortcuts.
- Existing Workbench confirmation queue may have hidden duplicate or stale action issues. If found, fix in the relevant owner module without widening scheduler runtime semantics.
- A real UI manual pass may be slow; automated Workbench snapshot/lazy projection evidence is acceptable if it covers the user-facing queue and details.

