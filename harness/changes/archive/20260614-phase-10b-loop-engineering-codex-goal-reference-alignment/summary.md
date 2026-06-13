# Phase 10B Loop Engineering Codex Goal Reference Alignment

## Purpose

Align AHO's long-running task direction with Loop Engineering and the local OpenAI Codex `goal` implementation. The change records that complex user work should be driven by a persistent Goal/Change loop that observes current evidence, chooses conflict-aware parallel or sequential slices, and repeats until evidence proves completion, blocking, or conflict.

This is documentation and reference alignment only. It does not implement a Goal Loop Controller, scheduler loop, parallel executor, Workbench action, HTTP route, CLI command, UI, or runtime behavior.

## Scope

In scope:

- Record Phase 10B as the active docs/reference alignment phase.
- Add a Loop Engineering reference map and AHO-specific do-not-copy boundaries.
- Extend the OpenAI Codex reference map with `goal` source behavior.
- Update core architecture, runtime, Workbench, boundaries, and ECL docs with Goal-driven Adaptive Loop rules.
- Preserve the existing Harness truth model: Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates.

Out of scope:

- Product runtime changes.
- New Workbench action, HTTP route, CLI command, frontend UI, lazy projection, or artifact JSON shape.
- Scheduler loop, slot allocator, start-all action, whole-wave dispatch, child Change creation, ODWF JavaScript runtime, cache/replay, or full parallel executor.
- Changing reference submodule source or vendoring reference code.

## Current Status

Ready to close.

## Verification

- `rg "Phase 10B|Loop Engineering|Goal-driven Adaptive Loop|Codex goal|completion audit|conflict-aware" AGENTS.md docs harness/changes/active` - passed.
- `rg "Phase 10A is active|Current active phase: Phase 10A|harness/changes/active/phase-10a" AGENTS.md docs` - passed with no stale matches.
- `rg "addyosmani.com/blog/loop-engineering|reference-projects/openai-codex|goal_spec.rs|goals.rs|continuation.md|budget_limit.md" docs AGENTS.md` - passed.
- `rg "worktree|subagent|external state|memory|human gate|IntegrationCheck" docs/design-docs/ref-loop-engineering.md docs/design-docs/ref-openai-codex.md` - passed.
- `rg "not workflow truth|must not bypass|ToolPolicyGate|human gate|Change/ECL|Validation|Audit|IntegrationCheck" docs/ARCHITECTURE.md docs/RUNTIME.md docs/WORKBENCH.md docs/BOUNDARIES.md` - passed.
- `rg "parallel.*low conflict|high conflict|sequential loop|multi worktree|apply gate" docs` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test -- tests/unit/web-app.test.tsx` - passed after one earlier full-suite retry.
- `npm run test` - passed on rerun: 27 files, 359 tests.
- `npm run build` - passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first `npm run test` timed out at 184s; the next full run had one transient `tests/unit/web-app.test.tsx` tab-state assertion failure. The focused file rerun passed, and the final full `npm run test` rerun passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
