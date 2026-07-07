# Reference: Loop Engineering

## Source

- Source: `https://addyosmani.com/blog/loop-engineering/`
- Local path: web article only.
- Inspected date: 2026-06-13.
- Reference status: external architecture reference. Do not vendor-copy product authority or runtime behavior into AHO.

## What Was Inspected

The Loop Engineering article describes a pattern where a model keeps iterating toward a larger objective by using a harness that can automate checks, isolate work, apply skills, call connectors/plugins, delegate to subagents, and preserve state across loop turns. It frames the loop as a layer above single-prompt agent execution.

## Six Useful Constructs

| Construct | AHO Mapping |
| --- | --- |
| Automation | Harness scripts, validation, audit, IntegrationCheck, ECL lint, and future loop controller checks. |
| Worktree | AHO-owned isolated worktrees for worker slices; useful for low-conflict parallel development, not proof that final merge is safe. |
| Skill | AHO role prompts, future owned skills, and repository-specific guidance that narrows worker behavior. |
| Connector / plugin | External tools and providers behind ToolPolicyGate, scoped payloads, and evidence records. |
| Subagent | Bounded worker roles or future subagents with explicit session/workspace/event evidence, not free agent spawning. |
| External state / memory | Change/ECL, artifacts, runtime sidecars, maintenance memory, and durable project state that survive one model turn. |

## AHO Interpretation

Loop Engineering fits AHO as a main-Agent control pattern:

```text
act -> observe evidence -> reason about conflict and next step -> repeat
```

The loop is useful because complex tasks should not be flattened into one giant parallel launch. The main Agent keeps a visible Goal brief plus selected Change scope, reads the current repo and Harness evidence, and decides which slices are safe to run now.

Low-conflict independent slices may enter parallel worker/worktree execution. High-conflict or dependent slices must wait for predecessor evidence, run sequentially, or enter a rework / IntegrationFix loop after validation, audit, or IntegrationCheck evidence proves the issue.

## Do Not Copy

- Do not copy a fully unattended loop that merges or applies code without AHO gates.
- Do not let loop state replace Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close records, or Harness evolution.
- Do not treat worktree parallelism as merge safety.
- Do not let subagents create arbitrary child Changes, tools, workers, or source mutations without scoped owner modules and ToolPolicyGate.
- Do not use loop confidence as completion proof. Completion requires evidence.

## Product Implications

Future AHO autonomous work should be Goal-driven and conflict-aware:

- The main Agent is the loop decision maker, not an unconstrained executor.
- Scheduler evidence helps the main Agent decide candidate work; it is not a default full parallel executor.
- Users confirm Harness stage gates in the main conversation / right confirmation queue.
- Final source mutation still routes through scheduler integration candidate evidence, existing IntegrationCheck, aggregate validation/audit, and human apply gate.

## Open Questions

- Whether a future Goal Loop Controller should be a Workbench runtime module, a scheduler policy module, or a separate main-agent policy module.
- How much of loop budget/pause/resume should be user-visible versus ECL/Harness internal state.
- Which conflict-scoring signals should be machine-checked before allowing parallel worker slices.
