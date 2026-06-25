# document-minimality-gate-and-complexity-review

## Purpose

Add a lightweight minimality gate and complexity deletion review to the AHO
Harness rules and templates. The goal is to make future agents check
delete/reuse/shrink options before adding new code, evidence layers,
projections, or local frameworks.

This is a docs/Harness constraint change only. It does not change product
runtime behavior.

## Scope

In scope:

- `AGENTS.md` minimal implementation guidance.
- `docs/ECL.md` minimality / complexity control rule.
- Harness change `plan.md` and `reviews/review.md` templates.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` architecture growth control wording.

Out of scope:

- Product runtime behavior.
- Installing or vendoring Ponytail.
- New lint enforcement beyond existing Harness checks.

## Current Status

Completed. Ready to close.

## Verification

Passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Drift checks passed for Ponytail dependency/runtime leakage and for not
weakening source safety, validation/audit, ToolPolicyGate, or human gates.

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

- Documentation entropy check: recorded in `reviews/review.md`.
- Experience lifecycle result: not applicable; this was user-requested, not
  pending auto-evolution.
- Roadmap/current-direction stale language check: current plan updated in place.
- Old experience retained / merged / retired / archive-only: Ponytail remains
  reference evidence in this change archive only; no runtime dependency or
  reference history was promoted into current docs.

