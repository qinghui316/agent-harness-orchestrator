# Plan: main-agent-workflowgraph-recovery-evidence-summary-v1

## Approach

Add a narrow read-only composition owner under `src/main-agent-orchestration`.
It should consume the existing replay summary and canonical manager state, then
report evidence completeness for recovery planning. It must not own recovery
execution or duplicate replay/policy state.

## Steps

1. Repair `docs/CURRENT-DEVELOPMENT-PLAN.md` drift for latest implementation
   and pending-evolution state.
2. Add `workflowgraph-recovery.ts` with summary types and builder.
3. Integrate the builder into
   `recordMainAgentWorkflowGraphObservationAndReplay(...)`.
4. Export the new owner from `src/main-agent-orchestration/index.ts`.
5. Add targeted recovery, observation/replay, and module-boundary tests.
6. Run verification and close the structured change.

## Decisions

- The new `kind` is an evidence-completeness label only, not a policy decision
  or action recommendation.
- Existing replay/policy continues to own current-state and next-observation
  wording.
- Recovery-key freshness is read-only and fail-soft into gaps.
- Stage verdicts are derived only for TaskRuns bound to the current
  WorkflowRun/TaskQueue items.

## Minimality Gate Plan

- Can this be a no-op: no; replay currently counts TaskRun/AgentTask state but
  does not expose per-current-TaskRun stage verdict or validation/audit refs.
- Reuse: `recomputeWorkflowRecoveryKey`, `sameJson`,
  `deriveStageResumeVerdict`, TaskQueue/TaskRun/WorkflowRun managers, Run,
  Validation, and Audit read paths.
- Shared root fix: add one composition owner rather than feature-local reads in
  future scheduler/recovery code.
- Avoided: no second replay policy, no action bridge, no UI, no lifecycle
  execution, no new persistent artifact.
- Smallest coherent change: in-memory summary plus tests and doc drift fix.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/workflowgraph-recovery.ts`.
- New / moved responsibilities: read-only composition of recovery evidence
  completeness.
- Facade touch points: `src/main-agent-orchestration/index.ts` export only.
- Forbidden write-back locations: Workbench UI/server/action handlers,
  scheduler runtime, terminal, apply/close, WorkflowRun/TaskQueue/TaskRun
  lifecycle writers.
- Compatibility surface: existing observation/replay helper still returns
  existing fields; it adds `recoverySummary`.
- Boundary tests: module-boundary test must prevent forbidden imports/calls and
  old runner names.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: canonical manager reads,
  recovery-key hashing, stage-resume verdict derivation, replay summary refs,
  and ECL proposal/runtime boundaries.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing mechanisms are sufficient for source facts but lack one reusable
  main-agent-facing composition surface.
- Domain-specific logic location: recovery evidence completeness belongs in
  `main-agent-orchestration`.
- Shared cross-cutting logic location: existing managers keep ownership of
  their evidence and state.
- Local framework / state machine / projection / validation / gate avoided:
  no new policy, no persistent ledger, no action validation path.
- Future-cost reduction for similar features: scheduler candidate policy can
  consume one summary rather than rediscovering scattered evidence.

## Planning-Discovered Gaps

The initial plan was too broad and risked duplicating replay/policy. Subagent
review narrowed this change to evidence completeness only.
