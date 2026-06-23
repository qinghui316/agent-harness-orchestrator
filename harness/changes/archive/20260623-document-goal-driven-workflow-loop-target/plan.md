# Plan: document-goal-driven-workflow-loop-target

## Approach

Use a docs-only structured change. Add one positive target model in the current
roadmap, then make the surrounding product, Workbench, Agent Development OS,
and scheduler-boundary documents point at that model. Keep the text concise and
avoid adding another phase ledger.

## Steps

1. Record this docs-only change in active ECL files.
2. Add `Goal-Driven Workflow Loop Target` to
   `docs/CURRENT-DEVELOPMENT-PLAN.md`, including the mermaid diagram and
   explicit boundaries between user, main Agent, workflow, Scheduler, and
   worktree responsibilities.
3. Add a final-experience paragraph to `docs/PRODUCT.md` after `Final Product
   Shape`.
4. Add a reference-combination section to `docs/AGENT-DEVELOPMENT-OS.md`.
5. Adjust Workbench future-loop wording in `docs/WORKBENCH.md`.
6. Add a positioning note at the top of
   `docs/design-docs/controlled-scheduler-loop.md`.
7. Update minimal handoff pointers in `AGENTS.md` and `docs/STATUS.md` during
   active/closeout so ECL lint sees consistent state.
8. Run docs/Harness verification and drift greps.

## Decisions

- Keep the current product baseline as manual-gated real local loop acceptance.
- Treat Goal-driven Workflow Loop as the target architecture, not current
  implemented runtime behavior.
- Use Scheduler/worktree language only as an execution strategy for low-conflict
  write-capable slices.
- Retain full-auto as a later scoped authorization direction, not a present
  capability.

## Module Boundary Plan

- Owner module: not applicable; documentation-only change.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: product code, runtime services, scheduler
  facades, Workbench UI components, and reference submodules.
- Compatibility surface: current docs and ECL lifecycle only.
- Boundary tests: docs/Harness lint and drift greps.
- Follow-up split candidates: none.
- If not applicable, reason: no product modules are added or changed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: current documentation hierarchy,
  ECL change lifecycle, current handoff docs, and existing reference maps.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: not applicable.
- Local framework / state machine / projection / validation / gate avoided:
  avoids adding runtime or evidence layers for a documentation clarification.
- Future-cost reduction for similar features: later agents can see one target
  model before proposing Scheduler/full-auto/parallel changes.
- If not applicable, reason: no product feature path is implemented.

## Planning-Discovered Gaps

Current docs already contain many boundary rules but lack a concise positive
target model that says the main Agent chooses between sequential, parallel,
fix-loop, planning, waiting, or human-gated transitions. This change fills that
documentation gap only.
