# Spec: workbench-demand-to-execution-golden-flow

## Goal

Verify and repair the Workbench front-half golden flow from ordinary demand intake through planning confirmation, decomposition/readiness, direct code execution, validation/audit evidence, and result review. The user should experience this as one manual-gated demand conversation, not as ECL/Scheduler/Goal Loop internals.

## Users

- Primary: a local developer using the Workbench main conversation to ask for a code change.
- Secondary: future agents resuming this repo who need exact handoff evidence for the product baseline before any full-auto work.

## Acceptance Criteria

- AC-001: From the Workbench main demand conversation, a natural-language user request can create or select the scoped demand/topic/change without requiring the user to understand ECL, Change, Workpad, Scheduler, or Goal Loop terminology.
- AC-002: `planning.generate` produces a visible planning draft and scoped proposal evidence that can be confirmed from the Workbench action path.
- AC-003: `planning.confirm-execution` writes canonical `spec.md`, `plan.md`, `tasks.md`, and `ac-map.json`, records `executionStarted=false`, and does not start coder/runtime execution.
- AC-004: After planning confirmation, the Workbench exposes the real next decomposition/readiness gates in order, with one current primary confirmation and full target ids.
- AC-005: `planning.decompose`, `planning.decomposition.confirm`, and `planning.decomposition.assess-readiness` preserve scoped ids through UI/read-model, server forwarding, action handlers, and stale-target revalidation.
- AC-006: `code.run` is visible only when the latest readiness allows `nextAllowedAction = "code.run"`; its payload includes `changeId`, `readinessManifestId`, and task scope ids when applicable.
- AC-007: `code.run` reaches the existing main-agent tool orchestration path and produces result evidence that can feed existing validation, audit, and result-review/apply surfaces.
- AC-008: Validation/audit/result review evidence after the front-half run can connect to the previously proven `result.apply` and `change.close` path without auto-apply or auto-archive.
- AC-009: The confirmation queue and default UI do not show fake full-auto, parallel executor, merge queue, slot allocator, whole-wave dispatch, automatic child Change creation, or unsupported remote merge/push actions.
- AC-010: Missing, stale, forged, or cross-change targets for planning/decomposition/readiness/code actions fail closed instead of falling back to global active state.
- AC-011: Source root is not modified before explicit human apply confirmation; any source mutation in acceptance occurs only through the already gated apply path.

## Non-Goals

- Implementing full-auto task mode.
- Implementing a scheduler loop, whole-wave dispatch, slot allocator, full parallel executor, or child Change auto creation.
- Automatically applying, closing, archiving, merging, pushing, or creating/updating remote PRs.
- Creating new read-only evidence families, summary layers, Goal Loop authority, or fake automation buttons.
- Reworking unrelated scheduler or Goal Loop paths unless a targeted test proves they block this Workbench front-half flow.

## Constraints

- Workbench main surface and Workbench action path are the acceptance entry point; CLI-only success is not enough.
- Existing human gates remain: source apply, close/archive, remote handoff, and Harness evolution cannot auto-execute.
- Planning/decomposition/code actions belong in `src/workbench/actions/handlers/*`.
- Server forwarding and stale revalidation belong in `src/server/workbench/actions.ts` and existing target revalidation paths.
- Confirmation queue/read model behavior belongs in Workbench projection owners, not broad facades.
- Code execution must reuse `runMainAgentToolOrchestration` and existing validation/audit/result review/apply/close mechanisms.
- `README.md` remains unrelated and untracked.

## Risks

- Existing tests may cover individual action handlers but not the full front-half user path; the main risk is a false positive from CLI-level or fixture-only coverage.
- Slow Workbench golden-flow acceptance can be brittle if it depends on real Codex runtime; prefer deterministic fixtures/fake runner where existing test patterns allow.
- If a real path gap is large, this change should record a concrete blocker and next product slice rather than adding another explanation/projection layer.
