# Spec: auto-evolve-post-mode-aware-loop-window

## Goal

Evaluate the pending five-archive Harness evolution window ending with
`workbench-mode-aware-local-goal-loop-v1` and decide whether any durable
Harness rule, review template, lint, or current-doc change is warranted.

## Users

- Future AHO agents using `AGENTS.md`, `docs/ECL.md`, and active/archive
  change evidence.
- The project owner, who wants Harness rules to evolve from repeated evidence
  without turning current docs into a history ledger.

## Acceptance Criteria

- AC-001: The five candidate archives from `harness/evolution/pending.md` are
  reviewed against existing ECL, review-template, and handoff rules.
- AC-002: A proposal is written under `harness/evolution/proposals/` with an
  Experience Retention Scan covering Promote, Retain, Merge, Retire, and
  Archive-only decisions.
- AC-003: The authorized subagent review is recorded with recommendation,
  score, rationale, and limitations.
- AC-004: The final decision is recorded in `harness/evolution/results.tsv`
  and `harness/evolve mark-complete` clears `pending.md`.
- AC-005: No product runtime, Workbench behavior, or permission boundary is
  changed by this Harness evolution.
- AC-006: Current handoff docs stay compact and aligned after close.

## Non-Goals

- Product runtime changes.
- New Workbench, scheduler, Goal Loop, automation, IntegrationCheck, or
  IntegrationFix capabilities.
- New ECL/template/lint rules unless the archive evidence proves a repeated
  current gap not already covered by existing rules.
- Copying E-drive sandbox paths, run ids, or detailed gate narratives into
  current handoff docs.

## Constraints

- `pending.md` is a maintenance reminder, not authority to auto-apply Harness
  rules.
- Subagent may review and score only; it must not edit canonical docs or
  source root.
- If no independent scorer were available, the only allowed result would be
  dry-run `noop`; in this change, user authorized subagent use.

## Risks

- Over-promoting one-off product blocker details into durable Harness rules.
- Duplicating already-covered Workbench user-surface, source safety, scoped
  payload, Goal Loop, module-boundary, or core-reuse rules.
- Leaving `pending.md` uncleared after starting the evolution flow.
