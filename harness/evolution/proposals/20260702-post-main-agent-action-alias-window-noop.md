# Harness Evolution Proposal: Main-Agent Action Alias Window

## Candidate Window

Pending file: `harness/evolution/pending.md`.

Candidate archives:

- `harness/changes/archive/20260701-auto-evolve-post-main-agent-old-seam-retirement-window/summary.md`
- `harness/changes/archive/20260701-main-agent-old-seam-retirement-v5a-rolepipeline-read-model-canonicalization/summary.md`
- `harness/changes/archive/20260701-main-agent-old-seam-retirement-v5b-remove-workpad-rolepipeline-read-model-output/summary.md`
- `harness/changes/archive/20260701-main-agent-old-seam-retirement-v5c-role-pipeline-action-alias-readiness/summary.md`
- `harness/changes/archive/20260702-main-agent-old-seam-retirement-v5d-inbound-only-action-alias-finalization/summary.md`

## Recommendation

- Status: `docs_current_delta`
- Eval mode: `subagent_review`
- ECL rule changes: none
- Harness template changes: none
- Product runtime changes: none
- Current-doc changes: yes, repair current Harness evolution state drift in
  `docs/CURRENT-DEVELOPMENT-PLAN.md` and handoff docs.

## Rationale

This archive window reinforces existing reusable rules instead of exposing a
new durable Harness gap.

The V5a-V5d old-seam retirement work moved Workbench public read models and
action payloads from legacy role-pipeline wording toward canonical main-agent
execution terms. It did so by preserving compatibility where still needed:
`mainAgentExecution` replaced public Workpad `rolePipeline`, canonical
`main-agent.execution.*` became the public action id family, and
`role.pipeline.*` was finalized as inbound-only compatibility. V5d also kept
historical inbound echoes honest while preventing new generated outbound
legacy payloads.

Current ECL and boundary rules already cover the reusable lessons:

- Read Model Projection Coverage requires derived Workbench projections and
  role summaries to stay scoped and not become workflow truth.
- Module Boundary Coverage and Core Mechanism Reuse require owned helpers,
  compatibility facades, and tests instead of scattered string checks or
  feature-local mini-frameworks.
- Proposal / Runtime Boundary and the Orchestration Authority Matrix classify
  non-executing projections and recommendation/evidence layers as non-truth.
- Human gate, ToolPolicyGate, confirmationQueue, Scheduler, IntegrationCheck,
  apply/close, remote, PR, merge, and Harness evolution authority boundaries
  already prohibit permission expansion.
- Documentation Entropy and Experience Lifecycle already require archive-only
  handling for phase-specific helper names, exact V5 labels, and subagent
  scores unless they change present agent behavior.

Adding a `role.pipeline.*`-specific ECL rule would duplicate broader current
rules and make the Harness more brittle. The correct durable lesson is already
captured: legacy compatibility can remain inbound-only behind canonical
helpers, while new outbound/user-facing surfaces use the canonical contract and
must not expand authority.

## Independent Review

Subagent `Peirce` returned `docs_current_delta` with score `78/100`.

Key review notes:

- The candidate archive window does not expose a new ECL, Harness template,
  lint, or product runtime rule gap.
- V5a-V5d are controlled compatibility migration slices and are already covered
  by existing projection, module-boundary, core-mechanism, documentation
  entropy, and authority-boundary rules.
- The active evolution artifacts initially still contained template placeholders,
  and `docs/CURRENT-DEVELOPMENT-PLAN.md` contained a stale current-state
  contradiction: the handoff section noted pending evolution, while the current
  Harness evolution section said `Pending evolution: none`.
- Therefore this evolution should include a compact current-doc delta before
  mark-complete, rather than claiming a pure no-op.

## Experience Retention Scan

- Promote: none.
- Retain: existing ECL/BOUNDARIES rules for compatibility facades, module
  ownership, projection authority, non-executing evidence, human gates,
  ToolPolicyGate, confirmationQueue separation, automation allowlist
  non-expansion, documentation entropy, and controlled evolution.
- Merge: merge the V5a-V5d action-alias lesson into one compact current-state
  statement instead of repeating each slice in current docs.
- Retire: stale `Pending evolution: none` wording while pending evolution is
  active; do not add `role.pipeline.*`, `main-agent.execution.*`,
  `rolePipeline`, or V5 slice names as permanent Harness process rules.
- Archive-only: per-slice V5a/V5b/V5c/V5d details, exact alias inventory,
  helper names, verification command lists, subagent names/scores, and
  historical echo examples.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`

## Result

Completed as `docs_current_delta / subagent_review`.

`harness-evolve mark-complete` recorded:

`Subagent Peirce 78: no new ECL/template/lint/runtime gap from V5a-V5d action-alias lessons; repaired current-doc pending-state drift before mark-complete.`

`harness/evolution/pending.md` was removed and
`harness/evolution/state.json` now records `last_completed_archive_count: 601`.
