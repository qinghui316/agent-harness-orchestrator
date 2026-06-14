# Phase 10H-10L Goal Loop Packet Freshness Evolution Proposal

## Window

- `harness/changes/archive/20260614-phase-10h-goal-loop-evidence-projection-resume-surface/summary.md`
- `harness/changes/archive/20260614-phase-10i-goal-loop-next-step-packet-evidence/summary.md`
- `harness/changes/archive/20260614-phase-10j-goalloopnextsteppacket-main-agent-context-boundary/summary.md`
- `harness/changes/archive/20260614-phase-10k-goal-loop-existing-gate-recommendation-coverage/summary.md`
- `harness/changes/archive/20260614-phase-10l-goal-loop-packet-freshness-confirmation-alignment/summary.md`

## Recommendation

Status: `modify`

Eval mode: `subagent_review`

Independent review score: `88/100`

## Evidence

The archived window shows a progression from read-only Goal Loop Workpad projection to next-step packet evidence, then main-Agent context consumption, broader existing-gate recommendations, and finally packet freshness / confirmation alignment. Existing Harness rules already cover the largest risks: Goal Loop recommendations are evidence-only, fallback-only, scoped to existing actions, and must preserve ToolPolicyGate / human gates.

The remaining reusable gap is narrower: future changes that touch Goal Loop packets, prompt context, or Workpad current recommendation surfaces need an explicit review prompt to prove stale packet suppression. Phase 10L fixed the product path, and `docs/BOUNDARIES.md` records the boundary, but `docs/ECL.md` and `harness/templates/change/reviews/review.md` did not explicitly ask reviewers to check packet freshness / stale-context suppression.

## Accepted Delta

- Add one Goal Loop packet freshness paragraph to `docs/ECL.md` section 14.
- Add two Goal Loop review-template fields:
  - `packet / main-Agent context freshness checked`
  - `stale or superseded packet suppression checked`
- Do not add `scripts/lint-ecl.ps1` logic. This is semantic and change-specific; generic static lint would be brittle unless it only checked template headings.

## Subagent Review

Subagent scope: read-only review of Phase 10H-10L archive summaries plus `docs/ECL.md`, `docs/BOUNDARIES.md`, `harness/templates/change/reviews/review.md`, and `scripts/lint-ecl.ps1`.

Recommendation: `modify/subagent_review`.

Score: `88/100`.

Limitations: subagent did not edit files or run validation. It also noted the active evolution ECL artifacts were incomplete at the time of review; this change completes them before close.

## Non-Goals

- No product runtime behavior change.
- No new Workbench action, route, CLI command, UI, scheduler loop, worker start, source mutation, or artifact runtime shape.
- No broad module refactor.

## Validation

Planned verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
