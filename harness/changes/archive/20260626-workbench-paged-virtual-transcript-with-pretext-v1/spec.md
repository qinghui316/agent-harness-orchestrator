# Spec: workbench-paged-virtual-transcript-with-pretext-v1

## Goal

Workbench conversation history remains responsive when a demand has thousands
or tens of thousands of transcript rows, or when one Codex message is very
large.

## Users

Local AHO users reading long demand conversations in the Workbench `对话` tab.

## Acceptance Criteria

- AC-001: Workbench can request a bounded transcript page for a selected demand
  without breaking the existing full transcript compatibility path.
- AC-002: Paged transcript results preserve canonical cell order, stable cell
  ids, source-boundary behavior, and detail-only filtering from the existing
  `ParentAgentTranscriptCell[]` projection.
- AC-003: The conversation tab renders only the viewport-adjacent transcript
  rows plus overscan, not every loaded or available row.
- AC-004: Scrolling near the top loads earlier transcript pages and merges them
  without duplicate cells or order drift.
- AC-005: Very long user/assistant messages are folded by default, do not render
  their full markdown DOM until expanded, and can be expanded by the user.
- AC-006: `@chenglou/pretext` is used only for height estimation; if it fails or
  browser measurement support is unavailable, Workbench falls back to conservative
  estimates and remains usable.
- AC-007: Default transcript source-boundary rules remain intact: workflow
  summaries, raw stdout/stderr, raw command text, `TaskRun`, `WorkerLease`, and
  synthetic `执行结果` style text do not enter the default conversation.

## Non-Goals

- No central database, durable UI state, backend incremental transcript
  builder, new transcript source of truth, new markdown renderer, or workflow
  behavior changes.

## Constraints

- Preserve existing full transcript endpoint behavior for compatibility.
- UI paging/virtualization state is ephemeral frontend state only.
- Do not vendor-copy the pretext repository; use the npm package.
- Do not change `ParentAgentTranscriptCell` authority or meaning.

## Risks

- Scroll anchoring regressions when earlier rows are prepended.
- Virtualization hiding rows expected by older tests.
- Pretext/browser measurement mismatch for markdown/code/process rows.
- Accidentally treating the paged projection as a new source of truth.

