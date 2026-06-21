# Plan: controlled-scheduler-post-step-routing-preflight-handoff

## Approach

Extend the existing Goal Loop gate-readiness preflight mechanism instead of
creating a new controlled Scheduler continuation mechanism.

`compileGoalLoopGateReadinessPreflight()` will accept an optional Goal Loop
owned support DTO derived from scheduler-runtime controlled-step evidence. The
compiler will validate the DTO against the current packet/controller/current
gate chain and persist a compact support summary on the preflight when it is
fresh and aligned. If support is absent, the current legacy preflight path stays
unchanged.

## Steps

1. Add typed optional `ControlledSchedulerPostStepRoutingPreflightSupport`
   / persisted summary fields under `src/goal-loop/types.ts`.
2. Extend `src/goal-loop/gate-readiness.ts` compile options with optional
   support input and implement deterministic fail-closed validation.
3. Update Goal Loop schema, rendering, and repository-compatible read/write
   behavior so supported and legacy preflights both parse.
4. Add unit coverage in `tests/unit/goal-loop-decision.test.ts` for ready
   inclusion, legacy compatibility, stale/cross-change/mismatch rejection, and
   no-authority flags. Add adjacent controlled Scheduler projection coverage
   only if the implementation touches that boundary.
5. Update handoff docs at close so `docs/STATUS.md` and
   `docs/CURRENT-DEVELOPMENT-PLAN.md` point to the next real stage rather than
   the completed prompt-context consumption stage.

## Decisions

- Do not use `ControlledSchedulerPostStepRoutingPromptEvidence` as compiler
  input; it is prompt-level compression and lacks enough source-step proof.
- Do not add a workflow action scope key or Workbench request carrier in this
  slice. Direct compiler/runtime use is enough for the preflight support
  contract.
- Keep all routing support policy in `src/goal-loop/gate-readiness.ts`; the
  scheduler-runtime owner continues producing routing evidence, and Workbench
  remains a projection/action bridge.

## Module Boundary Plan

- Owner module: `src/goal-loop/` owns the optional support DTO, preflight
  validation, schema, rendering, and persisted preflight shape.
- New / moved responsibilities: no moved responsibility; preflight gains compact
  support lineage validation for controlled Scheduler routing evidence.
- Facade touch points: `src/goal-loop/manager.ts` remains a re-export facade
  only.
- Forbidden write-back locations: no main logic in Workbench handlers, bridge,
  frontend, server routes, workflow-action registry, scheduler-runtime
  evidence writers, or manager facades.
- Compatibility surface: `GoalLoopGateReadinessPreflight` gains optional fields;
  existing artifacts without support remain valid.
- Boundary tests: Goal Loop decision/preflight tests must cover supported and
  unsupported preflight paths plus rejection cases.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `GoalLoopGateReadinessPreflight`,
  scheduler-runtime controlled-step evidence, post-step routing decision,
  packet/controller/current-gate freshness, schema/rendering/repository
  contracts, and no-authority flags.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new cross-cutting mechanism is proposed.
- Domain-specific logic location: scheduler route facts remain in
  `src/scheduler-runtime/`; Goal Loop only validates and records compact support
  for its own preflight.
- Shared cross-cutting logic location: Goal Loop preflight remains the shared
  owner for current-gate readiness evidence.
- Local framework / state machine / projection / validation / gate avoided: no
  new routing framework, state machine, Workbench projection source, local gate,
  or ToolPolicy path.
- Future-cost reduction for similar features: future continuation support can
  attach compact support lineage to existing preflight evidence instead of
  adding one-off prompt/projection checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- `docs/STATUS.md` still names the completed prompt-context consumption work as
  the preferred next resume point. Fix during close/handoff rather than opening
  a separate docs-only phase.
- Subagent plan review returned `Revise`; this plan applies the required
  revisions: no prompt-evidence input, deterministic fail-closed checks, no
  Workbench-owned policy, optional compact preflight field, and explicit
  non-goals.

