# workbench-integration-apply-outcome-completion-v1

## Purpose

Complete the post-apply outcome surface for scheduler IntegrationCheck. After a
human confirms `apply-check.apply`, Workbench must reconcile the same-Change
IntegrationCheck and SchedulerRun state into a clear next gate such as
integration outcome reconcile, scheduler run completion, `landing.prepare`,
`change.close`, completed state, or explicit blocker.

This change exists because the repaired IntegrationFix artifact can already be
human-applied through the real Workbench UI. The remaining product gap is to
make the post-apply state deterministic and honest instead of leaving stale
integration apply/discard or unrelated planning gates visible.

## Scope

In scope:

- Same-Change post-`apply-check.apply` outcome projection and reconciliation.
- Workbench confirmation queue / decision inspector alignment after integration
  apply or discard.
- Targeted source safety and stale target tests for integration apply outcome
  completion.
- E-drive real UI acceptance when product-visible code changes require it.

Out of scope:

- Automatic integration apply/discard.
- Widening scoped `完全访问权限`.
- Remote, merge, PR, post-merge, or Harness evolution automation.
- New workflow runtime, permission system, projection framework, child Change,
  scheduler executor, or evidence family.

## Current Status

Ready to close.

Implemented a minimal Workbench read-model alignment fix. When
`decisionInspector.primary` has no stronger current context and
`confirmationQueue.primary` has a real selected-Change gate, the inspector now
derives a read-only `workflow-gate` context from that authoritative primary.
Goal Loop fallback-only `planning.goal-loop.evaluate` remains excluded, so this
does not promote recommendation evidence into execution authority.

Strengthened the seeded scheduler IntegrationCheck fixture to write a real
`combined.patch` and matching content hash. The new post-apply test now
actually applies that patch through the allowlisted Workbench approval path,
verifies the old integration apply/discard gate disappears, advances through
the existing controlled scheduler outcome/completion wrappers, and lands on
the real local `landing.prepare` gate with decision inspector alignment.

## Verification

- `npx vitest run tests/unit/workbench-read-model.test.ts`: passed.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/integration-check-apply-discard.test.ts tests/unit/web-app.test.tsx`: passed.
- `npx vitest run tests/unit/integration-check-apply-discard.test.ts tests/unit/workbench-read-model.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run test:workbench`: passed.
- `npm run build`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: passed with close-ready active change and only closeout task remaining.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed; no pending evolution, 1 archived change since last completion, threshold 5.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: deterministic fixture check
  `integration-check-*-combined.patch` with matching `latestArtifactHash`;
  previous real UI acceptance remains
  `harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`.
- External source/state safety: covered by deterministic fixture source root.
  Source mutation occurs only through explicit allowlisted `apply-check.apply`.
  Stale artifact hash and source HEAD drift apply attempts fail closed without
  applying the patch.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no new runtime workaround.
  Full E-drive UI rerun was not claimed for this change because the integration
  apply path already has real UI acceptance; this change only aligns the
  derived Workbench inspector with the authoritative queue and is covered by
  deterministic Workbench projection/App DOM evidence.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

