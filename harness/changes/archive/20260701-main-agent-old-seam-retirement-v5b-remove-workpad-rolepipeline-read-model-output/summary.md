# main-agent-old-seam-retirement-v5b-remove-workpad-rolepipeline-read-model-output

## Purpose

Continue old seam retirement by removing the legacy Workpad public read-model
field `rolePipeline` after V5a introduced canonical `mainAgentExecution`.

This is a narrow read-model / DTO compatibility cleanup. It must not delete
`role.pipeline.*` action aliases, `MainAgentLoopProjection`, Scheduler,
IntegrationCheck, confirmation, automation, apply/close, remote, PR, merge, or
Harness evolution authority.

## Scope

In scope:

- Remove `center.workpad.rolePipeline` from Workbench public read-model output.
- Remove Workpad `rolePipeline` from backend and frontend DTO types.
- Remove Workpad consumer fallback from `mainAgentExecution ?? rolePipeline`.
- Keep `mainAgentExecution` wire shape unchanged.
- Update tests and handoff docs for the canonical read-model field.
- Fix V5a archive wording that still mentions an active V5a slice.

Out of scope:

- Deleting `role.pipeline.*` action ids or handler compatibility.
- Deleting `MainAgentLoopProjection`.
- Renaming or deleting internal demand-worker `rolePipeline` result fields.
- Changing action registry semantics, revalidation, confirmation ordering,
  automation allowlists, ToolPolicyGate, Scheduler, IntegrationCheck,
  apply/close, remote, PR, merge, or Harness evolution authority.

## Current Status

Completed.

## Verification

Passed.

- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-agent-task-domain.test.ts` - passed.
- `npx vitest run tests/unit/orchestration-engine.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` - passed.
- Harness checks: `lint-ecl`, `lint-encoding`, `harness-change reindex`, and
  `harness-evolve check` passed.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Poincare requested scope
  narrowing; subagent Wegener approved the narrowed plan.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: updated active handoff in `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`; corrected V5a
  archive wording.
- Experience lifecycle result: retired Workpad public read-model
  `rolePipeline` output; retained `role.pipeline.*`, internal demand-worker
  `rolePipeline`, and `MainAgentLoopProjection`.
- Roadmap/current-direction stale language check: V5b is now documented as the
  active narrow read-model removal slice.
- Old experience retained / merged / retired / archive-only: `rolePipeline`
  Workpad output retired; action aliases and non-executing seams retained.
