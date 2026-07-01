# main-agent-old-seam-retirement-v4-canonical-payload-default-audit

## Purpose

Retire one more old main-agent seam safely by making canonical
`main-agent.execution.*` action ids the default for new production payloads.
Legacy `role.pipeline.*` ids remain inbound compatibility aliases only.

This is an inventory-backed guard change, not a breaking rename. It adds tests
and small routing fixes so future code does not reintroduce legacy action ids as
new outbound payloads while preserving Harness authority and live compatibility
surfaces.

## Scope

In scope:

- Audit production `role.pipeline.*` usage and define an allowed compatibility
  surface.
- Switch any new-production payload generator still emitting `role.pipeline.*`
  to `main-agent.execution.*`.
- Add boundary tests proving legacy ids are inbound-only outside the alias
  surface.
- Sync handoff docs for the V4 migration state.

Out of scope:

- Removing `role.pipeline.*` from the registry or handlers.
- Removing `rolePipeline` read-model fields or `MainAgentLoopProjection`.
- Changing confirmation queue ordering, Goal Loop authority, automation
  allowlists, ToolPolicyGate, Scheduler, IntegrationCheck, apply/close, remote,
  merge, PR, or Harness evolution behavior.

## Current Status

Completed.

V4 audited main-agent execution action ids and found no production outbound
payload generator still emitting `role.pipeline.*`. The change adds a boundary
test that whitelists legacy `role.pipeline.*` string usage to registry/helper/
handler alias compatibility surfaces only. Handoff docs now identify V4 as the
active canonical-payload-default guard and preserve V5 as the later deletion
decision.

## Verification

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-action-results.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution, 4 archived changes since last completion.

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
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: keep legacy ids as inbound compatibility; do not
  promote them as new payload defaults.
- Roadmap/current-direction stale language check: active V4 and next V5
  direction aligned before close.
- Old experience retained / merged / retired / archive-only: `role.pipeline.*`
  retained as compatibility aliases; legacy outbound generation retired.
