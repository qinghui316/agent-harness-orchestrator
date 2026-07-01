# auto-evolve-post-main-agent-action-alias-window

## Purpose

Resolve the pending Harness evolution generated after the main-agent old-seam
retirement action-alias window. The candidate archives cover V5a through V5d of
the `rolePipeline` / `role.pipeline.*` cleanup plus the previous no-op
evolution window.

The selected direction is `docs_current_delta / subagent_review`: the archive
window reinforces existing ECL and boundary coverage for canonical read-model
fields, inbound-only compatibility aliases, non-executing projections,
documentation entropy, and no permission expansion. It does not justify a new
Harness rule, template, lint, or product runtime change, but it does require a
small current-doc drift repair because `docs/CURRENT-DEVELOPMENT-PLAN.md`
simultaneously mentioned the pending evolution and said pending evolution was
none.

## Scope

In scope:

- Review the five candidate archive summaries named in `harness/evolution/pending.md`.
- Compare the repeated lessons against current `docs/ECL.md`, `docs/BOUNDARIES.md`,
  `AGENTS.md`, and handoff docs.
- Record an independent subagent review and score.
- Write a Harness evolution proposal and results row.
- Repair compact current-doc pending-state drift.
- Mark the pending evolution complete if the review confirms no durable gap.

Out of scope:

- Product runtime, Workbench UI, action registry behavior, confirmationQueue,
  automation allowlist, Scheduler, IntegrationCheck, apply/close, remote, PR,
  merge, normal Agent mode, or Harness template/rule changes.
- Deleting `role.pipeline.*`, `MainAgentLoopProjection`, internal
  `rolePipeline`, or any Scheduler / IntegrationCheck owner.

## Current Status

Completed.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status docs_current_delta -EvalMode subagent_review -Notes "Subagent Peirce 78: no new ECL/template/lint/runtime gap from V5a-V5d action-alias lessons; repaired current-doc pending-state drift before mark-complete."` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 status` - passed; pending evolution is now `no`, archive count `601`, last completed archive count `601`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution, 0 archived changes since last completion.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed before close; close-ready with all tasks complete after validation update.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Peirce recommended
  `docs_current_delta / subagent_review`, score `78/100`, because current-plan
  pending-state drift must be repaired before mark-complete.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: repaired current pending-state drift; kept V5
  details archive/proposal-scoped. Line counts after the compact update:
  `AGENTS.md` 495, `docs/STATUS.md` 757,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 538.
- Experience lifecycle result: `docs_current_delta`; no new ECL/template/lint or
  product runtime change.
- Roadmap/current-direction stale language check: stale `Pending evolution:
  none` wording must be retired.
- Old experience retained / merged / retired / archive-only: retain broad ECL
  rules, merge V5a-V5d into one compact current lesson, retire stale pending
  wording, keep exact V5 details archive-only.
