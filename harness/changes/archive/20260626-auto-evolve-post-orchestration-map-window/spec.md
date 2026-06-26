# Spec: auto-evolve-post-orchestration-map-window

## Goal

Resolve the pending Harness evolution reminder generated after five archived
changes by reviewing the candidate window, deciding whether durable Harness
rules should change, recording independent review, and marking the evolution
complete.

## Users

- Future AHO agents resuming from current handoff docs.
- Maintainers who rely on ECL/Harness evolution to prevent rule drift and
  documentation bloat.

## Acceptance Criteria

- AC-001: Candidate archive summaries are reviewed and classified through an
  Experience Retention Scan.
- AC-002: Independent subagent review is recorded, or an explicit unavailable
  evaluator limitation is recorded.
- AC-003: An evolution proposal and `results.tsv` row are produced, and
  `harness/evolution/pending.md` is removed through `harness-evolve
  mark-complete`.
- AC-004: Current handoff docs agree on active/pending/latest evolution state
  without copying archive-only detail forward.
- AC-005: Harness verification passes.

## Non-Goals

- No product runtime, Workbench UI, scheduler, transcript, automation, apply,
  close, or source behavior changes.
- No new ECL rule, template field, lint, or script unless the candidate window
  exposes an uncovered repeated process gap.
- No automatic Harness evolution application through Workbench/full-access.

## Constraints

- Follow ECL pending evolution handling: proposal, independent review,
  validation result, results row, and `mark-complete`.
- Keep `AGENTS.md` and `docs/STATUS.md` compact; archive details remain in
  archive summaries and `harness/changes/INDEX.json`.
- Continue excluding unrelated untracked `README.md`.

## Risks

- Over-promoting one-off UI or pressure-test details into permanent rules could
  increase documentation entropy.
- Under-recording the window could leave `pending.md` stale and confuse the
  next agent.
