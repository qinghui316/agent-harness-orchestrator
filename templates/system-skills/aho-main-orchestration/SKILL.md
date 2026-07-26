---
name: aho-main-orchestration
description: Guide the AHO Main Agent to inspect current evidence, delegate bounded native Agent work, and stop at Harness gates without becoming a second workflow authority.
---

# AHO Main Orchestration

Use this Skill only when acting as the Main Agent for an AHO demand.

## Orchestration Loop

1. Read the user request, current Goal handoff, and the project facts supplied
   through the native provider context.
2. If the supplied Harness state is missing or incomplete, use the native
   `$aho-harness-engineering` Skill in `onboard` mode before planning or source
   execution. Let that Skill complete the AHO core readiness contract first,
   then derive project-specific documents from the actual project; do not
   assume a generic project-document template.
3. Identify the one current legal next action or the missing human decision.
   Once Harness readiness is complete, judge the requested work yourself:
   complete a simple request directly when its scope and evidence are clear;
   use a real Planning child for complex work that needs a confirmed
   proposal, Change, or Workflow execution.
4. Before starting work that needs a Planning child, Change, Workflow, or a
   later human gate, ensure this provider thread has a native Goal. Create one
   when the supplied Goal handoff says none exists; continue the existing Goal
   when one is supplied. Never update, yield, or complete a Goal that has not
   first been created on this thread.
5. When planning is needed, spawn one real Planning child yourself with the
   exact native task name `planning_agent`. Send it the concrete user goal,
   relevant evidence, and the proposal workspace supplied by Runtime. The child
   loads `$aho-workflow-authoring` natively and writes the proposal files there.
   Do not ask AHO to compose a child prompt or turn a child response into a
   replacement plan.
6. Delegate implementation to the accepted Workflow node and semantic review
   to the existing Auditor Agent. Treat deterministic validation as a Runtime
   operation, not an Agent role.
7. Review returned evidence, then continue only through Workflow Runtime and
   existing Harness gates.
8. When the user explicitly asks to close a currently registered Agent, use
   `aho_close_agent` with the exact Agent Surface id supplied in
   `aho.agent-control`. Never substitute `interrupt_agent`: interruption does
   not permanently close an Agent. Do not close an Agent without an explicit
   user request.
9. Stop on ambiguity, stale evidence, failed validation/audit, scope conflict,
   exhausted rework, or a required human gate.

## Boundaries

- Goal and provider thread state are continuity, not project memory or workflow
  authority.
- Skills guide judgment; they do not authorize execution or state transitions.
- Native provider context supplies workspace paths and task facts; do not
  reproduce Skill bodies, paths, or Runtime internals in child messages.
- Do not ask worker Agents to invoke AHO CLI transitions, delegate recursively,
  apply, merge, close, or evolve Harness rules.
- Do not synthesize a second plan, graph, scheduler, validator, reviewer, or
  completion state.
- Preserve historical role ids only when reading old evidence. Never dispatch
  `coder`, `auditor`, `validator`, or `merge-reviewer-agent` as model roles.
