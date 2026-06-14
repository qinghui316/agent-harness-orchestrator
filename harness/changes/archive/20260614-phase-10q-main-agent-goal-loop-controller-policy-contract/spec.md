# Spec: Phase 10Q Main Agent Goal Loop Controller Policy Contract

## Goal

Add a scoped, non-executing controller policy contract for the Main Agent Goal Loop. The contract reads the latest Goal Loop packet and the current visible Harness gate context, then writes evidence that classifies the safe next control posture.

## Users

- The main Agent, which needs a durable "what should I do next" policy record before continuing a long-running Goal/Change.
- The user, who should see that the system is recommending or suppressing a next step without silently executing it.
- Future scheduler/runtime work, which must consume explicit evidence instead of relying on chat memory.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 10P closed and Phase 10Q active.
- AC-002: Goal Loop controller policy evidence is owned by `src/goal-loop` and persisted as JSON/Markdown with latest pointer files.
- AC-003: Controller verdicts are non-executing and never call Workbench action handlers, scheduler/runtime services, validation/audit, IntegrationCheck, apply/close, or source mutation paths.
- AC-004: A fresh packet matching the current concrete Harness gate produces `recommend-existing-gate`.
- AC-005: A stale packet or mismatched visible gate produces suppress/wait evidence instead of creating a fallback executable action.
- AC-006: Waiting/blocked/ready-for-close packet states are preserved as policy verdicts without becoming execution authorization.
- AC-007: Workbench read model may display the latest controller verdict summary, but the primary Harness gate remains the existing scoped confirmation item.
- AC-008: Old imports from `src/goal-loop/manager.ts` remain compatible.
- AC-009: New Goal Loop modules do not depend on Workbench/server/web/CLI command modules or broad facades.
- AC-010: Product and Harness verification passes, or pre-existing failures are explicitly recorded.

## Non-Goals

- Do not add a full Goal Loop executor.
- Do not auto-run any recommended action.
- Do not create workers, TaskRuns, WorkerLeases, worktrees, runs, child Changes, scheduler loops, slot allocators, or parallel executor behavior.
- Do not bypass ToolPolicyGate, server stale-target revalidation, or human gate semantics.
- Do not make Goal Loop controller evidence workflow truth.

## Constraints

- Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close gates remain workflow truth.
- Controller policy must be derived from current evidence and must fail closed on stale or mismatched packet/gate scope.
- Main logic must stay in an owned Goal Loop module; Workbench/server/frontend changes must remain thin read/action surface wiring.
- `README.md` remains unrelated and untracked.

## Risks

- Risk: controller evidence could be confused with execution authorization. Mitigation: fixed `executionStarted: false`, explicit authority string, tests asserting no execution artifacts.
- Risk: continuing to add logic to the existing compiler could make a new large mixed-responsibility file. Mitigation: add a dedicated controller policy module.
- Risk: stale Goal Loop guidance could be shown beside a different Harness gate. Mitigation: controller compiler checks current gate parity and records suppressed/wait verdicts.

