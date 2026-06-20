# Workbench Worker First Pass Optional Target Helper Reuse

## Purpose

Reuse the existing Workbench optional string target helper in the first-pass scheduler worker validation and audit boundary paths.

This change is scoped Architecture Growth Control work: it strengthens the existing `active-target.ts` target revalidation owner rather than adding another local validator.

## Scope

In scope:

- Replace equivalent optional scalar target checks in `planning.scheduler.worker.validate-first`.
- Replace equivalent optional scalar target checks in `planning.scheduler.worker.audit-first`.
- Add module boundary assertions for helper adoption.

Out of scope:

- New helper APIs.
- Full scheduler worker/rework chain refactors.
- Workflow truth, action id, payload shape, ToolPolicyGate, human gate, scheduler execution, or runtime authority changes.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` passed: 1 file, 37 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff pointers only; no archive ledger expansion.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

