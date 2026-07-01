# main-agent-old-seam-retirement-v3-action-alias-compatibility-bridge

## Purpose

Add a public compatibility bridge for main-agent execution action ids:
canonical `main-agent.execution.*` ids are now registered and routable while
legacy `role.pipeline.*` ids remain supported aliases. Both id families
normalize through the same helper and route to the same Workbench handlers.

This is an alias bridge only. It does not delete `rolePipeline`,
`MainAgentLoopProjection`, or `role.pipeline.*`, and it does not expand
automation, Goal Loop, Scheduler, IntegrationCheck, ToolPolicyGate, apply,
close, remote, PR, merge, or Harness evolution authority.

## Scope

In scope:

- Canonical and legacy main-agent execution action normalization.
- Workflow/live registry aliases.
- Shared Workbench handler registration for canonical and legacy ids.
- Backend/frontend/thread-stream label normalization.
- Alias, stop-bypass, and boundary tests.
- Current docs drift and V2 archived review correction note.

Out of scope:

- UI default payload migration to canonical ids.
- Legacy id deletion.
- `rolePipeline` or `MainAgentLoopProjection` removal.
- Scheduler, IntegrationCheck, automation, apply/close, remote, merge, PR, or
  Harness evolution behavior changes.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/workbench-action-results.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-action-results.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none beyond the requested V3 plan.
- Retries or environment failures: none.
- Screenshots / artifacts / run ids: none; architecture/action-id change only.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, and the V2 archived review correction
  note are updated in this change.
- Experience lifecycle result: retained old ids as compatibility aliases and
  promoted canonical ids as the new public family.
- Roadmap/current-direction stale language check: updated to make V3 the latest
  old-seam retirement slice and leave V4/V5 as future migration.
- Old experience retained / merged / retired / archive-only: `role.pipeline.*`
  retained as alias; duplicated local string checks retired behind the helper.
