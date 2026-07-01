# main-agent-loop-projection-retirement-v6

## Purpose

Retire the old Workpad/Web DTO `mainAgentLoopProjection` seam and the
`src/goal-loop/main-agent-loop-projection.ts` projection owner. The projection
was a temporary non-executing bridge during the main-agent migration; the
canonical architecture now uses main-agent orchestration loop evidence,
WorkflowGraph replay/policy/backflow, and existing Goal Loop summaries directly.

This change removes only the duplicate derived DTO/projection layer. It does
not remove Goal Loop current capabilities, action bridge evidence fields,
main-agent loop evidence, Scheduler/IntegrationCheck owners, confirmation
queue, action revalidation, ToolPolicyGate, apply/close, remote, merge, PR, or
Harness evolution boundaries.

## Scope

In scope:

- Delete `src/goal-loop/main-agent-loop-projection.ts` and its manager
  re-export.
- Remove Workpad read-model construction and public DTO fields for
  `mainAgentLoopProjection`.
- Remove Web DTO type/field and stale test fixtures.
- Convert tests to retirement protection for the old projection seam.
- Update current handoff/roadmap docs to mark this final old seam retired.

Out of scope:

- Goal Loop summary, controller policy, next-step packet, gate-readiness
  preflight, feedback, close handoff, and current-gate parity.
- `src/main-agent-orchestration/loop-evidence.ts`,
  `mainAgentLoopRunId`, `mainAgentNextStepEvidenceId`, action bridge
  revalidation, WorkflowGraph replay/policy/backflow, Scheduler and
  IntegrationCheck owners.
- UI feature changes, new action types, permission changes, automation
  allowlist changes, or source/apply/close behavior changes.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-goal-loop-surface.test.ts tests/unit/action-revalidation.test.ts tests/unit/controlled-scheduler-post-step-projection.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after active handoff docs were pointed at this active change.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.
- Boundary grep: `rg -n "mainAgentLoopProjection|MainAgentLoopProjection|main-agent-loop-projection|buildMainAgentLoopProjection" src tests` has no production `src/` hits; only negative test assertions remain.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested V6 implementation.
- Retries or environment failures: initial `lint-ecl` failed because active handoff docs still said no active change; docs were corrected and `lint-ecl` passed.
- Screenshots / artifacts / run ids: not applicable; no UI change intended.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` updated for active V6 and V6 closeout.
- Experience lifecycle result: retired the old `MainAgentLoopProjection`
  current-direction entry; historical archives remain archive-only.
- Roadmap/current-direction stale language check: current plan no longer routes
  the next step back to projection retirement.
- Old experience retained / merged / retired / archive-only: old projection
  seam retired; historical archives unchanged.
