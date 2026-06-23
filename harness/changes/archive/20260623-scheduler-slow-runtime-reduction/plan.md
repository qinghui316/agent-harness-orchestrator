# Plan: scheduler-slow-runtime-reduction

## Approach

Start with diagnostics, not refactoring. Run each scheduler slow member in
isolation, measure elapsed time, and check for leftover Vitest/Node/Git
processes. Use that evidence to decide whether the bottleneck is repeated
full-chain fixture setup or a real runtime cleanup leak.

If the issue is repeated setup, reduce only test topology: keep one full
two-worker scheduler golden flow, then introduce controlled canonical
intermediate fixtures for later-stage tests that already depend on verified
upstream state. Seeded fixtures must write the same artifact families consumed
by production projections/actions and must still flow through real Workbench
actions for the capability under test.

If diagnostics show a real runtime leak, fix the smallest owned production
boundary first and add targeted coverage before returning to fixture reduction.

## Steps

1. Record baseline diagnostics for the four scheduler slow files.
2. Inspect duplicated setup in `tests/unit/workbench/fixtures.ts` and the slow
   scheduler files.
3. Add or adjust scheduler test fixture helpers so later-stage tests can start
   from canonical intermediate state.
4. Preserve one end-to-end two-worker integration flow as the golden path.
5. Re-run scheduler slow split members and aggregate Workbench gates.
6. Update review, summary, and handoff docs with the final bottleneck result.

## Decisions

- Use `scheduler-slow-runtime-reduction` as the active change id.
- Treat this as a test architecture/runtime-cost change by default, not a
  product expansion.
- Keep seeded fixture logic in test-owned fixtures unless diagnostics prove a
  product cleanup bug.
- Do not add new scheduler authority, Goal Loop authority, Workbench actions, or
  runtime artifact schemas.

## Module Boundary Plan

- Owner module: test fixture ownership under `tests/unit/workbench/fixtures.ts`
  or a focused test helper if the existing fixture file becomes too broad.
- New / moved responsibilities: scheduler intermediate-state fixture setup for
  tests only.
- Facade touch points: not applicable unless a product leak is found.
- Forbidden write-back locations: no new product workflow branches in broad
  Workbench or scheduler facades unless diagnostics require a minimal owner
  fix.
- Compatibility surface: package scripts and public product APIs remain stable;
  test files may be reorganized.
- Boundary tests: scheduler slow split members and aggregate Workbench gate.
- Follow-up split candidates: if the fixture file grows too broad, split
  scheduler-specific helpers into a focused test helper.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench action
  execution, scheduler runtime artifacts, integration checks, validation/audit
  artifacts, worktree manager, and source-safety checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new product mechanism is proposed; a test helper may be needed to avoid
  repeating long upstream flows.
- Domain-specific logic location: scheduler slow tests and scheduler test
  fixtures.
- Shared cross-cutting logic location: existing production artifact readers and
  projections remain the consumers of seeded state.
- Local framework / state machine / projection / validation / gate avoided:
  avoid introducing a second scheduler runtime or mock action framework.
- Future-cost reduction for similar features: later scheduler capability tests
  can target the stage under test without replaying the whole flow.

## Planning-Discovered Gaps

- Prior planning diagnostics observed that the discard-completion slow file can
  exceed an ordinary tool window even by itself.
- `prepareSchedulerTwoWorkerIntegrationHandoff` currently calls
  `prepareSchedulerFirstWorkerThroughResult` and then continues through first
  validation/audit, integration candidate, second worker start/result,
  validation/audit, candidate refresh, and IntegrationCheck handoff. Tests using
  it inherit the whole chain even when they only assert discard/completion or
  prompt handoff behavior.
