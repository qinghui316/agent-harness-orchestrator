# Plan: Maintenance Canonical Patch Target Boundary Reuse

## Approach

Implement the first Architecture Growth Control sample as a behavior-preserving owner extraction inside `src/agent-task`. The smallest shared mechanism is canonical patch target boundary handling: relative path normalization, memory-root containment, existing-file resolution, content hashing, target-kind path boundaries, and descriptor validity checks.

## Steps

1. Add a focused `src/agent-task/canonical-patch-target-boundary.ts` module for shared canonical patch target helpers.
2. Update `canonical-patch-targets.ts` to reuse the shared helper while preserving unsafe hint `null` behavior.
3. Update `canonical-patch-application.ts` to reuse the shared helper while preserving fail-closed throwing behavior, stale hash checks, and content patch application behavior.
4. Add or adjust targeted tests in `tests/unit/agent-task-boundaries.test.ts` if existing assertions do not directly cover the shared helper behavior.
5. Run targeted maintenance tests, typecheck, lint, Harness checks, and close-ready review.

## Decisions

- The plan self-evaluation subagent returned `PASS` before ECL creation.
- Keep the owner inside `src/agent-task`, because Phase 8A already assigns maintenance internals there.
- Do not add a generic filesystem/path helper outside the maintenance domain in this slice; the reuse target is canonical patch boundary logic only.
- Keep `templates/core-harness`, reference projects, Workbench/server/frontend, scheduler, Goal Loop, and artifact schemas out of scope.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-target-boundary.ts`.
- New / moved responsibilities: canonical patch target path normalization, safe memory-root target resolution, content hashing, target-kind path boundary, and descriptor/patch payload validity helpers.
- Facade touch points: `src/agent-task/manager.ts` remains unchanged unless existing exports require no change; direct callers stay inside `src/agent-task`.
- Forbidden write-back locations: Workbench, server, frontend, scheduler, Goal Loop, and broad manager facades must not own this boundary logic.
- Compatibility surface: maintenance artifact schemas, markdown evidence, ledger event types, and public manager exports stay stable.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts` plus typecheck/lint.
- Follow-up split candidates: later maintenance artifact/lineage helper only if this target-boundary sample stays stable.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `src/agent-task` maintenance owner modules, existing canonical patch artifacts, existing tests, ECL Module Boundary and Core Mechanism Reuse gates.
- Why existing mechanisms are insufficient if a new mechanism is proposed: target/path/hash validation currently exists as two local helper sets in descriptor generation and application validation.
- Domain-specific logic location: canonical update, patch proposal, application manifest/result/report builders stay in their current modules.
- Shared cross-cutting logic location: `src/agent-task/canonical-patch-target-boundary.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids separate local target/path/hash/descriptor validation systems in each canonical patch stage.
- Future-cost reduction for similar features: future maintenance patch stages can reuse one target-boundary owner instead of duplicating path and stale-hash safety code.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

No blocker. The only planning constraint is preserving descriptor generation's `null` behavior while application validation continues to throw explicit fail-closed errors.

