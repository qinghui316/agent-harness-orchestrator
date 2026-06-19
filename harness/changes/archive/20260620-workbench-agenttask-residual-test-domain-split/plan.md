# Plan: Workbench AgentTask Residual Test Domain Split

## Approach

Perform the final residual Workbench test split. Move the last four tests into `workbench-agent-task-domain`, remove the empty residual file, update script contracts, and revise current docs that still reference the residual monolith as current work.

## Steps

1. Create `tests/unit/workbench-agent-task-domain.test.ts` with the four current residual tests.
2. Delete `tests/unit/workbench.test.ts`.
3. Update `package.json` to replace residual script membership with the new suite.
4. Update `docs/DEVELOPMENT.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `AGENTS.md` for active and final handoff state.
5. Run targeted suite, package contract, deleted-file check, docs drift grep, lint/typecheck/test, and Harness checks.
6. Run independent close-ready review, close, handle any pending evolution, and commit.

## Decisions

- Plan self-review required multiple corrections before PASS: include `docs/DEVELOPMENT.md`, strengthen package script contract checks, explicitly update `docs/STATUS.md`/`AGENTS.md`, and revise `docs/CURRENT-DEVELOPMENT-PLAN.md` because it names `tests/unit/workbench.test.ts`.
- Deleting `tests/unit/workbench.test.ts` is acceptable because it would otherwise be an empty residual shell.
- Existing `tests/unit/agent-task-boundaries.test.ts` remains the core AgentTask/maintenance boundary suite; the new Workbench suite owns Workbench projection/delegation surface assertions.
- Full `npm run test` and full `npm run test:workbench` are not planned unless contract checks or review reveal broader runtime drift.

## Module Boundary Plan

- Owner module: Workbench unit test suites by capability domain.
- New / moved responsibilities: AgentTask/delegation Workbench projection and policy-surface tests move from residual `workbench.test.ts` to `workbench-agent-task-domain`.
- Facade touch points: none; no product facade or manager behavior changes.
- Forbidden write-back locations: Workbench manager/server/frontend/bridge/facades and AgentTask domain logic remain untouched.
- Compatibility surface: package test scripts continue to provide explicit Workbench suite coverage; product APIs and behavior remain unchanged.
- Boundary tests: moved tests plus package script contract checks.
- Follow-up split candidates: none for residual `tests/unit/workbench.test.ts`; file is removed.
- If not applicable, reason: not applicable; test ownership and handoff docs are the boundary concern.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Vitest suite structure, shared Workbench `project` fixture, package script contracts, ECL lifecycle, Documentation Entropy, and current-plan guidance.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: Workbench AgentTask/delegation assertions live in the new Workbench capability suite.
- Shared cross-cutting logic location: shared setup remains in `tests/unit/workbench/fixtures.ts`; core AgentTask domain behavior remains covered by existing AgentTask suites.
- Local framework / state machine / projection / validation / gate avoided: no new fixture framework, local projection system, local state machine, or validation/gate mechanism.
- Future-cost reduction for similar features: future agents no longer have a residual Workbench monolith to inspect or run; new Workbench tests must choose an explicit capability suite.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
