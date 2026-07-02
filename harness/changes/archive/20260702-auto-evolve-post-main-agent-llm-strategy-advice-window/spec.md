# Spec: auto-evolve-post-main-agent-llm-strategy-advice-window

## Goal

Decide whether the latest five archive changes require Harness evolution after
introducing resume continuation, bounded strategy advice consumption, and
current-run LLM strategy advice production.

## Acceptance Criteria

- AC-001: Candidate archive summaries are reviewed against current ECL and
  boundary coverage.
- AC-002: Independent review records whether a new rule/template/lint/runtime
  change is required.
- AC-003: If no durable gap exists, no product runtime or Harness rule/template
  change is made.
- AC-004: `harness-evolve mark-complete` records the selected result and
  removes `harness/evolution/pending.md`.
- AC-005: Handoff docs and Harness indexes are aligned after close.

## Non-Goals

- Product feature implementation.
- New automation authority, Scheduler authority, Workbench UI, action type,
  confirmationQueue behavior, apply/close behavior, or normal Agent mode work.
