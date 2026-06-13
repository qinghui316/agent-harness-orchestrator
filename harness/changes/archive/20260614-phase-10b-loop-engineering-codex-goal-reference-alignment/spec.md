# Spec: Phase 10B Loop Engineering Codex Goal Reference Alignment

## Goal

Make AHO's next architecture direction explicit: a main Agent may maintain a persistent long-running Goal/Change and run an adaptive evidence loop, but it must decide parallelism by conflict risk. Low-conflict independent work can be split into parallel worker/worktree slices; high-conflict or dependent work must wait for predecessor evidence or enter a rework / IntegrationFix loop.

The docs must ground this direction in Addy Osmani's Loop Engineering article and local OpenAI Codex `goal` source, while preserving AHO's Harness-first workflow truth.

## Users

- Developers and future agents working on AHO scheduler / main-agent orchestration.
- The project owner, who needs a clear explanation of how Goal-style loops combine with AHO's Change/ECL and Harness gates.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 10B active and no stale Phase 10A active claim.
- AC-002: `docs/references/index.md` includes Loop Engineering and expands OpenAI Codex to goal continuation / completion audit / long-running objective mapping.
- AC-003: `docs/design-docs/ref-loop-engineering.md` explains Loop Engineering in AHO terms and records do-not-copy boundaries.
- AC-004: `docs/design-docs/ref-openai-codex.md` maps Codex `goal` source behavior to AHO long-running Goal/Change loops.
- AC-005: Core docs describe a Goal-driven Adaptive Loop and conflict-aware parallel/sequential decision policy.
- AC-006: Docs state that multi-worktree parallelism does not guarantee final merge safety.
- AC-007: Docs state final source mutation still requires SchedulerIntegrationCandidate, existing IntegrationCheck, aggregate validation/audit, and human apply gate.
- AC-008: No product code, runtime behavior, action surface, route, CLI, UI, scheduler execution, child Change, or artifact shape changes.
- AC-009: Harness and product verification pass, or any pre-existing failure is explicitly recorded.
- AC-010: `README.md` remains unrelated and untracked.

## Non-Goals

- Implementing a Goal Loop Controller.
- Starting a scheduler loop or parallel executor.
- Adding Workbench actions, routes, CLI commands, UI, lazy projections, or new public artifact shapes.
- Replacing Change/ECL, Validation, Audit, IntegrationCheck, Apply/Close human gates, or ToolPolicyGate with model confidence.

## Constraints

- Treat the Addy article and Codex source as references, not product authority.
- Do not vendor-copy reference source.
- Keep this phase documentation-only.
- Continue excluding unrelated untracked `README.md`.

## Risks

- Overstating parallelism could make future agents bypass conflict checks or merge gates.
- Treating Codex `goal` as workflow truth would conflict with AHO's Change/ECL artifact model.
- Adding too much user-facing terminology could make Workbench confusing; docs must keep the UI model simple.
