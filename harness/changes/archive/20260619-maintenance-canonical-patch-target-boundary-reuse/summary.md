# Maintenance Canonical Patch Target Boundary Reuse

## Purpose

Start the Architecture Growth Control register with a narrow maintenance / canonical patch chain convergence slice. The current canonical patch descriptor builder and application writer each own local target path, memory-root safety, content hash, and descriptor validation helpers. This change moves that cross-cutting target-boundary logic into one `src/agent-task` owner module and updates both callers to reuse it.

The change is behavior-preserving. It should reduce duplicated local boundary code without changing artifact JSON shape, Workbench/server/frontend behavior, ledger event types, human gates, ToolPolicyGate evidence, or canonical rewrite authority.

## Scope

In scope:

- Add a focused `src/agent-task` owner module for canonical patch target boundary helpers.
- Reuse the helper from canonical patch target descriptor generation.
- Reuse the helper from canonical patch application manifest/application validation.
- Keep existing maintenance/canonical patch artifact shapes and public manager exports compatible.
- Add or adjust targeted unit coverage for descriptor, stale hash, unsafe path, and target-kind boundary behavior.

Out of scope:

- No new maintenance evidence/report/manifest/descriptor phase.
- No automatic canonical docs or stable-memory rewrite behavior.
- No Workbench, server, frontend, scheduler, Goal Loop, IntegrationCheck, or manager-facade behavior change beyond existing imports.
- No reference project source changes or vendor-copying.

## Current Status

Ready to close.

## Verification

- `npm run typecheck` - passed.
- `npx vitest run tests/unit/agent-task-boundaries.test.ts` - passed, 18 tests.
- `npm run lint` - passed.
- `npm run test:fast` - passed, 29 files / 328 tests.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Independent Review

Subagent close-ready review found no code regression. It confirmed the extraction preserves descriptor-side `null` fail-safe behavior, application-side fail-closed errors, target-kind path validation, stale hash checks, human gate / ToolPolicyGate paths, public API compatibility, Workbench/schema/artifact shape stability, and Core Mechanism Reuse intent. The only review findings were ECL closeout bookkeeping items, now resolved.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active/handoff path changes only; entry docs stay compact and point to the active change.
- Experience lifecycle result: this is a source convergence sample for the Architecture Growth Control rule; no old archive history was promoted into current docs.
- Roadmap/current-direction stale language check: `AGENTS.md` and `docs/STATUS.md` point at this active change; broader roadmap text unchanged.
- Old experience retained / merged / retired / archive-only: Architecture Growth Control guidance remains in current docs; historical phase detail remains archive-only.

