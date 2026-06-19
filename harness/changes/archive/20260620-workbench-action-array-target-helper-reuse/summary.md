# Workbench Action Array Target Helper Reuse

## Purpose

Move repeated Workbench high-impact action array target matching into the existing Workbench action target revalidation owner.

This is a narrow Architecture Growth Control change. It strengthens an existing helper boundary and does not add runtime behavior, scheduler authority, new action paths, or new gates.

## Scope

In scope:

- Add a pure ordered string-array target helper in `src/workbench/actions/active-target.ts`.
- Reuse it in the three existing scheduler `worktreeIds` checks in `src/workbench/actions/boundary.ts`.
- Extend `tests/unit/workbench-module-boundaries.test.ts`.

Out of scope:

- Scheduler execution semantics, IntegrationCheck behavior, Workbench UI, action payload shapes, package scripts, `workflow-actions/registry.ts`, broader `boundary.ts` extraction, and `README.md`.

## Current Status

Completed.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npx eslint src/workbench/actions/active-target.ts src/workbench/actions/boundary.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Placeholder/stale active-none grep across `AGENTS.md`, `docs/STATUS.md`, and the active change returned no matches.

Not run:

- Full `npm run test`, full `npm run test:workbench`, and slow Workbench suites. This change is a helper-level behavior-preserving revalidation-owner reuse and did not change scheduler execution, Workbench UI, package scripts, or runtime semantics.

## Acceptance Feedback

- Plan review: subagent `019ee232-f79c-70e1-80d8-00e4310edf4a` returned PASS.
- Close-ready review: subagent `019ee237-e987-7f53-b4d5-70629f9fb3f1` returned PASS.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: preserve missing-request semantics for `request.worktreeIds`.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to `AGENTS.md`, `docs/STATUS.md`, and active change files; current docs/handoff updates are narrow current-state evidence only.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
