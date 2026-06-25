# Post Feedback Real UI Window Evolution Proposal

## Window

Pending file: `harness/evolution/pending.md`

Candidate archives:

- `harness/changes/archive/20260625-auto-evolve-post-loop-boundary-window/summary.md`
- `harness/changes/archive/20260625-workbench-codex-plan-mode-post-plan-local-autonomy-v1/summary.md`
- `harness/changes/archive/20260625-workbench-post-apply-local-landing-autonomy-v1/summary.md`
- `harness/changes/archive/20260625-workbench-confirmation-feedback-to-rework-v1/summary.md`
- `harness/changes/archive/20260625-workbench-confirmation-feedback-real-ui-scout-v1/summary.md`

## Recommendation

Status: `noop`

No ECL rule, review-template field, lint rule, product runtime change, or new Harness mechanism is recommended for this window.

The useful lessons are already covered by current Harness rules:

- controlled evolution remains human-gated and outside `完全访问权限`;
- documentation entropy and experience lifecycle prevent append-only docs growth;
- Workbench user-surface honesty and read-model projection coverage require current primary gates to suppress stale historical context;
- scoped action payload and current-gate revalidation rules already cover stale, forged, missing, and cross-change target checks;
- source safety and human gates cover result/apply feedback and local apply/close;
- proposal/runtime boundary rules keep Codex Plan Mode output as proposal evidence, not workflow truth;
- module-boundary and core-reuse rules discourage new feedback runtimes, permission systems, or projection frameworks.

The lifecycle action is compact current-state alignment: while this change is active, entry/handoff docs should name the active Harness evolution and pending state; after `mark-complete` and close, they should point to the archived evolution and state that no pending evolution remains. This is ordinary closeout handoff, not a durable current-doc rule change.

## Evidence Summary

### Previous Auto-Evolve Window

`auto-evolve-post-loop-boundary-window` completed `docs_merge`. It already verified controlled evolution, loop-per-Change boundaries, scoped `完全访问权限`, same-Change IntegrationCheck, and compact handoff alignment without adding product runtime or new rules.

### Codex Plan Mode + Post-Plan Local Autonomy

`workbench-codex-plan-mode-post-plan-local-autonomy-v1` introduced Codex Plan Mode proposal capture while preserving human plan confirmation and AHO canonical planning artifacts. The native PlanDelta path was unavailable in the accepted run, so the prompt-level `<proposed_plan>` fallback was used honestly. This is already covered by proposal/runtime boundary and human-gate rules.

### Post-Apply Local Landing Autonomy

`workbench-post-apply-local-landing-autonomy-v1` added existing local `landing.prepare` to scoped local automation after local apply, then allowed local close when it was the next gate. It explicitly stopped at PR, remote, merge, post-merge, integration apply/discard, Harness evolution, or blockers. Existing source safety, scoped action, and human-gate rules cover this.

### Confirmation Feedback To Rework

`workbench-confirmation-feedback-to-rework-v1` routed plan-confirm feedback to existing `planning.revise` and result/apply feedback to existing bounded `result.refresh-rework`. It avoided a new feedback runtime or permission system. Existing module-boundary, core-reuse, scoped payload, and source safety rules cover the implementation lesson.

### Confirmation Feedback Real UI Scout

`workbench-confirmation-feedback-real-ui-scout-v1` verified the two feedback loops in real UI and found one product blocker: after a newer rework audit blocked, an older same-Change apply gate could remain current. The fix demotes old worktree apply approvals when current validation/audit blockers exist. This is already covered by Workbench user-surface honesty and read-model projection coverage, so it should remain product evidence rather than become a new ECL rule.

## Independent Review

Subagent: `019eff0f-0bc3-7670-b885-45a1f4be2c15` (Ptolemy)

Recommendation: `noop`.

Score: 88/100.

Rationale: current ECL already covers controlled evolution, documentation entropy, experience lifecycle, feedback authority, stale primary gate suppression, and the rule that Harness evolution is not consumed by `完全访问权限`. Real UI run ids, sandbox paths, retries, and blocked audit details should remain archive-only.

Limitations: read-only review; subagent did not own ECL lifecycle or edit canonical docs/source.

## Experience Retention Scan

### Promote

None. No new durable ECL/template/lint rule is warranted from this window.

### Retain

- Human plan confirmation remains required even when `完全访问权限` is selected as the post-plan execution mode.
- Codex Plan Mode output is proposal evidence and must be converted into accepted AHO artifacts only through confirmation.
- Scoped local automation may consume only current selected-Change local gates with fresh target ids, source state, accepted artifact hashes, and existing safety checks.
- Confirmation feedback is scoped evidence that routes to revise/rework; it is not approval and does not bypass plan confirmation, apply, close, remote, merge, or Harness evolution.
- Workbench primary surfaces must suppress stale historical apply approvals when newer validation/audit blockers exist.
- Harness evolution remains a separate human-gated maintenance path.

### Merge

None as a durable Harness change. The closeout still updates active/pending/final state in handoff docs as required by normal ECL lifecycle.

### Retire

None.

### Archive-only

- E-drive sandbox paths, Workbench URLs, demand ids, run ids, Codex artifact ids, retry notes, environment notes, and exact UI text from the scout.
- The specific `decision-inspector` blocker history after the product fix is verified and recorded in archive.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review ...`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Product tests are not required because this evolution changes Harness proposal/result/handoff state only, not product runtime behavior.
