# Workbench AgentTask Residual Test Domain Split

## Purpose

Move the final AgentTask/delegation/boundary tests out of residual `tests/unit/workbench.test.ts` into an explicit Workbench capability-domain suite, then remove the residual Workbench monolith.

This is test architecture convergence and handoff cleanup only. It preserves product runtime behavior, Workbench behavior, AgentTask/ToolPolicy logic, scheduler, Goal Loop, source apply, remote, maintenance, and human-gate behavior.

## Scope

In scope:

- Add `tests/unit/workbench-agent-task-domain.test.ts` with the four current AgentTask/delegation/boundary residual tests.
- Delete `tests/unit/workbench.test.ts` after moving those tests.
- Update `package.json` so the deleted residual path is absent and the new suite is excluded from `test:fast` and included in `test:workbench` at the old residual position.
- Update `docs/DEVELOPMENT.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `AGENTS.md` so current docs no longer direct agents to split or run the deleted residual monolith.

Out of scope:

- Product runtime, Workbench server/API/UI behavior, ToolPolicy, AgentTask manager/policy/boundary logic, scheduler, Goal Loop, source apply, remote handoff, maintenance, or human-gate behavior changes.
- A new fixture framework or new local validation/projection/gate mechanism.
- Broad test-suite restructuring beyond removing the final residual Workbench monolith.
- Running full `npm run test` or `npm run test:workbench` unless package-script contract checks or review reveal broader drift.

## Current Status

Ready to close.

Implemented:

- `tests/unit/workbench-agent-task-domain.test.ts` now owns the final four Workbench AgentTask/delegation/boundary residual tests.
- `tests/unit/workbench.test.ts` was deleted.
- `package.json` no longer references the deleted residual path; the new suite is excluded from `test:fast` and included in `test:workbench`.
- `docs/DEVELOPMENT.md` and `docs/CURRENT-DEVELOPMENT-PLAN.md` no longer describe residual `tests/unit/workbench.test.ts` splitting as current work.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-agent-task-domain.test.ts`
- Package script contract check for deleted residual path, new suite membership, existing `test:workbench` targets, and empty `&&` segments.
- Deleted-file check: `tests/unit/workbench.test.ts` absent.
- `npx eslint tests/unit/workbench-agent-task-domain.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Current-doc drift check in active close-ready state: no current docs instruct agents to move coverage out of the deleted residual suite; active handoff only instructs close/archive.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: residual `tests/unit/workbench.test.ts` removed; future Workbench coverage should choose explicit capability suites.
- Plan review: after three BLOCK rounds and plan corrections, subagent `019ee1db-f2c0-75a2-aeda-5c9a5734b81e` returned PASS before ECL creation/implementation.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: current handoff and roadmap docs updated without promoting archive narrative.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
