# Workbench Feedback Conversation Test Domain Split

## Purpose

Split proposal-feedback and conversation-lifecycle coverage out of the residual `tests/unit/workbench.test.ts` suite so Workbench verification can target those capability domains directly.

This is test architecture convergence only. It preserves Workbench runtime behavior, workflow truth, ToolPolicy, Goal Loop, scheduler, source apply, remote, maintenance, and human-gate behavior while reducing the overloaded residual Workbench regression file.

## Scope

In scope:

- Add `tests/unit/workbench-feedback-surface.test.ts` for Draft PR feedback classification and proposal request-changes coverage.
- Add `tests/unit/workbench-conversation-lifecycle.test.ts` for Workpad abandon, multi-Workpad background activity, independent demand creation, running-demand supplemental feedback, and archived-demand follow-up coverage.
- Remove those seven tests from residual `tests/unit/workbench.test.ts`, leaving the AgentTask/delegation/boundary domain for a later final split.
- Reuse existing `tests/unit/workbench/fixtures.ts` setup helpers and keep only proposal-specific fixture code local to the feedback suite.
- Update `package.json` so the new unit suites are excluded from `test:fast` and included in `test:workbench` before residual `tests/unit/workbench.test.ts`.

Out of scope:

- Product runtime, Workbench server/API/UI behavior, manager facade behavior, ToolPolicy, scheduler, Goal Loop, source apply, remote handoff, maintenance, or human-gate behavior changes.
- A new generic fixture framework or feature-local validation/projection/gate mechanism.
- Moving AgentTask/delegation/boundary residual tests in this phase.
- Running full `npm run test` unless implementation review finds drift beyond test relocation and package script membership.

## Current Status

Ready to close.

Implemented:

- `tests/unit/workbench-feedback-surface.test.ts` now owns Draft PR feedback classification and proposal request-changes coverage.
- `tests/unit/workbench-conversation-lifecycle.test.ts` now owns Workpad abandon, background activity, independent demand creation, running-demand feedback, and archived-demand follow-up coverage.
- `tests/unit/workbench.test.ts` now contains only the four AgentTask/delegation/boundary residual tests.
- `package.json` excludes the two new suites from `test:fast` and includes them in `test:workbench` before residual `tests/unit/workbench.test.ts`.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-feedback-surface.test.ts`
- `npx vitest run tests/unit/workbench-conversation-lifecycle.test.ts`
- `npx vitest run tests/unit/workbench.test.ts`
- Script membership checks for `test:fast` excludes and `test:workbench` ordering: `SCRIPT_MEMBERSHIP_OK`
- `npx eslint tests/unit/workbench.test.ts tests/unit/workbench-feedback-surface.test.ts tests/unit/workbench-conversation-lifecycle.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Not run:

- Full `npm run test`; this phase only relocated tests and updated package script membership. Targeted new suites, residual suite, touched-file ESLint, typecheck, repo lint, `test:fast`, and Harness checks cover the changed paths.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
- Plan review: subagent returned PASS before ECL creation/implementation and required preflight recording, test-topology coverage notes, concrete script membership checks, and residual import/helper cleanup.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
