# workbench-close-gate-projection-alignment

## Purpose

Fix the Workbench projection gap found during the real `a10`
Workbench/Codex acceptance: after committed apply and landing refresh, the
authoritative confirmation queue selected `change.close`, but the right-side
decision inspector could still present an old failed result card as the primary
decision.

This change aligns the selected-demand decision inspector with the
authoritative confirmation queue for close-ready demands. It does not change
close/apply authority and does not add automation.

## Scope

In scope:

- Workbench read-model projection behavior for close-ready selected demands.
- Confirmation queue / decision inspector consistency.
- DOM coverage that the right pane shows the close gate as the visible primary
  card.
- Handoff docs for the active change pointer.

Out of scope:

- Full-auto task mode.
- Scheduler loop runtime, parallel executor, slot allocator, or child Change
  creation.
- Runtime, Codex execution, apply/close command authority, or source mutation
  behavior.
- Remote PR/push/merge behavior.

## Current Status

Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
- `npm run test:workbench:unit`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable unless a real UI smoke is
  performed.
- External source/state safety: not applicable; this change does not mutate
  source roots through Workbench apply/close.
- Remote handoff acceptance: not applicable.
- Product-fixable follow-up evidence: this change directly addresses the
  archived `a10` projection mismatch follow-up.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable only for minimal AGENTS/STATUS active
  pointer updates.
- Experience lifecycle result: not an auto-evolve change.
- Documentation entropy check: AGENTS/STATUS active pointers were updated for
  this active change and must be moved back to the archive handoff during
  close.
- Roadmap/current-direction stale language check: no roadmap behavior changed;
  `docs/CURRENT-DEVELOPMENT-PLAN.md` already names this projection gap as the
  next product slice.
- Old experience retained / merged / retired / archive-only: retained only as
  current active-change pointer until archive; detailed real-acceptance history
  remains archive-only.
