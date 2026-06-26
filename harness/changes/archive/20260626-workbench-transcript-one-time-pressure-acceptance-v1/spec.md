# Spec: workbench-transcript-one-time-pressure-acceptance-v1

## Goal

Prove whether the existing paged and virtualized Workbench transcript V1 is
good enough for tens of thousands of local conversation messages, using
synthetic pressure data rather than real Codex runs.

## Users

Local AHO users who keep long Workbench demand conversations open and need the
main conversation surface to remain responsive.

## Acceptance Criteria

- AC-001: One-time synthetic pressure acceptance records 1k, 10k, and 50k cell
  results without invoking Codex or writing durable large fixtures.
- AC-002: Lightweight regression coverage proves latest-page and earlier-page
  transcript paging preserve order, ids, and total-count metadata.
- AC-003: Lightweight regression coverage proves frontend virtual rendering
  keeps a 50k-row transcript range bounded to visible rows plus overscan.
- AC-004: Lightweight regression coverage proves long-message preview/folding
  remains bounded and usable when pretext measurement falls back.
- AC-005: Pressure data is deleted or never written durably; no generated large
  data enters Git, package defaults, or Harness archives.
- AC-006: Closeout records whether V2 cursor-aware incremental transcript
  projection is needed.

## Non-Goals

- Do not run real Codex for pressure testing.
- Do not add large fixtures to the repository.
- Do not add the pressure path to `test:fast`, default `test:workbench`, build,
  or CI.
- Do not introduce a central workflow database, durable scroll/expanded state,
  second transcript renderer, or new workflow truth.

## Constraints

- Keep the default transcript source boundary: `ParentAgentTranscriptCell[]`
  remains the canonical projection consumed by the Workbench conversation tab.
- Pressure data must be generated in memory or under a temporary E-drive path
  and removed before close.
- Daily regression tests must stay small enough for normal development.

## Risks

- Strict timing assertions can be flaky across local machines; performance
  measurements should be recorded as acceptance evidence, while CI assertions
  should focus on structural limits.
- V1 still builds the full canonical transcript before slicing; if 50k pressure
  shows backend build cost is high, V2 should be a separate incremental
  projection change.

