# Phase 8P Scoped Validation Audit Evidence Boundary Split

## Purpose

Phase 8P repairs post-auto-evolve handoff drift, hardens Validation/Audit evidence scope checks, and splits the remaining Validation/Audit manager implementations behind compatibility facades.

Validation and Audit are evidence gates for close/apply/recovery projections. They are not workflow truth and must not accept forged, misplaced, malformed, or cross-Change evidence.

## Scope

In scope:

- Update `AGENTS.md` and `docs/STATUS.md` plus runtime/boundary docs for Phase 8P active state.
- Add scoped guards for `validation.json` and `audit.json`.
- Keep list/projection paths projection-safe by skipping invalid records.
- Keep direct read/show/accept paths strict and fail closed.
- Split `src/validation/manager.ts` and `src/audit/manager.ts` into owned modules while preserving old imports.
- Extend focused tests and module-boundary tests.

Out of scope:

- New runtime capability, CLI command, Workbench action, HTTP route, scheduler, parallel execution, automatic child Change creation, ODWF JavaScript runtime, or cache/replay.
- Validation/Audit artifact path, JSON shape, event shape, CLI output, Workbench projection/action payload, decision/audit scope, SSE, or thread storage changes.
- Unrelated untracked `README.md`.

## Current Status

Ready to close.

## Verification

- Focused product tests passed: `npm run test -- tests/unit/validation.test.ts tests/unit/audit.test.ts tests/unit/workbench.test.ts tests/unit/workbench-server.test.ts tests/unit/workbench-module-boundaries.test.ts tests/integration/cli-flow.test.ts`.
- Full product verification passed: `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- Harness verification and drift checks are recorded in `reviews/review.md`.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: none recorded.
- Product-fixable workarounds or follow-up evidence: this is expected to be the final broad module-boundary phase; later work should be defect- or feature-driven.
