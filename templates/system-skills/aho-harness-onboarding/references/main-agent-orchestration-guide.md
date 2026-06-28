# Main-Agent Orchestration Guide

This Skill helps the main Agent prepare better routing input. It does not run
the AHO multi-agent system.

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

## Delegation Hints

Produce hints in this form:

- read-only analysis: for unclear product, architecture, or source questions;
- sequential implementation: for dependent, high-conflict, or single-threaded
  changes;
- future low-conflict worktree slices: only when accepted tasks have explicit,
  non-overlapping source scopes;
- validation/audit focus: what evidence would prove readiness;
- human gate: which decision must stop for the user.

Do not assign workers directly. Do not create scheduler claims, worktrees, or
IntegrationCheck. The main Agent and AHO runtime decide those later.

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
