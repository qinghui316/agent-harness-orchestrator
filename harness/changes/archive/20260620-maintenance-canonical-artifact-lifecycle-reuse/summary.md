# Maintenance Canonical Artifact Lifecycle Reuse

## Purpose

Converge the maintenance canonical update / canonical patch chain around one shared artifact lifecycle helper for the repeated "write JSON + Markdown artifact, then ensure policy ledger entry" pattern.

This is Architecture Growth Control work. It reduces repeated local lifecycle plumbing in the maintenance canonical chain while preserving existing artifact schemas, ids, markdown bodies, authority flags, human gates, ToolPolicy evidence, Workbench actions, and source-mutation behavior.

## Scope

In scope:

- Add a narrow shared maintenance artifact lifecycle helper under `src/agent-task/`.
- Reuse it from canonical update proposal/decision, canonical patch proposal/application gate, canonical patch application manifest/result, and canonical patch application report creation paths.
- Preserve existing idempotency: existing artifacts must not be rewritten; existing paths should only ensure their policy ledger entry and return the existing artifact.
- Keep public manager exports and Workbench behavior compatible.

Out of scope:

- Schema, type, artifact id, markdown content, authority flag, target validation, ToolPolicyGate, human gate, Workbench action, scheduler, Goal Loop, runtime, apply/close, remote, or Harness evolution behavior changes.
- Broad maintenance-chain redesign or simultaneous scheduler/Goal Loop/Workbench refactoring.
- New evidence-only artifact, report, manifest, descriptor, ledger event, projection, or gate family.

## Current Status

Ready to close.

Plan passed subagent review `019ee1ec-76c0-7b92-b9f9-94bd39875def`. Implementation, verification, and close-ready review are complete.

Continuation rationale: this active change is the current structured work item and should continue until implementation, verification, review, and close are complete.

## Verification

Passed:

- `npx eslint src/agent-task/maintenance-artifact-lifecycle.ts src/agent-task/canonical-updates.ts src/agent-task/canonical-patch-application.ts src/agent-task/canonical-patch-application-report.ts tests/unit/agent-task-boundaries.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/agent-task-boundaries.test.ts`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`
- `npm run typecheck`
- `npm run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
- Plan review: subagent `019ee1ec-76c0-7b92-b9f9-94bd39875def` returned PASS and required preserving existing-artifact no-rewrite idempotency plus targeted boundary/maintenance verification.
- Close-ready review: subagent `019ee1f5-6b53-7272-8e37-7221995a00e4` initially BLOCKed stale close/handoff wording only; code review found no Architecture Growth Control blocker. The stale close wording was corrected before close.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active handoff only; no durable rule or roadmap change planned. Active-state line counts: `AGENTS.md` 146, `docs/STATUS.md` 128, `docs/CURRENT-DEVELOPMENT-PLAN.md` 74.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
