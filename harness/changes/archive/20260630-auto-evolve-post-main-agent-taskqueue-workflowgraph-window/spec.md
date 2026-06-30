# Spec: auto-evolve-post-main-agent-taskqueue-workflowgraph-window

## Goal

Resolve the pending Harness evolution window created after five recent
main-agent orchestration migration archives.

The expected outcome is a no-op closeout if existing ECL and architecture
documents already cover the retained lessons.

## Candidate Archives

- `harness/changes/archive/20260630-auto-evolve-post-main-agent-orchestration-migration-window/summary.md`
- `harness/changes/archive/20260630-main-agent-next-step-decision-evidence-v1/summary.md`
- `harness/changes/archive/20260630-main-agent-decision-to-action-bridge-contract-v1/summary.md`
- `harness/changes/archive/20260630-main-agent-taskrun-lifecycle-rework-ownership-v1/summary.md`
- `harness/changes/archive/20260630-main-agent-taskqueue-workflowgraph-lifecycle-ownership-v1/summary.md`

## Acceptance Criteria

- AC-001: The pending evolution window is reviewed against current ECL,
  boundaries, agent-model, and roadmap docs.
- AC-002: The result is recorded as either no-op or an explicit rule/template
  update proposal.
- AC-003: Independent review evidence records why the chosen result is safer
  than adding more rules.
- AC-004: `scripts/harness-evolve.ps1 mark-complete` records the result and
  clears `harness/evolution/pending.md`.
- AC-005: Product code, Workbench UI, main-agent runtime, Harness templates, and
  ECL rules remain unchanged when the result is no-op.

## Non-Goals

- New Harness rules for individual function names or internal file paths.
- Product runtime, Workbench UI, Scheduler, Goal Loop, apply/close, remote, PR,
  merge, or Harness evolution behavior changes.
- Re-running product suites for a no-op evolution closeout.

## Risks

- Adding another specific rule for the latest architecture slice could bloat
  ECL without improving future behavior.
- Ignoring pending evolution would leave Harness state dirty and force the next
  agent to handle stale process debt.
