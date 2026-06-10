# Auto Evolve Harness Phase 8G 8K Boundary Evidence

## Purpose

Handle the pending Harness evolution window generated after Phase 8K. The
candidate archives are Phase 8G, Phase 8H, Phase 8I, Phase 8J, and Phase 8K;
they cover selected-demand Spec-Test evidence, strict TaskQueue typed scope,
DemandWorker domain ownership, TaskRun / WorkerLease scoped evidence, and
workflow artifact Change-scope guards.

This change evaluates whether those archives expose a reusable Harness rule
gap. It must produce an evolution proposal, independent subagent review,
validation record, `results.tsv` row, and `harness-evolve mark-complete`
outcome. It does not implement product runtime behavior.

## Scope

In scope:

- Review `harness/evolution/pending.md` and the Phase 8G-8K archive summaries.
- Compare the evidence against existing ECL rules for module boundaries,
  handoff drift, scoped action payloads, proposal/runtime boundaries,
  source/apply safety, and scoped evidence guards.
- Use the user-authorized subagent for independent review.
- Record a `noop` or minimal `modify` decision in Harness evolution artifacts
  and results.
- Update handoff docs for the active auto-evolve change and final close state.

Out of scope:

- Product code behavior changes.
- New Workbench actions, CLI commands, HTTP routes, runtime capabilities,
  scheduler behavior, parallel execution, automatic child Changes, ODWF
  runtime, or cache/replay.
- Editing reference submodules or unrelated `README.md`.

## Current Status

Ready to close.

## Verification

Completed:

- Independent subagent review completed with `noop` recommendation and score
  `90/100`.
- Evolution proposal written at
  `harness/evolution/proposals/20260610-phase8g-8k-boundary-evidence-noop.md`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review -Notes "Phase 8G-8K reviewed; existing scoped action, proposal/runtime, module-boundary, and handoff-drift coverage is sufficient; subagent score 90."` passed; `pending.md` was removed and archive count updated to 137.

Final checks passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user authorized subagent review.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: subagent id
  `019eb114-5c56-7403-bbc7-8531c59b34e1`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: next product candidate is
  `Phase 8L: WorkflowRun Domain Boundary Split`; not part of this change.
