# Plan: main-agent-workflowgraph-policy-v2-replay-failure-boundary

## Approach

Keep the existing replay consumption chain and tighten the policy/read-model boundary around it. Rename active-queue advice to observation-only language, harden replay derivation failures into bounded gaps, add parity and non-execution tests, then sync current roadmap docs.

## Steps

1. Update `decision-policy.ts` so active queue guidance becomes `observe-active-queue-loop` and remains payload-free.
2. Harden replay read helpers so file-system/history/policy derivation failures become evidence health gaps rather than thrown production failures.
3. Keep observation evidence write failure fail-closed in `recordMainAgentWorkflowGraphObservationAndReplay(...)`, but wrap the replay summary derivation with a degraded summary fallback.
4. Extend tests for non-executing output, created/unbound WorkflowRun, unsafe gaps, replay failure fallback, and observation/replay parity.
5. Update `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/STATUS.md` to move replay consumption to completed and make Policy V2 the current next slice.

## Decisions

- Replay consumption is already implemented; this change must not rebuild it.
- Do not extract a shared classifier yet. Keep observation evidence classification and replay read-model classification separate, with representative parity tests.
- Use a degraded replay summary only for replay/history/policy derivation failures. Do not hide canonical observation write failures.

## Minimality Gate Plan

- Can this be a no-op: no; current policy kind can be mistaken as an execution signal and replay derivation can still block existing production paths.
- Reuse: reuse `decision-policy.ts`, `workflowgraph-replay.ts`, and `recordMainAgentWorkflowGraphObservationAndReplay(...)`.
- Shared root fix: harden the shared replay helper rather than adding guards to each planning caller.
- Avoided: no new UI, persistence table, scheduler policy, action bridge, or shared classifier framework.
- Smallest coherent change: rename one policy kind, add replay degradation, tests, and handoff doc sync.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration`.
- New / moved responsibilities: none; existing replay/policy responsibilities are tightened.
- Facade touch points: `src/main-agent-orchestration/index.ts` remains compatible except for the internal policy kind rename.
- Forbidden write-back locations: Workbench UI, confirmation queue, scheduler runtime, action handlers, apply/close, automation allowlist.
- Compatibility surface: no user-visible behavior changes and no action behavior changes.
- Boundary tests: module-boundary tests must confirm forbidden imports and old production seams stay absent.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: WorkflowGraph observation evidence, replay summary, decision policy, module-boundary tests, current STATUS/roadmap handoff.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: WorkflowGraph replay/policy remains under `main-agent-orchestration`.
- Shared cross-cutting logic location: replay health/gap handling stays inside the replay read-model owner.
- Local framework / state machine / projection / validation / gate avoided: avoided another policy or queue runner.
- Future-cost reduction for similar features: future bridge/recovery/scheduler work reads one hardened policy output instead of scattered handler checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent review found replay/policy already consumes summary core; this plan therefore targets semantic tightening and failure boundary hardening rather than duplicate consumption work.
- Subagent review found docs drift in `CURRENT-DEVELOPMENT-PLAN.md` and `STATUS.md`; this change includes current-doc sync.
