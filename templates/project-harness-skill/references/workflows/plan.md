# Plan

## Inputs

- Change spec, locate evidence, current Registry contracts, and canonical baseline.
- Project command and verification catalogs.
- Applicable L2/L3 knowledge and current stage rules.

## Agent Judgment

Choose the smallest coherent implementation that meets acceptance. Describe task dependencies and
which tasks may run in parallel, without assigning Workers or worktrees. Distinguish compatibility
facts from preferences, and configured commands from adapter-derived candidates.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime publishes initial scope, runs preflight, publishes high-impact contracts, and runs the
  structural gate before exposing the plan for approval.
- Planning reads those results and returns task dependency, owner, path, and validation proposals.
- Planning does not create a child Change, Lane, AgentTask, or worktree.

## Actions

1. Map each acceptance criterion to an owner, task, and validation command.
2. Propose affected paths, task dependencies, and safe parallelism for Runtime publication.
3. Propose API/schema/event/config/permission/module contracts when required.
4. Define compatibility, migration, rollback-at-code-level, risk, and test strategy.
5. Resolve semantic questions surfaced by Registry conflicts; Runtime owns conflict checks and the
   project-native plan transition.

## Outputs

- Approved `plan.md`, executable `tasks.md`, path claims, optional contract, and validation plan.

## Exit

Every task traces to acceptance; owner, compatibility, dependencies, and verification are explicit;
no unresolved Registry conflict or high-impact ambiguity remains.

## Stop And Escalate

Stop when another Lane owns an incompatible path/contract, a required command is only speculative,
or approval has not been obtained.

## Rules

Apply HR-01, HR-02, HR-03, HR-17, and HR-18 plus `references/rules/by-stage/plan.md`.
