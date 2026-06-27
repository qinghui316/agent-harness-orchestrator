# Spec: auto-evolve-post-slash-skill-window

## Goal

Evaluate the pending Harness evolution window created after the reference-style
composer / Skills product-layer work. Decide whether the archived evidence
requires a durable ECL/template/lint/docs change, or whether existing rules are
enough and only compact handoff alignment is needed.

## Users

- Future AHO coding agents that rely on ECL / AGENTS / STATUS to decide how to
  implement reference-driven UI/product work.
- Maintainers who need Harness evolution to improve rules without bloating
  current docs.

## Acceptance Criteria

- AC-001: Read the pending archive window and record a proposal with an
  Experience Retention Scan.
- AC-002: Obtain independent subagent review / scoring and record its
  recommendation.
- AC-003: Apply only the smallest evidence-backed docs / ECL / template delta,
  or record a no-op when existing rules are sufficient.
- AC-004: Fix any current handoff drift discovered during the scan.
- AC-005: Record `results.tsv`, run `harness-evolve mark-complete`, and remove
  `harness/evolution/pending.md`.
- AC-006: Run Harness verification and close/archive the evolution change.

## Non-Goals

- Product runtime, Workbench UI, Codex bridge, Skills runtime, Scheduler,
  automation, apply/close, remote, merge, PR, or Harness evolution product
  behavior changes.
- New reference-project source tracking, vendoring, or gitlinks.
- Promoting detailed E-drive paths, screenshots, ports, or run ids into current
  entry docs.

## Constraints

- Existing ECL already includes reference-driven source evidence coverage; do
  not duplicate it unless the archive window shows a clear gap.
- Current docs must stay compact; archive narratives remain archive-only.
- Subagent review is evidence, not authority; the main agent owns final
  proposal, validation, and closeout.

## Risks

- Over-promoting one product iteration into permanent Harness rules would make
  future agents slower and documents noisier.
- Under-promoting a repeated fake-control / reference-source lesson could let
  future UI work drift back into unsupported controls.
- STATUS and CURRENT contain duplicated or stale pending/latest wording; any
  docs merge must stay narrow.
