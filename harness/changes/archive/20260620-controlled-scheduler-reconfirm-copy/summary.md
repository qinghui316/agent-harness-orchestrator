# controlled-scheduler-reconfirm-copy

## Purpose

Make the controlled scheduler continuation confirmation clearer in the real
Workbench decision surface. When the right confirmation queue exposes
`planning.scheduler.controlled-advance.run` with fresh Goal Loop/controller
readiness evidence, the card should explain that the user is confirming a new
single-step continuation, not authorizing an automatic loop.

This change is product-visible UI copy and projection behavior only. It reuses
the existing confirmation queue and controlled scheduler advance action path.

## Scope

In scope:

- Controlled scheduler advance confirmation copy selection in the existing
  Workbench confirmation projection owner.
- User-facing scheduler copy helpers for the refreshed/reconfirm posture.
- Confirmation queue wiring so the projection can read current Workpad
  Goal Loop/controller/preflight evidence.
- Projection and web DOM tests proving the real right-side confirmation card
  renders the refreshed single-step confirmation copy.

Out of scope:

- No scheduler loop runtime.
- No new action type, server route, schema, artifact writer, or decision
  payload source of truth.
- No automatic worker dispatch, whole-wave dispatch, IntegrationCheck, apply,
  close, remote landing, or Harness evolution.
- No claim that a previous step stopped unless current read-model evidence can
  prove a post-step handoff.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts` - passed.
- `npx vitest run tests/unit/web-app.test.tsx` - passed, including real DOM coverage for the right confirmation card.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after active handoff pointers were updated.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - active change recognized; only closeout task remained before this update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution and archive count below threshold.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: real UI acceptance covered by `tests/unit/web-app.test.tsx`, which renders the Workbench App and right confirmation card DOM.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
