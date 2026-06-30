# Spec: auto-evolve-post-main-agent-orchestration-window

## Goal

Close the generated Harness evolution window as a deliberate no-op before
starting the main-agent architecture migration.

## Users

- AHO maintainers who need pending Harness evolution handled before new
  structured architecture work.
- Future agents who need archive implementation details to remain archive-only
  unless a real durable rule is missing.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is cleared by `mark-complete`.
- AC-002: `harness/evolution/results.tsv` records `noop /
  subagent_review` for this archive count.
- AC-003: No new ECL rule, Harness template, product runtime, or UI change is
  introduced by this evolution pass.
- AC-004: Harness lint, encoding lint, reindex/status, and evolve check pass.

## Non-Goals

- Do not modify product source, Workbench UI, Codex bridge, Skills, Git,
  diagnostics, TerminalRuntime, Scheduler, Goal Loop, apply/close, remote, PR,
  merge, or Harness templates/rules.
- Do not promote screenshot paths, local ports, temporary project names, exact UI
  labels, or implementation details into durable current docs.

## Constraints

- Existing ECL and boundary docs already cover user-surface honesty,
  runtime/projection boundaries, documentation entropy, and main-agent
  migration boundaries.
- The upcoming orchestration migration must be a separate structured change.

## Risks

- Adding another broad Harness rule would increase documentation entropy.
- Mitigation: record a no-op result and keep archive-specific detail
  archive-only.
