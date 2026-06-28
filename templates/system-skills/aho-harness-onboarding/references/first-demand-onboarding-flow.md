# First-Demand Onboarding Flow

Use this reference when AHO is preparing a project for the first user demand.

## Real AHO Sequence

The first-demand flow is two-layered:

1. Engineering preparation, deterministic:
   - register or resolve the project;
   - create or verify `.agent-harness/project.json`;
   - create the memory root and minimal Workbench/workpad structure;
   - copy the minimal `templates/core-harness` skeleton to the resolved
     memory locations;
   - run intake scan.
2. AI onboarding, proposal-only:
   - read the user demand and bounded project evidence;
   - classify project state;
   - produce `ProjectContextPack`;
   - propose project-specific docs or Harness deltas;
   - return control to normal AHO planning and confirmation.

The Skill belongs only to step 2. It must not replace deterministic
preparation and must not claim write authority.

## First Planning Turn

When loaded as transient first-demand context, keep the output scoped:

- If the project is empty, ask for missing product, stack, and entrypoint
  decisions before proposing project docs.
- If source code exists, read bounded source evidence before proposing docs.
- If a partial Harness exists, identify gaps and stale assumptions.
- If the project is ready, produce a compact context refresh and let ordinary
  planning continue.

## Stop Conditions

Stop and report a blocker when:

- the source path is missing or unreadable;
- AHO resolved memory paths are unavailable;
- existing project docs conflict with deterministic preparation output;
- user intent would require source writes before plan confirmation;
- required evidence would require reading secrets, dependency caches, build
  outputs, `.git`, `node_modules`, or large generated directories.

## Non-Goals

Do not create TaskGraph, SchedulerRun, AgentTask, worker worktree,
IntegrationCheck, apply/close decision, remote/merge/PR action, or Harness
evolution. Those remain AHO runtime and gate responsibilities.
