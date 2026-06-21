# Plan: workbench-verification-signal-stability

## Approach

Treat this as a verification-signal convergence slice. Start by recording the current active change, then split the scheduler slow scenarios along capability boundaries, update package scripts so Workbench verification has clear layers, and fix the App DOM test to assert rendered UI before using fetch-call evidence. Run targeted diagnostics first, then aggregate Workbench and product gates.

## Steps

1. Confirm no active change or pending Harness evolution blocks this work.
2. Inspect `tests/slow/workbench-scheduler-flow.test.ts`, `tests/unit/web-app.test.tsx`, and `package.json` script membership.
3. Split the large scheduler slow file into named capability suites:
   - `workbench-scheduler-two-worker-integration-flow.test.ts`
   - `workbench-scheduler-discard-completion-flow.test.ts`
   - `workbench-scheduler-worker-rework-flow.test.ts`
4. Remove the residual monolithic scheduler slow file from script membership.
5. Add explicit package script layers for Workbench unit, scheduler slow, slow aggregate, and full Workbench aggregate verification.
6. Add `workbench-demand-to-execution-golden-flow.test.ts` to the Workbench slow/aggregate gate.
7. Change the App DOM run-graph tab test so DOM rendering is the primary condition and fetch-call inspection is auxiliary.
8. Run targeted split-suite and App DOM diagnostics, then aggregate/product/Harness verification.
9. Update summary/review/task evidence and close/handoff docs.

## Decisions

- Do not add product capabilities in this change; only fix product code if diagnostics prove a real product defect.
- Keep the scheduler scenarios in slow suites because they exercise broad runtime and source-safety paths.
- Prefer explicit package script membership over globbing slow Workbench tests, so future additions are deliberate.
- Keep fetch-call assertions as supplemental evidence only after the rendered UI state is observed.

## Module Boundary Plan

- Owner module: test files and `package.json` script surface.
- New / moved responsibilities: scheduler test scenarios move from one residual monolith into capability-domain slow suites.
- Facade touch points: not applicable; no product facade should receive new logic.
- Forbidden write-back locations: Workbench action/runtime/read-model facades and product source files, unless a real bug is found and recorded.
- Compatibility surface: npm script names `test:workbench` and `test:workbench:slow` remain available; new narrower script names may be added.
- Boundary tests: targeted split slow suites and App DOM suite.
- Follow-up split candidates: none expected if the monolith is removed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench Vitest suites, shared fixture builders, npm script gates, Harness verification commands.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: Workbench scheduler slow tests remain under `tests/slow`; App DOM checks remain in `tests/unit/web-app.test.tsx`.
- Shared cross-cutting logic location: existing test fixtures remain in `tests/unit/workbench/fixtures.ts`.
- Local framework / state machine / projection / validation / gate avoided: no new testing framework, evidence family, scheduler authority, or runtime gate is introduced.
- Future-cost reduction for similar features: explicit suite names make aggregate failures attributable by capability and prevent future Workbench coverage from collecting in a residual monolith.

## Planning-Discovered Gaps

- Splitting and single-running the scheduler slow suites exposed a real controlled Scheduler continuation bug: after `planning.scheduler.integration-check.run`, post-step readiness can legitimately be recorded with a recoverable warning because the next real gate is the existing IntegrationCheck apply/discard path, not another scheduler gate. The previous continuation guard treated any prior warning as fatal even after the user completed that non-scheduler gate and fresh Goal Loop/current-gate/preflight evidence existed for `planning.scheduler.integration-outcome.reconcile`.
- Minimal product fix: the boundary/runtime continuation guards now allow only the known recoverable post-step readiness warning text to proceed into fresh current-transition revalidation. Arbitrary warnings still fail closed, and dispatch still requires fresh matching current gate evidence.
