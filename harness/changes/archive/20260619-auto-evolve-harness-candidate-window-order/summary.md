# auto-evolve-harness-candidate-window-order

## Purpose

Handle the pending Harness evolution generated after the latest product close and repair the candidate-window ordering that produced stale pending evidence.

The pending snapshot repeats the five Workbench helper-reuse archives already reviewed by the previous Harness evolution at archive count 302. The observed cause is that `scripts/harness-evolve.ps1` counts eligible archives but selects candidate summaries from archives sorted by directory name. Newer `maintenance-*` archives sort before older `workbench-*` archives, so the generated pending window can point at an already reviewed window instead of the latest close-order evidence.

## Scope

In scope:

- Update `scripts/harness-evolve.ps1` so candidate selection uses a close-order proxy (`LastWriteTimeUtc`, then name) instead of name-only ordering.
- Regenerate `harness/evolution/pending.md` and evaluate the corrected candidate window.
- Produce an evolution proposal with an Experience Retention Scan that treats the duplicate Workbench window as already reviewed/archive-only.
- Run independent review, Harness validation, and `scripts/harness-evolve.ps1 mark-complete`.
- Keep `AGENTS.md` and `docs/STATUS.md` aligned during active evolution and after close.

Out of scope:

- No product runtime changes.
- No ECL rule/template/lint expansion beyond the focused script repair.
- No Workbench, Scheduler, Goal Loop, ToolPolicyGate, human-gate, source mutation, remote, or README changes.
- No copying archive narratives into current docs.

## Current Status

Completed.

Script repair, corrected-window proposal, independent evolution review, validation, `mark-complete`, close, and post-close handoff cleanup are complete.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` regenerated pending with the corrected maintenance canonical patch candidate window.
- Pending candidate assertion passed: no stale Workbench helper-reuse candidates and no auto-evolve archive candidate remained.
- `powershell -NoProfile -ExecutionPolicy Bypass -Command "\`$null = [scriptblock]::Create((Get-Content -LiteralPath 'scripts\harness-evolve.ps1' -Encoding UTF8 -Raw)); Write-Host 'harness-evolve syntax parsed'"` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- Independent evolution review: PASS.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review ...` passed.
- Pending evolution after `mark-complete`: none.
- `harness/evolution/results.tsv` appended a `keep / independent_review / archive_count=307` row.
- `harness/evolution/state.json` updated `last_completed_archive_count` to 307.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 close` passed and reported no pending evolution.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; active handoff docs are updated temporarily and must return to no-active/no-pending state after close.
- Experience lifecycle result: `keep`; focused script repair retained, no broader rule/template/docs expansion.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: recorded in `harness/evolution/proposals/20260619-candidate-window-order-keep.md`.
