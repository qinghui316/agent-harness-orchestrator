# Verification Scope Guidance Alignment

## Purpose

Align current verification guidance so future agents default to targeted, risk-based validation and only escalate to full product or slow Workbench suites when the touched boundary justifies it.

This is a Harness/docs alignment change. It reuses the existing npm script layers and ECL review evidence rather than adding a new validation framework.

## Scope

In scope:

- Clarify `AGENTS.md` Product verification as a scoped escalation ladder.
- Clarify tracked handoff/rule docs with task-to-command mapping for existing test scripts.
- Add durable ECL/review-template guidance for recording verification scope and full-suite rationale.
- Keep `docs/STATUS.md` handoff consistent with the updated guidance.

Out of scope:

- Product runtime, Workbench behavior, gate behavior, source apply, scheduler, Goal Loop, remote handoff, maintenance runtime, package scripts, tests, force-adding ignored `docs/DEVELOPMENT.md`, or `README.md`.
- New validation runners or new test suites.

## Current Status

Completed.

## Verification

Passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Active/handoff placeholder drift grep for unresolved placeholder-only lines, stale active-none wording, and verification-scope guidance.

Not run:

- Product tests. This change only updates tracked Harness/handoff/rule/template Markdown and `harness/changes/INDEX.json`; it does not change product source, package scripts, or test behavior.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan review subagent `019ee223-7a6a-7b82-a10d-08ae23e7e9a0` returned PASS before ECL creation and noted template alignment if ECL guidance changes.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; this change updates current handoff/rule/template docs and must keep changes compact.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: applicable for touched current docs only.
- Old experience retained / merged / retired / archive-only: existing validation-scope practice is merged into reusable current guidance rather than copied as archive narrative.
