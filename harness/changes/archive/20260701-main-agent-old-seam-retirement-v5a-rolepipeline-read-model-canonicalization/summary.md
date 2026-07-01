# main-agent-old-seam-retirement-v5a-rolepipeline-read-model-canonicalization

## Purpose

Continue main-agent old seam retirement by introducing canonical
`mainAgentExecution` Workpad read-model fields while preserving legacy
`rolePipeline` compatibility. This is a compatibility migration, not a breaking
deletion.

The goal is to move Workbench projections and UI consumers away from the old
"role pipeline" mental model toward "main-agent execution" without changing
Harness authority, confirmation behavior, action ids, Scheduler,
IntegrationCheck, apply/close, or user-visible workflow behavior.

## Scope

In scope:

- Add `mainAgentExecution` to Workbench read-model and web DTOs with the same
  wire shape as the current role execution summary.
- Build the summary once and expose it as both `mainAgentExecution` and legacy
  `rolePipeline`.
- Make backend projections and frontend Workpad surfaces prefer
  `mainAgentExecution` with `rolePipeline` fallback.
- Add tests proving canonical preference and legacy fixture compatibility.
- Sync current handoff docs.

Out of scope:

- Deleting `rolePipeline`.
- Deleting `role.pipeline.*` action ids.
- Deleting `MainAgentLoopProjection`.
- Changing confirmation queue priority, action registry semantics,
  automation allowlists, ToolPolicyGate, Scheduler, IntegrationCheck,
  apply/close, remote, PR, merge, or Harness evolution authority.

## Current Status

Completed.

## Verification

Passed.

- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` - passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: updated `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` to point at the active V5a slice.
- Experience lifecycle result: merged Workbench consumers onto canonical
  `mainAgentExecution`; retained `rolePipeline`, `role.pipeline.*`, and
  `MainAgentLoopProjection` as live compatibility/boundary seams.
- Roadmap/current-direction stale language check: V4/V5 wording updated to
  describe V5a read-model canonicalization and V5b legacy-field assessment.
- Old experience retained / merged / retired / archive-only: direct consumer
  reads of `rolePipeline` retired in favor of canonical-first helpers; legacy
  field output retained for compatibility.
