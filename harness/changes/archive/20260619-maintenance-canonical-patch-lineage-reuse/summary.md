# Maintenance Canonical Patch Lineage Reuse

## Purpose

Continue the Architecture Growth Control register with a narrow maintenance / canonical patch chain convergence slice. After target/path/hash boundary logic was moved into `canonical-patch-target-boundary.ts`, the next repeated cross-cutting concern is lineage and operation-alignment validation across canonical patch application manifest, result, and observation report handling.

This change moves only that lineage/alignment guard logic into one focused `src/agent-task` owner module. It is behavior-preserving and must not change artifact JSON shape, Markdown rendering, ledger event types, Workbench/server/frontend behavior, human gates, ToolPolicyGate evidence, target-boundary logic, patch application, or canonical rewrite authority.

## Scope

In scope:

- Add a focused `src/agent-task` owner module for canonical patch lineage and operation-alignment guards.
- Reuse it from canonical patch application manifest/application validation.
- Reuse it from canonical patch application observation report validation.
- Preserve existing fail-closed error semantics and artifact shapes.

Out of scope:

- No new maintenance evidence, report, manifest, descriptor, ledger event, schema, or public API.
- No movement of human-gate / ToolPolicy authorization.
- No movement of target path/hash/descriptor logic already owned by `canonical-patch-target-boundary.ts`.
- No movement of patch content application, artifact build/render/write, or ledger event policy.
- No Workbench, server, frontend, scheduler, Goal Loop, IntegrationCheck, manager-facade, reference source, or automatic rewrite behavior changes.

## Current Status

Completed.

## Verification

- `npm run typecheck` - passed.
- `npx vitest run tests/unit/agent-task-boundaries.test.ts` - passed, 18 tests.
- `npm run lint` - passed.
- `npm run test:fast` - passed, 29 files / 328 tests.
- `npm run build` - passed.
- `npm run test:integration` - passed, 38 tests.
- `npx vitest run tests/unit/workbench.test.ts --reporter=dot` - passed, 111 tests; the default `npm run test:workbench` wrapper exceeded the initial 6-minute command timeout before completing, so the same test file was rerun with a longer command timeout.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: `npm run test:workbench` exceeded the initial command timeout before the Workbench test file completed; the same file passed when rerun directly with a longer command timeout.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
- Independent review feedback: subagent close-ready review found no source behavior drift and flagged stale ECL status/coverage fields; those ECL records were corrected and the subagent re-check returned PASS before close.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active/handoff path changes only; `AGENTS.md` and `docs/STATUS.md` were updated without promoting archive-ledger history.
- Experience lifecycle result: applicable as the second source convergence sample for the Architecture Growth Control rule.
- Roadmap/current-direction stale language check: checked against `docs/STATUS.md` and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: previous Architecture Growth Control direction remains summarized in current docs; detailed history remains archive-only.

