# Plan: controlled-scheduler-loop-turn-routing

## Approach

Implement the route summary as a small scheduler-runtime owned post-step record builder that reuses the existing Goal Loop posture vocabulary and the existing controlled-step evidence artifact. The Workbench action handler will remain orchestration glue: it refreshes Goal Loop evidence, invokes the existing controlled step, and passes post-step evidence into scheduler-runtime recording.

The route summary will not read current repository state or decide workflow truth. It derives only from the same values already used to record controlled-step evidence: `postStepHandoff`, post-step Goal Loop evaluation/readiness fields, controlled step result summary, and forbidden authority. Goal Loop remains the owner of current-evidence reasoning and posture vocabulary; scheduler-runtime owns persistence/rendering of this SchedulerRun-scoped route summary.

## Steps

1. Add scheduler-runtime route summary types and helper.
2. Move concrete controlled-step result summarization from `src/workbench/actions/handlers/scheduler.ts` into scheduler-runtime ownership.
3. Add optional route summary to `SchedulerControlledStepEvidence`, schema validation, markdown rendering, repository compatibility, and runtime event payload where useful.
4. Wire controlled advance recording so the route summary is created after the existing one concrete gate and post-step evidence refresh.
5. Project the summary through the existing Workbench controlled-step evidence summary and render it read-only in the frontend controlled-step evidence card.
6. Add targeted tests for helper mapping, controlled advance recording, repository/projection, and real App DOM display.
7. Update handoff docs with the minimal active/close delta, complete review coverage, run verification, close the change, handle any pending evolution, and commit without staging unrelated `README.md`.

## Decisions

- The route posture will reuse `SchedulerLoopPostureState` from `src/goal-loop/scheduler-loop-snapshot.ts`.
- `warning` is a route detail, not a posture.
- The route summary is optional to preserve compatibility with existing controlled-step evidence.
- No new route/action/ToolPolicy/confirmation is introduced.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/` owns route summary construction, controlled-step result summarization, schema, persistence, and markdown rendering.
- New / moved responsibilities: move controlled-step concrete result summarization out of `src/workbench/actions/handlers/scheduler.ts`; add post-step route summary construction to scheduler-runtime.
- Facade touch points: Workbench scheduler handler delegates to scheduler-runtime helpers; Workbench projection and frontend display read-only summaries.
- Forbidden write-back locations: no new main logic in `src/workbench/chat.ts`, server route files, frontend shell components, manager facades, or Workbench projection aggregators beyond thin DTO/display mapping.
- Compatibility surface: existing controlled Scheduler action ids, payload ids, ToolPolicy auditing, stale revalidation, `SchedulerControlledStepEvidence` readers, and Workbench card behavior remain compatible.
- Boundary tests: helper unit tests, controlled advance handler test, repository/projection test, and App DOM no-button check.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Goal Loop controlled-loop posture vocabulary, scheduler-runtime controlled-step evidence, controlled advance stale revalidation, Workbench read-model projection, existing frontend evidence card.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed; the change adds a compact route summary inside an existing artifact because the same route facts currently remain split across post-step evidence, handoff, and result summary fields.
- Domain-specific logic location: scheduler-runtime post-step route/result summarization.
- Shared cross-cutting logic location: Goal Loop posture vocabulary remains in `src/goal-loop/scheduler-loop-snapshot.ts`; action target validation and ToolPolicy remain in existing workflow action/Workbench action owners.
- Local framework / state machine / projection / validation / gate avoided: no new loop state machine, gate system, ToolPolicy path, projection system, or artifact family.
- Future-cost reduction for similar features: later controlled-loop tick/reconcile work can consume one typed route summary instead of duplicating ad hoc reads from Workbench handler outputs and controlled-step handoff fields.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Initial subagent plan review rejected a local `warning` posture and a scheduler-runtime-owned loop state classifier. The plan now reuses Goal Loop posture vocabulary and treats warnings as details.
