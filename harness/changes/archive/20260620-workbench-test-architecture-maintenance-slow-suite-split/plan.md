# Plan: Workbench Test Architecture Maintenance Slow Suite Split

## Approach

Move the complete residual Workbench maintenance/self-evolution test cluster into a dedicated slow suite. Keep the change mechanical: relocate tests and maintenance-only helper code, update the explicit slow-suite npm script, and leave product runtime code untouched.

## Steps

1. Create `tests/slow/workbench-maintenance-flow.test.ts` using the existing Workbench fixture lifecycle from `tests/unit/workbench/fixtures.ts`.
2. Move these five tests out of `tests/unit/workbench.test.ts`:
   - `records background maintenance ledger entries and creates human-gated candidate reviews`
   - `records terminal demand closeouts, runs five-change maintenance review, and keeps maintenance out of the current confirmation queue`
   - `returns review-ready when five new closeouts arrive after an older maintenance watermark`
   - `selects newest eligible maintenance confirmation records with projection summary helper semantics`
   - `applies ready maintenance canonical patch manifests only through a scoped confirmation`
3. Move only the maintenance-specific helper/type setup needed by those tests into the new suite:
   - `MaintenanceCanonicalUpdateProposalFixture`
   - `writeMaintenanceArtifactCreatedAt`
   - `createMaintenanceCanonicalUpdateProposalFixture`
4. Update `package.json` `test:workbench:slow` to include `tests/slow/workbench-maintenance-flow.test.ts` explicitly.
5. Verify targeted suites and the changed slow-suite contract without repeated full Workbench runs unless evidence shows a gap.

## Decisions

- The scope is maintenance confirmation/apply flow only; adjacent AgentTask/delegate/tool-policy tests remain in the residual unit suite.
- Reference project source is not needed because this is a local test relocation with no new product design.
- Full `npm run test:workbench` is optional for this phase; equivalent targeted coverage is preferred unless close evidence shows a missing path.

## Module Boundary Plan

- Owner module: not applicable for product runtime; test ownership moves to a dedicated slow suite.
- New / moved responsibilities: maintenance long-path regression coverage moves from residual unit monolith to `tests/slow/workbench-maintenance-flow.test.ts`.
- Facade touch points: none.
- Forbidden write-back locations: no product `src/` files, Workbench facades, Harness templates, or reference project files.
- Compatibility surface: `npm run test:workbench:slow` and `npm run test:workbench` continue to include the moved coverage through explicit script composition.
- Boundary tests: targeted maintenance slow suite, residual Workbench suite, demand-worker suite if needed for Workbench unit contract, and slow-suite script.
- Follow-up split candidates: none.
- If not applicable, reason: product module-boundary coverage is not applicable because no product runtime code changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench slow-suite staging and existing `tests/unit/workbench/fixtures.ts` lifecycle helpers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: maintenance flow tests and maintenance-only helpers live in the new maintenance slow suite.
- Shared cross-cutting logic location: existing shared Workbench fixtures remain in `tests/unit/workbench/fixtures.ts`.
- Local framework / state machine / projection / validation / gate avoided: no new fixture framework, local state machine, projection system, validation gate, or artifact protocol is introduced.
- Future-cost reduction for similar features: future maintenance/self-evolution changes can run a focused slow suite first instead of searching or running the residual Workbench monolith.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None blocking. Subagent plan review returned PASS and recommended keeping the migrated scope to the five listed maintenance tests, moving maintenance-only helpers with the suite, and avoiding repeated full-suite verification unless evidence shows a gap.

