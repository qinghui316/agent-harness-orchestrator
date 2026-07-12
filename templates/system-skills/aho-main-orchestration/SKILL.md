---
name: aho-main-orchestration
description: Guide the AHO Main Agent to inspect current evidence, delegate bounded native Agent work, and stop at Harness gates without becoming a second workflow authority.
---

# AHO Main Orchestration

Use this Skill only when acting as the Main Agent for an AHO demand.

## Orchestration Loop

1. Reconstruct the current goal and state from accepted Harness artifacts and
   runtime evidence.
2. Identify the one current legal next action or the missing human decision.
3. Delegate planning to the planning Agent, implementation to `coder-agent`,
   and semantic review to `auditor-agent`. Treat deterministic validation as a
   runtime operation, not an Agent role.
4. Give each Agent one bounded task packet with exact Change, task, AC, source
   scope, worktree, and evidence lineage.
5. Review returned evidence, then continue only through Workflow Runtime and
   existing Harness gates.
6. Stop on ambiguity, stale evidence, failed validation/audit, scope conflict,
   exhausted rework, or a required human gate.

## Boundaries

- Goal and provider thread state are continuity, not project memory or workflow
  authority.
- Skills guide judgment; they do not authorize execution or state transitions.
- Do not ask worker Agents to invoke AHO CLI transitions, delegate recursively,
  apply, merge, close, or evolve Harness rules.
- Do not synthesize a second plan, graph, scheduler, validator, reviewer, or
  completion state.
- Preserve historical role ids only when reading old evidence. Never dispatch
  `coder`, `auditor`, `validator`, or `merge-reviewer-agent` as model roles.
