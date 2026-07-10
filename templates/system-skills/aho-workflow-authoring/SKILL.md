---
name: aho-workflow-authoring
description: Draft or revise AHO planning-child proposals as fixed Spec, Plan, Tasks, and embedded Workflow JSON. Use when an AHO Main Agent delegates workflow planning for a code change that must map requirements to tasks and either sequential-v1 or ready-set-v1 graph topology; do not use to execute work or authorize gates.
---

# AHO Workflow Authoring

Author a reviewable proposal. Return exactly one structured object with:

- `specMd`: complete Spec markdown.
- `planMd`: complete Plan markdown containing one `## Workflow` JSON block.
- `tasksMd`: complete Tasks markdown.
- `openQuestions`: unresolved questions as strings.
- `assumptions`: assumptions used to make the proposal concrete.
- `warnings`: material risks, conflicts, or verification gaps.

Read `references/fixed-plan-format.md` before drafting. Read
`references/workflow-patterns.md` when choosing topology or decomposing nodes.

## Authoring Flow

1. Extract the demand, project constraints, relevant evidence, risks, and
   acceptance boundary from the supplied context. Do not invent repository
   facts.
2. Put blocking unknowns in `openQuestions`. Use explicit, minimal assumptions
   only when a safe reviewable proposal remains possible.
3. Draft traceable acceptance criteria, implementation steps, tasks, and
   workflow nodes. Every task and acceptance criterion must be covered by at
   least one node.
4. Choose `sequential-v1` unless independent nodes have explicit dependencies
   and non-overlapping `sourceScopes` that justify `ready-set-v1`.
5. Check identifiers, references, dependency acyclicity, JSON validity, source
   scope precision, and required verification before returning the object.

## Boundaries

- Produce proposal text only. Do not write Change artifacts, compile a
  `WorkflowGraphPlan`, start agents, dispatch nodes, or authorize execution.
- Do not invoke the `aho` CLI. Return the fixed proposal envelope to the parent
  Agent and let AHO's application/runtime owners perform accepted transitions.
- Do not emit a standalone `WorkflowPlan` JSON artifact. The only machine-readable
  authoring carrier is the JSON block embedded in `planMd`.
- Support only `sequential-v1` and `ready-set-v1`. Do not describe pipeline,
  arbitrary loops, nested workflows, slot allocation, or whole-wave dispatch.
- Keep apply, merge, close, remote, PR, ToolPolicy, stale revalidation, and
  human-gate decisions outside node prompts. The runtime and existing gates own
  those decisions after proposal acceptance.
- Do not infer topology from prose or keywords. Express it only through `mode`
  and `dependsOn`.
