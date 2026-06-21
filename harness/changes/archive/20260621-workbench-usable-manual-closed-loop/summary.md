# workbench-usable-manual-closed-loop

## Purpose

Prove or repair the minimum user-usable Workbench manual-gated delivery loop:
user demand in the main Workbench conversation, executable plan/task state,
agent result evidence, validation/audit evidence, human-confirmed source apply,
and close/archive reachability.

This change shifts the next product step away from more controlled Scheduler
read-only evidence and away from full-auto task mode. The success condition is a
real Workbench path that lets a user finish one local demand under existing
human gates.

## Scope

In scope:

- Workbench main-surface acceptance for a bounded manual-gated demand loop.
- Confirmation queue honesty and scoped action payload coverage for the chosen path.
- Source apply safety evidence for the local apply handoff.
- Documentation drift cleanup for the next recommended product work.

Out of scope:

- Full-auto task mode or scoped automation authorization.
- Remote push, PR, merge, ready-for-review, or provider-specific landing.
- Scheduler loop, full executor, slot allocator, child Change automation, or whole-wave dispatch.
- New evidence families, summary families, decision families, or prompt-context layers unless an existing real path cannot express the acceptance result.

## Current Status

Completed / closed.

## Verification

Passed targeted and product verification:

- `npx vitest run tests/unit/workbench-read-model.test.ts --reporter=dot`
- `npx vitest run tests/unit/workbench-server.test.ts --reporter=dot`
- `npx vitest run tests/unit/web-app.test.tsx --reporter=dot`
- `npx vitest run tests/slow/workbench-apply-integration-flow.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`

Harness checks are recorded during closeout:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Manual config edits: none.
- Extra prompts or reviewer instructions: subagent independent review was used for boundary, documentation drift, and coverage review.
- Retries or environment failures: one `npm run lint` retry after fixing a mechanical `prefer-const` issue in `src/server/workbench/actions.ts`.
- Screenshots / artifacts / run ids: Vitest and npm command output recorded in terminal; no persistent test-run id generated.
- External source/state safety: slow Workbench apply integration test confirmed clean source status before explicit `result.apply`, clean source status after apply with commit, and no archive until explicit `change.close`.
- Remote handoff acceptance: not applicable; remote handoff is out of scope.
- Product-fixable workarounds or follow-up evidence: none required for this manual loop slice; full-auto remains later-roadmap.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; this change updates handoff and current-direction docs.
- Experience lifecycle result: promoted Workbench manual-gated loop as the current usability baseline, retained full-auto as later-roadmap, merged controlled Scheduler details into short baseline language, and left detailed historical phase narratives archive-only.
- Roadmap/current-direction stale language check: `rg` found no stale immediate full-auto or old controlled Scheduler next-step phrases in `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: controlled Scheduler boundary value retained; old next-step wording retired; detailed history kept in archive summaries and `harness/changes/INDEX.json`.
