# Plan: Verification Scope Guidance Alignment

## Approach

Make a narrow Harness/docs alignment change. The existing command surface already has `test:fast`, `test:integration`, `test:workbench`, `test:workbench:slow`, and full `npm run test`; this phase documents when to use each layer and records the expectation that review evidence names the verification scope.

## Steps

1. Update `AGENTS.md` Product verification to show scoped verification first and escalation to aggregate/full suites only for high-impact boundaries.
2. Update tracked handoff/rule docs with a task-to-command map using the existing npm scripts.
3. Update `docs/ECL.md` verification guidance to require review evidence for selected scope and skipped full suites when applicable.
4. Update `harness/templates/change/reviews/review.md` so the template has a place to record verification scope and full-suite rationale.
5. Update `docs/STATUS.md` for active handoff consistency and verification command guidance.
6. Run documentation/Harness validation and targeted drift checks. Do not run product tests unless implementation unexpectedly touches source, tests, or package scripts.

## Decisions

- Treat full `npm run test` as a release/broad-risk gate, not the default for every bounded docs/helper/test-topology change.
- Keep existing npm script names; no new command surface is introduced.
- Review evidence must justify verification scope so skipped full suites are explicit engineering decisions.
- Do not force-add ignored `docs/DEVELOPMENT.md`; use tracked AGENTS/STATUS/ECL/template files for durable guidance in this phase.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: Workbench, bridge, frontend, manager facades, runtime services, package scripts, and tests.
- Compatibility surface: current npm scripts and Harness lifecycle remain unchanged.
- Boundary tests: Harness lint/status/evolve checks; product module-boundary tests are not applicable.
- Follow-up split candidates: none.
- If not applicable, reason: this is a documentation/template alignment change and does not add or change product module behavior.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing npm script layers, ECL verification/review evidence, Documentation Entropy Coverage, and Harness lifecycle checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: ECL verification guidance and the shared review template.
- Local framework / state machine / projection / validation / gate avoided: avoids inventing a per-change validation framework or requiring full suites by default.
- Future-cost reduction for similar features: later agents can choose narrow, defensible checks faster while still escalating for broad-risk changes.
- If not applicable, reason: product-code reuse coverage is not applicable because no product feature path is changed.

## Planning-Discovered Gaps

- Plan review subagent `019ee223-7a6a-7b82-a10d-08ae23e7e9a0` returned PASS and noted that ECL guidance about skipped full suites should be reflected in the review template to avoid rule/template drift.
- Planning inspection found `docs/DEVELOPMENT.md` is ignored by `.gitignore`; it is read for local command context but not used as a durable commit target in this phase.
