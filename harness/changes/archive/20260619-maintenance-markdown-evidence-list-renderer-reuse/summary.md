# maintenance-markdown-evidence-list-renderer-reuse

## Purpose

Reuse the existing presentation-only maintenance markdown list helper for the remaining canonical update / canonical patch Evidence artifact reference sections.

This is an Architecture Growth Control slice. It extends an already-owned cross-cutting presentation helper instead of leaving each maintenance evidence renderer with its own local `artifactRefs.map((ref) => "- ${ref}")` formatting.

## Scope

In scope:

- Import and reuse `renderMaintenanceMarkdownList` from `src/agent-task/maintenance-markdown.ts` in `src/agent-task/canonical-updates.ts`.
- Reuse the helper for canonical update proposal, canonical update decision, canonical patch proposal, and canonical patch application gate Evidence `artifactRefs` sections.
- Reuse the helper for canonical patch application manifest Evidence `artifactRefs` in `src/agent-task/canonical-patch-application.ts`.
- Preserve existing markdown output.

Out of scope:

- No helper API change, markdown section rename/reorder, target-kind/risk/blocked-reason/operation-list renderer change, parser, schema, artifact JSON shape, ledger event policy, ledger artifact refs, authority flag, human gate, ToolPolicyGate, source mutation, Workbench, Scheduler, Goal Loop, manager facade, reference source, or broad renderer refactor.
- Other non-artifact markdown list rendering such as target kinds, risks, blocked reasons, resolutions, operations, and sources is intentionally out of scope.

## Current Status

Completed and archived. Plan reviewed by subagent and accepted after lifecycle tightening; implementation, validation, independent close-ready review, close, and follow-up Harness evolution trigger handling are complete.

Continuation rationale: no active continuation remains for this change. Closing this change triggered pending Harness evolution, which was handled by `harness/changes/archive/20260619-auto-evolve-harness-maintenance-helper-reuse-window/summary.md`.

## Verification

- Targeted renderer grep for old scoped artifact Evidence list rendering found no remaining `.artifactRefs.map((ref) => "- ${ref}")` call sites in `src\agent-task\canonical-updates.ts`, `src\agent-task\canonical-patch-application.ts`, or `src\agent-task\canonical-patch-application-report.ts`; the scoped call sites now use `renderMaintenanceMarkdownList`.
- `npm run test:fast -- --run tests/unit/agent-task-boundaries.test.ts` passed: 1 file, 26 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` passed: 29 files, 339 tests.
- `npm run test:integration` passed: 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex` rebuilt `harness/changes/INDEX.json`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check` reported no pending evolution, 4 archived changes since last completion, threshold 5.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status` reported active change incomplete only because review/close tasks remain.
- `npm run test:workbench` was not rerun for this slice because the change does not affect Workbench code, routes, projections, UI actions, or server behavior.

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

- Documentation entropy check: applicable to temporary active handoff updates in `AGENTS.md` and `docs/STATUS.md`.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active handoff remains aligned with `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
