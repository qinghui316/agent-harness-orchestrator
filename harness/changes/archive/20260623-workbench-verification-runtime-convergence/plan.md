# Plan: Workbench Verification Runtime Convergence

## Approach

Treat this as verification topology convergence, not product work. First record
baseline timing/process evidence. Then split package scripts so daily
`test:workbench` excludes the full-chain two-worker golden but retains
capability-domain scheduler coverage. Move or duplicate any daily-critical
assertions into seeded scheduler capability tests only if package-script split
alone would drop coverage. Finish with daily aggregate, release/deep gate, and
standard product/Harness checks.

## Steps

1. Run baseline diagnostics for Workbench unit, scheduler slow, slow suites,
   full `test:workbench`, and repo-scoped leftover process checks.
2. Update package scripts to introduce `test:workbench:release` and keep
   daily `test:workbench` bounded.
3. If needed, adjust scheduler slow test membership so seeded capability-domain
   suites protect the daily gate while the full two-worker golden moves to
   release/deep gate.
4. Clean the small handoff drift in `docs/STATUS.md` and
   `docs/CURRENT-DEVELOPMENT-PLAN.md`.
5. Run targeted and aggregate verification.
6. Update active review/summary with timing, process cleanup, and coverage
   classification; close/archive and update handoff.

## Decisions

- Daily gate: `npm run test:workbench` should be the reliable ordinary
  Workbench aggregate.
- Release/deep gate: `npm run test:workbench:release` should include
  `npm run test:workbench` plus the full scheduler two-worker integration
  golden path.
- Coverage preservation: the full two-worker test remains in source and in
  release/deep script; daily scheduler coverage relies on seeded and focused
  scheduler suites already retained by the prior change.

## Module Boundary Plan

- Owner module: package script/test topology and scheduler test fixtures.
- New / moved responsibilities: no product module responsibility moves.
- Facade touch points: none.
- Forbidden write-back locations: product runtime managers and broad Workbench
  facades unless diagnostics expose a real cleanup bug.
- Compatibility surface: existing package scripts remain; new release script is
  additive.
- Boundary tests: package scripts and touched slow suites.
- Follow-up split candidates: if seeded scheduler fixtures grow again, split
  scheduler-specific fixture builders out of the shared Workbench fixture file.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: package-script gates,
  capability-domain slow suites, seeded scheduler fixture pattern, ECL
  aggregate-timeout evidence rule, and Harness close/handoff drift coverage.
- New cross-cutting mechanism: none.
- Domain-specific logic location: slow Workbench scheduler tests and package
  scripts.
- Shared cross-cutting logic location: existing test fixtures and package
  scripts.
- Local framework / state machine / projection / validation / gate avoided: no
  new product test framework or runtime state machine.
- Future-cost reduction: future agents can run a reliable daily Workbench gate
  and explicitly choose release/deep coverage when touching full scheduler
  behavior.

## Planning-Discovered Gaps

None.
