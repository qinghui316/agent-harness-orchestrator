# main-agent-bridge-integration-acceptance-closeout-v1

## Purpose

Close out the already-implemented main-agent bridge integration with focused
acceptance coverage and roadmap cleanup. The production bridge owner already
exists in `src/main-agent-orchestration/action-bridge.ts`, and both workflow
and approval action paths already consult it when a request explicitly carries
main-agent evidence ids.

This change does not add a new bridge, helper framework, UI, or permission
surface. It proves the existing bridge fails closed at the server/action
boundaries and updates current handoff docs so the next main-agent architecture
slice is Recovery/resume.

## Scope

In scope:

- Add focused acceptance tests for explicit main-agent bridge ids on workflow
  and approval action paths.
- Add negative coverage for partial ids, stale/non-ready assessment, and
  unsupported scheduler/integration gates.
- Update current roadmap/handoff docs to mark bridge practical integration
  complete and point next work to Recovery/resume.

Out of scope:

- New bridge owner or server-side guard framework.
- UI, confirmation queue ordering, automation allowlist, action registry, or
  ToolPolicyGate changes.
- Scheduler, WorkerLease, IntegrationCheck, remote, PR, merge, apply/close, or
  Harness evolution authority changes.
- Deleting `MainAgentLoopProjection`, `rolePipeline`, or `role.pipeline.*`
  compatibility seams.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/action-revalidation.test.ts tests/unit/main-agent-bridge-server.test.ts tests/unit/main-agent-step-loop.test.ts tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed with the existing Vite chunk-size warning.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- Pre-close `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution, 4 archived changes since last completion.
- Closing this change created `harness/evolution/pending.md` for the next Harness evolution window.

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

- Documentation entropy check: applicable; current roadmap/handoff text is
  updated to remove stale "bridge next" wording.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/STATUS.md`, and `AGENTS.md` were checked and updated for the active change.
- Old experience retained / merged / retired / archive-only: bridge implementation detail remains in archive/code; current docs retain only the current completion state and next Recovery/resume direction.

