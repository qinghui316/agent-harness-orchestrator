# main-agent-old-seam-retirement-v2-action-normalization-bridge

## Purpose

Centralize the still-public `role.pipeline.*` main-agent execution action checks behind a small workflow-action normalizer. This is a compatibility bridge for later old-seam retirement, not a public action rename.

## Scope

In scope:

- Added `src/workflow-actions/main-agent-execution.ts` with normalization and classification helpers.
- Refactored Workbench action conflict-control stop bypass and action result summaries to use the helper.
- Added targeted unit and boundary coverage for the helper, route compatibility, dead old seam absence, and public id preservation.

Out of scope:

- No `main-agent.execution.*` public action ids.
- No removal of `role.pipeline.*`, `rolePipeline`, or `MainAgentLoopProjection`.
- No Scheduler, IntegrationCheck, confirmation queue, action revalidation, automation allowlist, ToolPolicyGate, apply/close, remote, merge, PR, or Harness evolution authority changes.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-action-results.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed, with the existing Vite chunk-size warning only.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after active handoff pointer alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed; no pending evolution.

## Acceptance Feedback

- Manual config edits: none.
- Extra prompts or reviewer instructions: keep V2 as a normalization bridge only; do not switch UI/default action ids.
- Retries or environment failures: first close attempt was rejected because this summary still said `Active`; fixed before close.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff pointers were aligned for close.
- Experience lifecycle result: old public action ids retained as compatibility surface.
- Roadmap/current-direction stale language check: no roadmap change.
- Old experience retained / merged / retired / archive-only: `role.pipeline.*` retained; dead old full-sequence names remain absent.
