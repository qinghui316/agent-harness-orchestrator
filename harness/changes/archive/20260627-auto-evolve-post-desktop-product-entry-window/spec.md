# Spec: auto-evolve-post-desktop-product-entry-window

## Goal

Evaluate the pending Harness evolution window and apply the smallest
evidence-backed Harness delta. The key repeated lesson is that
`desktop-cc-gui` product-layer references must be implemented from inspected
source behavior, not screenshots or conceptual map summaries, and Workbench UI
must not display reference-style controls until the behavior is implemented.

## Users

- Future AHO agents planning product-layer Workbench changes.
- The project owner, who needs current docs to steer product work without
  accumulating archive narrative.

## Acceptance Criteria

- AC-001: The five candidate archives are reviewed and classified through an
  Experience Retention Scan.
- AC-002: Independent subagent review is recorded with a recommendation and
  score.
- AC-003: A compact ECL/review-template rule covers reference-driven UI/source
  evidence without changing product runtime.
- AC-004: Current handoff docs are aligned on active/pending/latest evolution
  state and the next product direction.
- AC-005: The evolution result is recorded in `harness/evolution/results.tsv`
  and `harness/evolution/pending.md` is removed by `harness-evolve
  mark-complete`.

## Non-Goals

- Do not modify Workbench runtime or UI behavior.
- Do not stage or modify local reference project source.
- Do not add a lint rule; the new check is semantic review coverage.
- Do not promote detailed screenshots, ports, E-drive paths, or long archive
  narratives into current docs.

## Constraints

- Pending Harness evolution must use proposal, independent review, validation
  result, `results.tsv`, and `mark-complete`.
- Harness evolution remains human-gated evidence work; it must not apply
  product changes automatically.
- Current docs must stay compact and route future agents to reference maps,
  source files, and archives instead of copying historical detail forward.

## Risks

- Over-promoting one UI correction could create unnecessary process overhead.
- Under-recording the lesson could let future agents keep copying screenshots
  instead of reading reference source and wiring real controls.
- `docs/STATUS.md` contains stale lower-section pending/latest wording that can
  misroute the next agent if not aligned.
