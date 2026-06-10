# Review: Phase 8L Scoped WorkflowRun Boundary Split

Status: implementation reviewed; no blocking findings.

## Findings

- Planning review: scope is intentionally limited to WorkflowRun scoped guard
  repair and manager boundary split.
- Boundary review: direct reads and lifecycle writes should fail closed; list
  projections may skip invalid WorkflowRun artifacts.
- Runtime authority review: WorkflowRun remains runtime coordination/recovery
  evidence, not workflow truth.
- Implementation review: scoped guards are centralized in `src/workflow-run/guards.ts`;
  reads/listing are owned by `repository.ts`; event canonicalization and event
  reads are owned by `events.ts`; queue binding and recovery resume checks are
  owned by `lifecycle-sync.ts`.
- Test review: Workbench behavior tests cover misplaced WorkflowRun reads,
  projection-safe list skipping, forged event rows, canonical event append scope,
  and cross-queue lifecycle-sync rejection.

## Proposal / Runtime Boundary

- Authority classification: WorkflowRun is runtime evidence only.
- No-execution boundary: this change must not add actions, routes, scheduler
  behavior, parallel execution, automatic child Changes, or ODWF runtime.
- Stale/forged target behavior: cross-Change, misplaced, forged event, and
  cross-queue bindings must fail closed or be omitted from projection lists.

## Module Boundary

- Moved responsibilities: schemas, paths, repository, events, guards,
  recovery-key, proposal-start validation, lifecycle sync, stage resume, and
  summary helpers.
- Retained facade responsibilities: `src/workflow-run/manager.ts` re-exports
  compatibility symbols.
- Forbidden dependencies: new modules must not import the manager facade,
  Workbench, server, web UI, or CLI command modules.

## Verification

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: product and Harness verification passed.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
