# Maintenance Canonical Ledger Idempotency Reuse

## Purpose

Continue the Architecture Growth Control register with a narrow maintenance / canonical patch chain convergence slice. After target-boundary and lineage/alignment guards were moved into shared owners, repeated ledger idempotency handling remains scattered across canonical update, patch, application, and observation report modules.

This change strengthens the existing `src/agent-task/ledger.ts` owner with one narrow helper for idempotent ledger entry recording by `eventType + primaryArtifactRef`. Feature modules still own their event type, summary text, primary artifact ref construction, Markdown refs, artifact schemas, rendering, and workflow authority.

## Scope

In scope:

- Add a focused ledger helper that ensures one ledger entry exists for a given event type and primary artifact ref.
- Reuse that helper from canonical update proposal/decision, canonical patch proposal/gate, canonical patch application manifest/result, and canonical patch application report paths.
- Preserve existing ledger event types, summaries, primary artifact refs, Markdown refs, artifact shapes, and idempotency behavior.

Out of scope:

- No ledger schema, event type, candidate filtering, maintenance review, Workbench, server, frontend, manager facade, human-gate, ToolPolicyGate, target-boundary, lineage, patch application, or automatic canonical rewrite behavior changes.
- No new evidence, report, manifest, descriptor, ledger event family, projection, or public workflow action.
- No general ledger policy engine; the helper is only a small idempotent append wrapper.

## Current Status

Completed.

## Verification

- `npm run typecheck` - passed.
- `npx vitest run tests/unit/agent-task-boundaries.test.ts` - passed, 18 tests.
- `npm run lint` - passed.
- `npm run test:fast` - passed, 29 files / 328 tests.
- `npm run build` - passed.
- `npm run test:integration` - passed, 38 tests.
- `npx vitest run tests/unit/workbench.test.ts -t "applies ready maintenance canonical patch manifests only through a scoped confirmation" --reporter=verbose` - passed, 1 selected test.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check` - passed, no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first targeted `agent-task-boundaries` run failed because a new test assertion hard-coded a display path prefix; the assertion was corrected to check the ref suffix while still verifying primary-ref ordering and Markdown ref retention, then the test passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
- Independent review feedback: subagent close-ready review found no source behavior drift and flagged only stale ECL close-ready status fields; those ECL records were corrected before close.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active/handoff path changes only; `AGENTS.md` and `docs/STATUS.md` were updated without promoting archive-ledger history.
- Experience lifecycle result: applicable as the next source convergence sample for the Architecture Growth Control rule.
- Roadmap/current-direction stale language check: checked against `docs/STATUS.md` and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: prior Architecture Growth Control direction remains summarized in current docs; detailed history remains archive-only.

