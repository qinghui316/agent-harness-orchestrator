# Spec: auto-evolve-post-main-agent-workflowgraph-replay-window

## Goal

Resolve the pending Harness evolution window created after five recent
main-agent TaskQueue / WorkflowGraph / replay-summary archives.

The expected outcome is a no-op closeout if existing ECL, boundary, and
handoff documents already cover the retained lessons.

## Candidate Archives

- `harness/changes/archive/20260630-auto-evolve-post-main-agent-taskqueue-workflowgraph-window/summary.md`
- `harness/changes/archive/20260630-main-agent-workflowgraph-queue-step-loop-contract-v1/summary.md`
- `harness/changes/archive/20260701-main-agent-workflowgraph-observation-evidence-queue-wrapper-drain-v1/summary.md`
- `harness/changes/archive/20260701-main-agent-workflowgraph-observation-cleanup-queue-wrapper-removal-v1/summary.md`
- `harness/changes/archive/20260701-main-agent-workflowgraph-replay-summary-builder-v1/summary.md`

## Acceptance Criteria

- AC-001: The pending evolution window is reviewed against current ECL,
  boundaries, agent-model, and status docs.
- AC-002: The result is recorded as either no-op or an explicit rule/template
  update proposal.
- AC-003: Independent review evidence records why the chosen result is safer
  than adding more rules.
- AC-004: `scripts/harness-evolve.ps1 mark-complete` records the result and
  clears `harness/evolution/pending.md`.
- AC-005: Product code, Workbench UI, main-agent runtime, Harness templates, and
  ECL rules remain unchanged when the result is no-op.

## Non-Goals

- Product runtime, Workbench UI, Scheduler, Goal Loop, apply/close, remote, PR,
  merge, or Harness evolution behavior changes.
- New Harness rules for individual function names, archive ids, jsonl paths, or
  internal file paths.
- Re-running product suites for a no-op evolution closeout.

## Constraints

- Harness evolution must be completed through proposal/review/validation/result
  evidence and `mark-complete`; do not hand-delete `pending.md`.
- Subagent review is advisory only; the main flow owns closeout and scripts.
- No product authority may be changed by this closeout.

## Risks

- Adding specific rules for this architecture slice could bloat ECL without
  improving future behavior.
- Ignoring pending evolution would leave Harness state dirty and force the next
  agent to handle stale process debt.
