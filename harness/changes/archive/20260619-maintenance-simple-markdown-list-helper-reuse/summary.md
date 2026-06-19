# maintenance-simple-markdown-list-helper-reuse

## Purpose

Reuse the existing maintenance markdown list helper for simple string-list sections in the canonical maintenance chain.

This is an Architecture Growth Control slice. It strengthens the existing presentation owner in `src/agent-task/maintenance-markdown.ts` instead of leaving each canonical update / canonical patch renderer with local `items.map((item) => "- ...")` branches for simple lists.

## Scope

In scope:

- Reuse `renderMaintenanceMarkdownList` for Target Kinds and Risks in `src/agent-task/canonical-updates.ts`.
- Reuse `renderMaintenanceMarkdownList` for Blocked Reasons in `src/agent-task/canonical-patch-application.ts`, preserving the existing `- none` empty fallback.
- Reuse `renderMaintenanceMarkdownList` for Guardrails in `src/agent-task/canonical-patch-application-report.ts`.
- Preserve existing markdown output and artifact JSON/schema behavior.

Out of scope:

- No multi-line renderer changes for Resolutions, Proposed Operations, Operations, Applied Operations, or Observed Operations.
- No helper API change unless required to preserve current output.
- No parser, schema, artifact JSON shape, ledger event policy, artifact ref construction, authority flag, human gate, ToolPolicyGate, source mutation, Workbench, Scheduler, Goal Loop, manager facade, reference source, or broad renderer refactor.

## Current Status

Completed and archived. ECL artifacts created and plan accepted after subagent review required tighter lifecycle and semantic-preservation criteria. Implementation, validation, independent close-ready review, close, and post-close handoff alignment are complete.

## Verification

- Targeted grep confirmed no remaining scoped simple maps for `targetKinds`, `risks`, `blockedReasons`, or `guardrailNotes` in the three target files.
- Targeted grep confirmed multi-line Resolutions, Proposed Operations, Operations, Applied Operations, and Observed Operations renderers remain present.
- `npm run test:fast -- --run tests/unit/agent-task-boundaries.test.ts` passed: 1 file, 26 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` passed: 29 files, 339 tests.
- `npm run test:integration` passed: 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex` rebuilt `harness/changes/INDEX.json`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check` reported no pending evolution, 1 archived change since last completion, threshold 5.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status` reported T-004 incomplete before close bookkeeping; final close-ready status pending after this summary update.
- Supplemental `npm run test:workbench` was attempted twice and timed out after 244 seconds and 604 seconds without a completed result. This is recorded as a validation limitation, not pass evidence; the change does not affect Workbench code, routes, projections, UI actions, or server behavior, and Workbench-adjacent tests in `test:fast` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan review subagent required explicit structured ECL handling, Blocked Reasons fallback preservation, and scope-control grep; close-ready subagent required final close bookkeeping and handoff evidence after finding no implementation blocker.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to temporary active handoff updates in `AGENTS.md` and `docs/STATUS.md`.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active handoff should remain aligned with `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
