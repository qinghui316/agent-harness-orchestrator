# Phase 8S-8W Runtime Continuity Evidence Review

## Recommendation

Status: `noop`
Eval mode: `subagent_review`

No new Harness rule, template field, lint check, or product-code change is recommended for the Phase 8S-8W archive window.

## Reviewed Window

- Phase 8S: non-executing `SchedulerContract` for parallel TaskGraph readiness.
- Phase 8T: AgentScope 2.0 and AgentScope Java Harness reference alignment.
- Phase 8U: Runtime Continuity sidecars for code runs.
- Phase 8V: Runtime Continuity sidecars for validation and audit role workers.
- Phase 8W: permission profile, mirrored ToolPolicy decision, and external-execution lifecycle evidence in `agent-events.jsonl`.

## Evidence

Current Harness coverage already addresses the patterns observed in this window:

- `docs/ECL.md` includes proposal/runtime boundary coverage and the Future Feature Module Boundary Rule.
- `docs/BOUNDARIES.md` states that `SchedulerContract` is non-executing evidence and cannot create WorkflowRun, TaskQueueRun, TaskRun, WorkerLease, AgentTask, worktree, run, child Change, source mutations, or cache/replay records.
- `docs/BOUNDARIES.md` states that `WorkerSession`, `RuntimeWorkspace`, `EventSource`, and `AgentEventEnvelope` are Runtime Continuity auxiliary evidence, not workflow truth.
- `docs/BOUNDARIES.md` states that permission and external-execution events must not create a new permission authority, bypass ToolPolicyGate, prompt for HITL permission, alter Codex approval mode, change public artifacts, or create scheduler/runtime objects.
- `docs/references/index.md`, `docs/design-docs/ref-agentscope.md`, `docs/design-docs/ref-agentscope-java.md`, and `docs/design-docs/ref-open-dynamic-workflows.md` distinguish reference lessons from AHO product authority.
- `scripts/lint-ecl.ps1` already checks for Future Feature Module Boundary Rule keywords.

## Decision

Do not add a new rule from this window. The archive evidence repeats existing rule families:

- owner module before feature implementation;
- proposal/runtime authority classification;
- workflow truth remains Change/ECL, accepted artifacts, Run/Validation/Audit, apply/close/human gates;
- Runtime Continuity records are auxiliary replay/evidence records;
- ToolPolicyGate remains the policy authority;
- reference projects are evidence, not implementation instructions.

## Follow-Up Product Direction

After this noop evolution, the next product-code candidate should not be a direct parallel executor. A safer next step is a scheduler dispatch/reconcile dry-run contract or worker-session projection/recovery surface that consumes `SchedulerContract` and Runtime Continuity evidence without starting parallel workers.

## Limitations

This review does not re-run product tests and does not inspect every source branch from Phase 8S-8W. It relies on archived verification evidence plus targeted current documentation/code inspection. If a future scheduler implementation changes execution behavior, it must open a product-code phase with explicit runtime, permission, recovery, and human-gate acceptance criteria.
