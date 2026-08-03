---
name: aho-workflow-authoring
description: Draft or revise a user-reviewable AHO Spec, Plan, Tasks, and embedded Workflow JSON proposal. Use when a real AHO planner child must turn an accepted coding demand into sequential-v1 or ready-set-v1 business nodes; do not use to execute work or authorize gates.
---

# AHO Workflow Authoring

An AHO Workflow is a user-confirmed decomposition of business outcomes. The
planner child authors concrete nodes; AHO validates and compiles them; Workflow
Runtime selects one current legal node and passes its accepted objective to a
scoped coder leaf. Runtime, not the proposal, adds validation, audit, bounded
rework, source safety, and human gates.

The proposal has two audiences. Its Spec, Plan, and Tasks must let a user
understand the outcome and decide whether to proceed. The final `## Workflow`
JSON block is the machine-readable execution appendix for the same plan.

## When To Use

Use this Skill for a code change that needs accepted Spec/Plan/Tasks and either:

- one coherent node or dependent nodes in `sequential-v1`; or
- multiple independently useful, non-overlapping nodes in `ready-set-v1`.

Do not use it for execution, permissions, worktree allocation, apply/merge/close,
arbitrary loops, nested workflows, pipelines, or whole-wave dispatch.

## Authoring Flow

1. State the user-visible outcome and current gap.
2. Write observable acceptance criteria using the exact syntax in
   `references/fixed-plan-format.md`.
3. Design the smallest coherent task decomposition. Do not split by file count.
4. Choose a topology from `references/workflow-patterns.md`.
5. Write concrete node titles and prompts, then map every Task and AC.
6. Classify API, schema, event, config, permission, and module-boundary impact,
   then write explicit structured evidence to `registry-contract.json`.
7. Put the user-readable plan before the Workflow JSON appendix.
8. Validate syntax, references, dependencies, scopes, contract evidence, and coverage before
   returning the complete `plan.md` content as the final assistant response.
   The proposal files remain the Runtime input; the final response is the
   provider-visible representation of that same Plan, not a second proposal.

Read `references/fixed-plan-format.md` for every proposal. Read
`references/workflow-patterns.md` before choosing topology. Read
`references/complete-example.md` for mechanics, but do not copy its domain,
scope, node count, or topology.

## Node Contract

- `id`: stable kebab-case machine identifier, not an execution sequence.
- `title`: a concrete result a user can understand.
- `taskIds`: accepted tasks completed by the node.
- `acIds`: acceptance results the node must help prove.
- `prompt`: the accepted coder-leaf objective, including required behavior,
  constraints, and expected evidence.
- `dependsOn`: real product or technical prerequisites, not preferred ordering.
- `sourceScopes`: the smallest credible maximum write boundary.

Never use generic titles such as `Implement change`, `Update code`, `Handle
logic`, `Add tests`, or `Complete task`. A node prompt must contain the actual
domain objective; do not write `implement the accepted task` as a substitute.

## Runtime-Enforced Rules

- Only `sequential-v1` and `ready-set-v1` are supported.
- Each v1 node references exactly one existing Task and one or more existing ACs.
- Dependencies must reference nodes in the same block and form a DAG.
- Every Task and AC must be covered.
- Ready-set writable nodes must have non-overlapping `sourceScopes`.
- Runtime executes one current concrete gate at a time.
- Coder, validation, audit, and bounded rework are the fixed quality envelope;
  do not author them as separate business nodes.
- Node prompts cannot grant permissions or override source scope, ToolPolicy,
  worktree, apply, merge, close, or other human gates.

## Result

Write `spec.md`, `plan.md`, `tasks.md`, `registry-contract.json`, and optional `notes.md` directly in the
Runtime-provided proposal workspace. After writing a complete proposal, return
the complete contents of `plan.md` as the final assistant response, without a
summary-only wrapper or a patch JSON object. Do not ask Runtime to reconstruct
files from the response. If a blocking unknown prevents a safe plan, leave the
files absent or incomplete and explain the open question instead of returning
a Plan document or inventing repository facts.

## Final Check

Before returning, verify:

- A user can understand the result without reading Workflow JSON.
- Each title names a concrete outcome and each prompt contains real task details.
- No node exists only because a different file is involved.
- Dependencies and ready-set independence are supported by task facts.
- AC, Task, and Workflow syntax exactly matches the fixed format.
- Every identifier resolves and every Task/AC is covered.
- `registry-contract.json` explicitly declares whether a Registry contract is
  required and never relies on Runtime inference from prose or paths.
- No proposal text claims execution authority.
- The final assistant response matches the complete `plan.md` content.
