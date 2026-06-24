# Plan: workbench-scheduler-integrationcheck-real-acceptance-v1

## Approach

Run a real UI acceptance pass in a fresh E-drive sandbox. Drive Workbench as a user until the scheduler integration candidate is ready, then manually confirm `planning.scheduler.integration-check.run`. Treat the resulting IntegrationCheck as the product truth for aggregate validation/audit and bounded internal fix attempts.

## Steps

1. Prepare active change files and confirm the source checkout is clean except unrelated `README.md`.
2. Create `E:\aho-accept\scheduler-integrationcheck-v1\src` as a small git-tracked Node/TS project and install dependencies.
3. Use `E:\aho-accept\scheduler-integrationcheck-v1\home` as the isolated AHO runtime home.
4. Build/start Workbench from the AHO checkout and open the external source.
5. In the real browser UI, create a low-conflict two-file demand, manually confirm planning/decomposition/readiness, then choose `完全访问权限`.
6. Let scoped automation reach the ready scheduler integration candidate while verifying raw scheduler actions remain outside direct automation.
7. Manually confirm `planning.scheduler.integration-check.run`.
8. Record IntegrationCheck evidence and final gate; only fix product code if the blocker is product-owned.
9. Run scoped verification and close the change with handoff docs updated.

## Decisions

- The IntegrationCheck gate is manual because it is a raw scheduler action outside scoped automation V1.
- IntegrationCheck internal bounded fix attempts are accepted existing behavior, but they do not mutate source root.
- This change stops at existing human apply/discard or blocker evidence; automatic apply is out of scope.

## Module Boundary Plan

- Owner module: not changed unless a blocker appears.
- If changed, owner modules are IntegrationCheck (`src/integration-check/*`), scheduler handoff/outcome (`src/scheduler-runtime/*`), Workbench action revalidation/projection, or frontend surface.
- New / moved responsibilities: none planned.
- Facade touch points: avoid adding main logic to broad facades.
- Forbidden write-back locations: do not add scheduler/integration logic to unrelated Workbench facades or automation policy unless the blocker proves that exact boundary.
- Compatibility surface: existing Workbench action payloads and IntegrationCheck records must remain compatible.
- Boundary tests: targeted owner tests if product code changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: current-gate revalidation, scheduler handoff, IntegrationCheck service, aggregate validation/audit, bounded IntegrationFix, Workbench confirmation queue, and source apply safety.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is planned.
- Domain-specific logic location: existing scheduler or integration owners only if needed.
- Shared cross-cutting logic location: existing action revalidation and source safety owners.
- Local framework / state machine / projection / validation / gate avoided: no second automation runtime, scheduler runtime, or IntegrationCheck path.
- Future-cost reduction: records the exact next scheduler integration blocker without expanding architecture.

## Planning-Discovered Gaps

None yet.
