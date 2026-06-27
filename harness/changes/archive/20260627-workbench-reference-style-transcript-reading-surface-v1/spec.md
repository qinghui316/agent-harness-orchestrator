# Spec: workbench-reference-style-transcript-reading-surface-v1

## Goal

Make the Workbench conversation transcript read like a product chat surface instead of a log stream: user prompts should be lightweight right-aligned bubbles, assistant output should be a clean Markdown reading flow, and runtime/evidence rows should be compact expandable activity rows.

## Users

Local AHO users reading long Codex/Harness conversations in Harness mode.

## Acceptance Criteria

- AC-001: User, assistant, process, and evidence transcript cells render through separate presentation components/classes while preserving existing transcript cell identity and test ids.
- AC-002: User messages are right-aligned prompt bubbles; assistant messages render as transparent full-width reading prose.
- AC-003: Process/evidence rows are collapsed by default with a one-line summary and can expand to show details and evidence refs without triggering workflow actions.
- AC-004: MarkdownLite supports headings, bullet lists, numbered lists, blockquotes, and fenced code labels without adding a full markdown runtime.
- AC-005: Virtual rendering, cursor paging, Pretext height estimation, and long-message folding continue to work; 1000+ cells keep bounded DOM rows.
- AC-006: Transcript output does not introduce fake controls or leak forbidden internal terms such as raw stdout, `TaskRun`, or `WorkerLease` into the main conversation surface.

## Non-Goals

- Do not change backend transcript projection, SQLite storage, cursor paging, workflow truth, confirmation queue, permissions, Goal Loop, Scheduler, Automation, apply/close, or Harness evolution.
- Do not implement desktop-cc-gui's full Markdown runtime, tool grouping, copy/retry/edit/fork/rewind buttons, or message database.

## Constraints

- Reuse `ParentAgentTranscriptCell`, existing transcript paging, `TranscriptVirtualList`, Pretext measurement, and long-message folding.
- Reference `desktop-cc-gui` for visual hierarchy only; do not vendor-copy source.
- Keep activity rows read-only; expansion is frontend display state only.

## Risks

- Over-refactoring `ConversationPanel.tsx` could break existing Workbench shell contracts; split only the transcript display owner.
- Incorrect height estimates for expanded activity rows could destabilize virtual scrolling.
