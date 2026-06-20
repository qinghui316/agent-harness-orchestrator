# Plan: controlled-scheduler-next-candidate-prompt-evidence

## Approach

Reuse the existing Workbench read-model candidate instead of creating a new Goal Loop or scheduler mechanism.

1. Extend `VisibleGoalLoopMainAgentContextSection` with optional compact controlled Scheduler next-candidate evidence.
2. In `buildVisibleGoalLoopMainAgentContextSection`, read the candidate from `getWorkbenchWorkpadProjection(...)` only after the existing packet parity guard passes.
3. Extend `MainAgentContextResult` to carry that compact evidence for chat and orchestrator contexts.
4. Extend `goal-loop-prompt-evidence.ts` with a prompt-stack label and prepared evidence field.
5. Add targeted tests for ready candidate, needs-review candidate, packet mismatch suppression, and compact prepared evidence.

## Owner Modules

- Workbench chat context adapter owns conversion from visible Workpad read model into main-Agent context.
- Goal Loop prompt evidence adapter owns labels and compact prepared evidence.
- Goal Loop core remains unchanged and does not import Workbench DTOs.

## Core Mechanism Reuse

- Reuses `WorkbenchControlledSchedulerNextCandidate`.
- Reuses `getWorkbenchWorkpadProjection(...)` and the existing packet parity guard.
- Reuses existing prompt prepared-evidence plumbing and label pattern.
- Avoids a feature-local state machine, action payload, validation gate, or new projection system.

## Validation

- Targeted: `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts`
- Product checks: `npm run typecheck`, `npm run lint`, `npm run build`
- Harness checks: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, `harness-evolve check`

## Reference Evidence

- Loop Engineering supports compact evidence-driven continuation context, not unattended execution.
- Open Design supports artifact-first readable prompt/UI evidence, not raw hidden state.
- Open Dynamic Workflows and Symphony support bounded orchestration evidence and reconciliation, not copying their runtime authority into AHO.
