# Plan: Maintenance Canonical Patch Lineage Reuse

## Approach

Implement a behavior-preserving owner extraction for canonical patch lineage and operation-alignment guards. The helper should only own fail-closed relationship checks among existing canonical patch artifacts; it must not own artifact construction, rendering, persistence, authorization, target-boundary checks, or patch application.

## Steps

1. Add `src/agent-task/canonical-patch-lineage.ts` with small exported guard functions.
2. Move gate/proposal, manifest/gate/proposal, manifest-operation/proposal-operation, result/manifest, and report-operation/manifest-operation checks into that module.
3. Update `canonical-patch-application.ts` and `canonical-patch-application-report.ts` to reuse the guard functions.
4. Preserve current error wording and test-covered behavior. If direct result/report operation mismatch coverage is weak after the move, add one focused forged/stale-lineage test.
5. Run targeted agent-task tests, typecheck, lint, broader test/build as appropriate, and Harness checks before close.

## Decisions

- Subagent plan self-evaluation returned `PASS` before ECL creation.
- Keep the owner under `src/agent-task`, because canonical patch artifacts and maintenance internals already live there.
- Do not introduce a generic cross-product lineage framework in this slice.
- Do not move human-gate / ToolPolicy authorization, target-boundary logic, patch content application, artifact build/render/write, or ledger event policy.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-lineage.ts`.
- New / moved responsibilities: canonical patch lineage and operation-alignment guards across gate/proposal, manifest/gate/proposal, manifest/proposal operation, result/manifest, and report/result operation checks.
- Facade touch points: none expected; `src/agent-task/manager.ts` remains unchanged.
- Forbidden write-back locations: Workbench, server, frontend, scheduler, Goal Loop, broad manager facades, reference projects, and target-boundary helper.
- Compatibility surface: maintenance artifact schemas, Markdown evidence, ledger event types, public manager exports, Workbench/server/frontend behavior, and human-gate / ToolPolicy behavior stay stable.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts` plus typecheck/lint.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing maintenance canonical patch chain, target-boundary owner, and agent-task boundary tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: lineage/alignment validation currently exists as local helper code in application and report modules.
- Domain-specific logic location: proposal/manifest/result/report builders, Markdown rendering, persistence, authorization, patch application, and ledger recording remain in existing modules.
- Shared cross-cutting logic location: `src/agent-task/canonical-patch-lineage.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids separate per-stage lineage/alignment guard implementations in canonical patch application and report handling.
- Future-cost reduction for similar features: future canonical patch artifact stages can reuse one fail-closed lineage owner instead of copying relationship checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

No blocker. Plan self-evaluation requested that the lineage helper remain narrow and not absorb authorization, target-boundary, patch application, artifact rendering/writing, or ledger policy.

