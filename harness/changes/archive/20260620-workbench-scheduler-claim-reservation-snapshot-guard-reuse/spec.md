# Spec: workbench-scheduler-claim-reservation-snapshot-guard-reuse

## Goal

Reduce repeated scheduler claim-reservation stale-target logic in Workbench action boundary by reusing a scheduler-runtime owned guard. The change should make the existing safety rule easier to audit without changing what scheduler actions accept or reject.

## Users

- Future AHO development agents extending scheduler/Workbench action gates.
- Maintainers reviewing stale-target and lineage safety in scheduler runtime and Workbench boundaries.

## Acceptance Criteria

- AC-001: `src/scheduler-runtime/guards.ts` exposes a reusable guard that validates the current claim reservation id, its reconcile snapshot lineage, and the latest runtime-state reconcile snapshot relationship.
- AC-002: Workbench scheduler action boundary replaces fully equivalent hand-written claim-reservation/snapshot latest checks with the shared scheduler-runtime guard while preserving request target, status, worker/candidate/handoff/outcome, ToolPolicyGate, and human-gate behavior.
- AC-003: Targeted tests cover direct guard success and failure paths, including reservation id mismatch, reservation snapshot mismatch, runtime latest snapshot mismatch, and required status mismatch.
- AC-004: Boundary tests confirm Workbench reuses the shared guard and does not reintroduce the repeated hand-written reservation/snapshot comparison pattern.
- AC-005: Review records Module Boundary and Core Mechanism Reuse coverage, plus targeted verification and full-test skip rationale.

## Non-Goals

- Do not implement a scheduler loop, parallel executor, worker-slot allocator, automatic IntegrationFix, apply, merge, close, or Harness evolution behavior.
- Do not add a Workbench-local guard framework or feature-local stale-target state machine.
- Do not alter artifact schemas, persisted scheduler runtime records, Workbench API payload shapes, or user-facing UI.
- Do not include unrelated `README.md`.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- `src/scheduler-runtime/guards.ts` is the owner for scheduler runtime lineage/stale-target guard logic and must not depend on Workbench, server, web, CLI command modules, or manager facades.
- Workbench boundary remains an action revalidation surface; it may call shared guards but must keep explicit request target checks and fail-closed behavior.
- Verification is targeted-first; full suites are run only if the implementation changes broader runtime behavior.

## Risks

- Weakening stale revalidation if the new guard checks only reservation id and not the reconcile snapshot relationship.
- Over-expanding the change into broad scheduler runtime refactoring instead of a narrow repeated-pattern reuse.
- Brittle string tests if they become the only behavioral evidence; direct guard behavior tests are required.
