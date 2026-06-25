# Spec: auto-evolve-post-loop-boundary-window

## Goal

Complete the pending Harness evolution window for the five archived changes
listed in `harness/evolution/pending.md`, while preventing documentation
growth and avoiding product runtime changes.

## Users

- Future agents who need accurate current handoff state.
- Maintainers who need Harness evolution to extract reusable lessons without
  turning archives into current-doc bloat.

## Acceptance Criteria

- AC-001: The pending window is evaluated against candidate archive summaries,
  current ECL rules, handoff docs, and current plan docs.
- AC-002: The evolution proposal includes an Experience Retention Scan with
  Promote, Retain, Merge, Retire, and Archive-only decisions where applicable.
- AC-003: An authorized subagent provides independent review/scoring and its
  recommendation is recorded.
- AC-004: Any current-doc drift found during the scan is resolved with the
  smallest docs merge; if no durable delta is justified, the result is recorded
  as `noop`.
- AC-005: `harness/evolution/results.tsv` records the terminal result and
  `harness/evolution/pending.md` is cleared through `harness-evolve
  mark-complete`.
- AC-006: Handoff docs and Harness checks agree after close.

## Non-Goals

- Product runtime, Workbench UI, scheduler, automation, or IntegrationCheck
  changes.
- New ECL rules, lint checks, templates, or review fields without repeated
  evidence and independent review support.
- Copying detailed archive history into `AGENTS.md`, `docs/STATUS.md`, or
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.

## Constraints

- `harness/evolution/pending.md` is human-gated and must not be auto-applied
  by `完全访问权限`.
- Subagent review is allowed by the user, but subagents do not own ECL
  lifecycle or edit canonical files.
- `README.md` remains unrelated and untracked.

## Risks

- Over-promoting product-specific lessons into generic Harness rules.
- Missing a real handoff drift caused by the fast sequence of scoped
  automation, local autonomy, and loop boundary changes.
- Adding new process text when existing rules already cover the lesson.

