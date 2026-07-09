# Main-Agent Orchestration Guide

This Skill helps the main Agent prepare better routing input. It does not run
the AHO multi-agent system.

For multi-Agent, TaskQueue, Scheduler, Plan handoff, or WorkflowGraph work,
read `docs/design-docs/harness-workflow-runtime-target.md` and
`docs/references/index.md` before producing routing guidance. The target
architecture is a high-cohesion, low-coupling Harness Workflow Runtime: fixed
role-chain, standalone TaskQueue, standalone Scheduler, and fake
planning-agent/subagent protocols are compatibility or retired paths, not the
goal.

## AHO Execution Drivers

AHO multi-agent work is driven by:

- Role Catalog;
- accepted Spec/Plan/Tasks/Acceptance Criteria;
- TaskGraph and Scheduler readiness;
- ToolPolicyGate and current-gate revalidation;
- validation and audit evidence;
- `confirmationQueue.primary`;
- apply/close and Harness evolution human gates.

Skill output is not one of those authorities.

The Skill may help the main Agent describe a WorkflowPlan or identify a likely
workflow template/mode. It must not enforce permissions, allocate worktrees,
claim worker slots, approve gates, or make Workbench UI state into workflow
truth.

## WorkflowPlan Authoring Guidance

When the main Agent decides planning is needed, it should give Plan Agent a
compact Goal brief, state brief, constraints, and scoped evidence. Plan Agent's
output is a WorkflowPlan proposal, not execution approval.

Use the Open Dynamic Workflows authoring shape as the mental model, but not its
JavaScript carrier:

- design the workflow structure before assigning leaves;
- choose sequential, pipeline, ready-set, or barrier behavior only when the
  task evidence justifies it;
- describe each leaf as `prompt + opts`: the prompt says what the Agent must do
  and what output it must return; opts describe role, scope, worktree/write
  mode, policy profile, and validation/audit needs for Harness;
- keep user confirmation, stale Workbench buttons, Change matching, source
  hashes, reservation ids, worktree ids, apply/merge/close gates, and
  ToolPolicyGate internals out of the business plan body.

The proposal may recommend where the runtime should stop for a human gate. It
must not grant permission, call workflow actions, create Scheduler claims,
pretend a fake subagent exists, update PRs, apply/merge source, close/archive,
or bypass the main Agent review and user confirmation step.

## Plan Handoff Intents

A plan handoff from the Workbench main conversation, or a user phrase such as
"execute this plan" / "执行当前计划", is not an execution approval. The main Agent
must re-read project instructions and current ECL state before deciding whether
to create or continue a Change, ask a question, materialize artifacts, or enter
an existing human gate. A handoff intent is user input for the main Agent and
future Workflow Runtime, not a Workbench-side execution switch and not a
permission grant.

## Delegation Hints

Produce hints in this form:

- read-only analysis: for unclear product, architecture, or source questions;
- default workflow template: for the current coder -> validation -> audit ->
  bounded rework compatibility path, later compiled as
  `default-code-change-workflow`;
- sequential workflow mode: for dependent, high-conflict, or single-threaded
  changes;
- future ready-set / scheduler-wave mode: only when accepted tasks have
  explicit, non-overlapping source scopes and current evidence proves low
  conflict;
- validation/audit focus: what evidence would prove readiness;
- human gate: which decision must stop for the user.

Do not assign workers directly. Do not create scheduler claims, worktrees,
WorkflowRuns, or IntegrationCheck. The main Agent proposes or selects workflow
artifacts; AHO runtime and gates decide execution later.

## Worker Boundary

Worker agents do not load this Skill by default. They receive bounded task
context from AHO. If a worker needs project context, the main Agent should pass
a compact, task-specific excerpt rather than loading the entire onboarding
Skill.

## Useful Output

Good delegation hints are short and operational:

- "Read-only architecture scan first; identity unclear."
- "Sequential path; files overlap in `src/workbench`."
- "Possible later two-worker split: UI copy in `src/web`, server route in
  `src/server`, after plan acceptance."
- "Stop at plan confirmation; no apply/close authority."
