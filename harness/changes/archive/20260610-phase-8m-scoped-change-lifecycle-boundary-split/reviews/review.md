# Review: Phase 8M Scoped Change Lifecycle Boundary Split

Status: approved.

## Findings

- Boundary gap: Change metadata scope must be guarded outside
  `change/manager.ts` as well, because Workbench topic projection and
  thread-log import read `change.json` independently.
- Scope decision: active/parking metadata mismatches are strict failures;
  projection may omit/fallback, but must not expose forged metadata.
- Archive decision: valid archive lookup by metadata id must remain supported,
  but archived metadata must have archived state and matching `archivePath`
  when present.

## Proposal / Runtime Boundary

- Authority classification: Change/ECL remains workflow truth.
- No-execution boundary: this phase does not add execution capability or new
  user actions.
- Stale/forged behavior: forged or misplaced metadata must fail closed in
  status/lifecycle and must not become selected-demand projection truth.

## Module Boundary

- Moved responsibilities: schemas/types, paths, metadata, templates,
  repository, creation, status, close-gate, lifecycle, and guards.
- Retained facade responsibilities: `src/change/manager.ts` re-exports existing
  public symbols.
- Forbidden dependencies: new modules must not import manager facade,
  Workbench, server, web UI, or CLI command modules.

## Verification

Passed:

- `npm run test -- tests/unit/change.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/integration/cli-flow.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Drift checks:

- `rg "Phase 8L is active|Current active phase: Phase 8L|harness/changes/active/phase-8l" AGENTS.md docs` returned no matches.
- `rg "Phase 8M|Change lifecycle|Change metadata|domain boundary|module boundary" AGENTS.md docs harness/changes/active` returned expected Phase 8M boundary language.
