# Implement

## Inputs

- Approved plan/tasks and current Change evidence.
- Latest Registry preflight and applicable contract.
- Relevant L2/L3 knowledge, project rules, and existing implementation patterns.

## Agent Judgment

Follow current project patterns and accepted scope. New implementation discoveries may change the
plan or contract, but they do not silently expand scope or rewrite stable shared knowledge.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime supplies the accepted Change, graph, AgentTask, assigned worktree, scope, and current
  preflight evidence.
- Runtime owns preflight reruns, deterministic validation execution, and Change task-state updates.
- Internal Workers do not invoke Change, Registry, worktree, Apply, Close, or Integration lifecycle
  commands.

## Actions

1. Verify the Runtime-supplied Change, graph, task, worktree, and scope identities before editing.
2. Read complete relevant implementations, modify only the assigned checkout and scope, and
   preserve unrelated changes.
3. Return discoveries that would alter scope or contract to Runtime instead of publishing or
   transitioning shared evidence directly.
4. Return the exact diff, results, deviations, risks, and suggested validation evidence to Runtime.

## Outputs

- Scoped changes in the assigned worktree and a bounded Worker result.
- Proposed path/contract updates and implementation evidence for Runtime publication.

## Exit

All accepted implementation tasks are complete or explicitly deferred, with no unauthorized scope
expansion and no unresolved contract conflict.

## Stop And Escalate

Stop for stale baseline that invalidates the plan, unexpected permission/data/API impact, unrelated
user-change collision, or a required project gate that cannot be run safely.

## Rules

Apply HR-01, HR-02, HR-03, HR-04, and HR-11 plus `references/rules/by-stage/implement.md`.
