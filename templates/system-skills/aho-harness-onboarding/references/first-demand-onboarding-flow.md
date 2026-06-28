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

## Failure Handling

| Trigger | First response | If still blocked |
| --- | --- | --- |
| Source path is missing or unreadable | Report the path problem and ask the user to re-add or repair the project | Do not create onboarding output; return `Onboarding Decision Summary` with blocker |
| AHO memory paths are unavailable | Ask AHO/project settings to repair or rerun deterministic preparation | Do not infer docs, active changes, or history from `cwd` |
| Existing docs conflict with deterministic prep | Produce a merge proposal that names both sources | Stop before any overwrite; require normal Change and user confirmation |
| User asks for writes before plan confirmation | Convert the request into a Harness Onboarding Proposal | Stop at the planning confirmation gate |
| Required evidence is excluded or unsafe | List skipped evidence and reason | Keep unknowns explicit; do not weaken evidence boundaries |

## Non-Goals

Do not create TaskGraph, SchedulerRun, AgentTask, worker worktree,
IntegrationCheck, apply/close decision, remote/merge/PR action, or Harness
evolution. Those remain AHO runtime and gate responsibilities.
