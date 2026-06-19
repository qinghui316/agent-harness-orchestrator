# Review: auto-evolve-harness-candidate-window-order

Status: complete.

## Findings

None.

Independent review result: PASS. The reviewer confirmed the script repair is narrow, the regenerated pending window matches corrected candidate evidence, the proposal includes the required Experience Retention Scan, and handoff docs were aligned during the active pending evolution.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` regenerated pending with the corrected maintenance canonical patch candidate window.
- Pending candidate assertion passed: no stale Workbench helper-reuse candidates and no auto-evolve archive candidate remained in `harness/evolution/pending.md`.
- `powershell -NoProfile -ExecutionPolicy Bypass -Command "\`$null = [scriptblock]::Create((Get-Content -LiteralPath 'scripts\harness-evolve.ps1' -Encoding UTF8 -Raw)); Write-Host 'harness-evolve syntax parsed'"` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported expected incomplete state with `STATUS aligned: True`.
- Independent evolution review passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review ...` passed.
- `harness/evolution/results.tsv` appended a `keep / independent_review / archive_count=307` row.
- `harness/evolution/state.json` updated `last_completed_archive_count` to 307.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 status` reported archive changes 307, last completed archive count 307, and pending evolution no.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 close` passed and reported no pending evolution.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed after post-close handoff cleanup.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` passed after close with active change none, `STATUS aligned: True`, and recommendation safe to create a new structured change.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed after close: no pending evolution, 1 archived change since last completion, threshold 5.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after post-close handoff cleanup.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed after post-close handoff cleanup.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent plan review required corrected-window evaluation after script repair; independent review required updating this review file from template pending/not-applicable coverage before close.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, `harness/evolution/proposals/20260619-candidate-window-order-keep.md`.
- If applicable, before/after line counts: active-state counts were `AGENTS.md` 145 lines, `docs/STATUS.md` 94 lines, `docs/ECL.md` 449 lines, and `scripts/harness-evolve.ps1` 111 lines; final post-close counts are `AGENTS.md` 145 lines, `docs/STATUS.md` 94 lines, `docs/ECL.md` 449 lines, and `scripts/harness-evolve.ps1` 111 lines.
- If applicable, duplicate current-state fields checked: active path, pending evolution state, latest product archive, latest Harness evolution, active product phase, and active Harness evolution phase agreed between `AGENTS.md`, `docs/STATUS.md`, and the active change before close; final handoff now says no active and no pending.
- If applicable, roadmap/current-direction stale language checked: `docs/CURRENT-DEVELOPMENT-PLAN.md` still points to Architecture Growth Control / Core Mechanism Reuse and does not need a new current-plan paragraph for this machinery repair.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: detailed Workbench duplicate-window and maintenance helper-reuse narratives remain in archive/proposal evidence; current docs only route agents to the active evolution.
- If applicable, over-budget documents and rationale: `AGENTS.md` remains within the mature-harness target budget; `docs/STATUS.md` remains a short handoff rather than an archive ledger.
- If applicable, tested with: `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 status`, `scripts/harness-evolve.ps1 check`, independent review.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: promote focused Harness machinery repair for close-order candidate selection and auto-evolve archive exclusion from candidate evidence.
- If applicable, retain decisions: retain existing Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Close/Handoff Drift, ToolPolicy, and human-gate rules.
- If applicable, merge decisions: maintenance canonical patch helper-reuse lessons merge into the existing shared-owner/core-mechanism rule rather than a new phase-specific rule.
- If applicable, retire decisions: stale active/pending handoff wording retired during final close.
- If applicable, archive-only decisions: duplicate Workbench candidate window, detailed maintenance helper-reuse phase narratives, and durable archive-id watermark idea remain archive/proposal-only unless future evidence requires a larger design.
- If applicable, noop / no-change rationale after old-experience scan: not applicable; this evolution keeps a focused script repair and does not add broader rules/templates.
- If applicable, tested with: proposal review and independent evolution review.
- If not applicable, reason: not applicable.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `scripts/harness-evolve.ps1`.
- If applicable, module owners checked: lightweight Harness evolution candidate ordering remains in the existing Harness evolution script owner.
- If applicable, moved responsibilities: no cross-module move; candidate selection is repaired inside the existing owner.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: product source, Workbench, Scheduler, Goal Loop, ToolPolicyGate, human gates, runtime bridges, remote handoff, and README were not changed.
- If applicable, compatibility surface: `check`, `status`, `mark-complete`, `state.json`, `pending.md`, and `results.tsv` surfaces remain compatible.
- If applicable, behavior path tested: regenerated pending evidence after `harness-evolve.ps1 check`.
- If applicable, follow-up split candidates: durable archive-id watermark can be considered later, but is out of scope.
- If applicable, boundary tests or lint checks: syntax parse, pending candidate assertion, `lint-ecl.ps1`, `lint-encoding.ps1`.
- If applicable, compatibility result: compatible.
- If applicable, tested with: `harness-evolve.ps1 check`, syntax parse, independent review.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing lightweight Harness evolution threshold/check/proposal/review/mark-complete mechanism.
- If applicable, new cross-cutting mechanism and owner: no new mechanism; candidate ordering and filtering are repaired in `scripts/harness-evolve.ps1`.
- If applicable, why existing mechanisms were insufficient: name-only ordering produced stale candidate evidence after later archive names sorted before older Workbench archive names; date-prefixed auto-evolve archive names were not excluded from candidate evidence.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: `scripts/harness-evolve.ps1`.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoids a parallel manual evolution evaluator or broad state migration.
- If applicable, public API / facade / Workbench compatibility result: compatible; no product or Workbench surface changes.
- If applicable, future-cost reduction result: future pending windows should point at current close-order evidence and avoid repeated already-reviewed windows.
- If applicable, tested with: regenerated pending evidence, assertion scan, independent review.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, archived change summary, `harness/evolution/pending.md`.
- If applicable, stale active-path / phase grep: final handoff docs now say no active ECL change and no pending Harness evolution.
- If applicable, latest archive / active path alignment: latest product archive is Maintenance Canonical Patch Application Authority Helper Reuse; latest Harness evolution points to this archived auto-evolve summary.
- If applicable, pending evolution state checked: `harness/evolution/pending.md` is absent after `mark-complete`; close reported no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
