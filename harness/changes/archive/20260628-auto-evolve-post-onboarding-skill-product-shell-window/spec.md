# Spec: auto-evolve-post-onboarding-skill-product-shell-window

## Goal

Resolve the current `harness/evolution/pending.md` generated after the
onboarding Skill / reference-style product-shell archive window. The expected
result is a no-op Harness evolution: record the evidence, independent review,
score, and results row, then clear pending evolution without adding new rules,
templates, or product runtime behavior.

## Users

- Future AHO agents that rely on compact ECL and handoff docs.
- Maintainers who need pending evolution cleared with evidence rather than
  ignored or over-promoted.

## Acceptance Criteria

- AC-001: The five candidate archives listed in `pending.md` are reviewed and
  cited in an evolution proposal.
- AC-002: The proposal records `noop` as the recommended outcome and explains
  why existing ECL/review-template coverage is sufficient.
- AC-003: Independent subagent review/score evidence is recorded, including the
  no-op score and rejected durable-change candidates.
- AC-004: `harness-evolve mark-complete -Status noop -EvalMode subagent_review`
  clears `pending.md` and records a `results.tsv` row.
- AC-005: No product runtime, Workbench UI, Skill runtime, ECL rule, or Harness
  template changes are made.
- AC-006: Handoff docs are only updated for active/close pointers and pending
  state; detailed UI/Skills/onboarding history remains archive-only.

## Non-Goals

- Do not add another Skill/onboarding boundary rule.
- Do not add another reference-style UI or fake-control rule.
- Do not edit product code, Workbench UI, Codex bridge, Skill package, or
  provider behavior.
- Do not process future product backlog items.

## Constraints

- Follow the existing Harness evolution process: proposal, review, validation,
  `results.tsv`, mark-complete, close.
- Use existing subagent review results from this planning session as evidence;
  do not rerun or duplicate review unless current files conflict.
- Keep documentation entropy low.

## Risks

- Over-promoting product-specific implementation details into durable Harness
  rules.
- Leaving `pending.md` uncleared after deciding no-op.
- Accidentally staging unrelated local changes.
