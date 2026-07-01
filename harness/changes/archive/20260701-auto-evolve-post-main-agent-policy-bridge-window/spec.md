# Spec: auto-evolve-post-main-agent-policy-bridge-window

## Goal

Resolve the current `harness/evolution/pending.md` window created after the
latest main-agent replay / policy / bridge closeouts.

The expected outcome is a no-op closeout unless the candidate archives reveal a
durable Harness rule, template, or runtime gap not already covered by current
ECL and boundary docs.

## Candidate Archives

- `harness/changes/archive/20260701-auto-evolve-post-main-agent-workflowgraph-replay-window/summary.md`
- `harness/changes/archive/20260701-main-agent-workflowgraph-decision-policy-v1/summary.md`
- `harness/changes/archive/20260701-main-agent-workflowgraph-replay-consumption-roadmap-sync-v1/summary.md`
- `harness/changes/archive/20260701-main-agent-workflowgraph-policy-v2-replay-failure-boundary/summary.md`
- `harness/changes/archive/20260701-main-agent-bridge-integration-acceptance-closeout-v1/summary.md`

## Acceptance Criteria

- AC-001: The pending evolution window is reviewed against current ECL,
  BOUNDARIES, AGENTS, STATUS, and the candidate archive summaries.
- AC-002: The selected result is recorded as either no-op or the smallest
  explicit Harness rule/template/runtime proposal.
- AC-003: Independent subagent review records recommendation, score, coverage,
  and limitations.
- AC-004: `scripts/harness-evolve.ps1 mark-complete` records the result and
  clears `harness/evolution/pending.md`.
- AC-005: When the selected result is no-op, product code, Workbench UI,
  Harness templates, and ECL rules remain unchanged.

## Non-Goals

- Product runtime, Workbench UI, Scheduler, Goal Loop, apply/close, remote, PR,
  merge, normal Agent mode, or Harness evolution behavior changes.
- New long-term rules for concrete helper names, archive ids, jsonl paths,
  evidence ids, current function names, or local implementation paths.
- Re-running product suites for a no-op evolution closeout.

## Constraints

- Harness evolution must be completed through proposal, independent review,
  validation, `results.tsv`, and `mark-complete`; do not hand-delete
  `pending.md`.
- Subagent review is advisory only; the main flow owns scripts and closeout.
- No product authority, workflow truth, or human-gate semantics may change.

## Risks

- Adding implementation-specific rules would bloat ECL and mislead future
  agents into treating temporary helper names as durable architecture language.
- Ignoring pending evolution would leave stale process debt for the next agent.
