# Phase 10Q Main Agent Goal Loop Controller Policy Contract

## Purpose

Phase 10Q adds a non-executing Goal Loop controller policy contract. It turns the main Agent's "continue once" judgment into auditable evidence: recommend the currently visible Harness gate, suppress stale guidance, wait for more evidence, or report blocked state.

This phase does not execute the recommended action. It does not start workers, scheduler loops, validation, audit, IntegrationCheck, apply, close, merge, source mutation, or child Changes.

## Scope

In scope:

- Fix post-10P documentation drift and mark Phase 10Q active.
- Add Goal Loop controller policy types, artifact paths, repository, renderer, and compiler in `src/goal-loop`.
- Surface the latest controller verdict in Workbench read-model summary without making it a new executable gate.
- Add focused tests for stale packet suppression, current gate recommendation, wait/blocked verdicts, non-execution, and module boundary compatibility.

Out of scope:

- No autonomous Goal Loop runtime.
- No execution of `recommendedAction`.
- No scheduler worker start, validation, audit, IntegrationCheck, apply, close, landing, PR, merge, or child Change creation.
- No new CLI command, HTTP route, Workbench primary action, scheduler loop, slot allocator, ODWF runtime, cache/replay, or source mutation.

## Current Status

Ready to close.

## Verification

- `npm run typecheck` passed.
- `npm run test -- tests/unit/goal-loop-decision.test.ts` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run lint` passed.
- `npm run test` passed: 28 files, 388 tests.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

