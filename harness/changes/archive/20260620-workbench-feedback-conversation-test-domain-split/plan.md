# Plan: Workbench Feedback Conversation Test Domain Split

## Approach

Perform a bounded test-topology split. Move existing assertions without changing product runtime code, reuse shared Workbench fixture helpers where they already own common setup, and keep proposal-specific run fixture code local to the feedback suite because it is not a cross-domain helper.

## Steps

1. Create `tests/unit/workbench-feedback-surface.test.ts` with the Draft PR feedback classifier test and proposal request-changes Workbench action test.
2. Create `tests/unit/workbench-conversation-lifecycle.test.ts` with the five Workpad / demand conversation lifecycle tests.
3. Remove those seven tests from `tests/unit/workbench.test.ts`; remove unused imports and local helpers so it contains only AgentTask/delegation/boundary tests.
4. Update `package.json` so both new suites are excluded from `test:fast` and included in `test:workbench` before residual `tests/unit/workbench.test.ts`.
5. Run targeted suite, script membership, lint/typecheck/test, and Harness checks; update review and handoff evidence before close.

## Decisions

- Plan review completed before ECL implementation: subagent returned PASS and required concrete script membership checks plus explicit test-topology coverage notes.
- No reference project inspection is needed because this phase moves existing local test coverage and does not design product behavior.
- Full `npm run test` is not planned because this phase does not change product runtime; targeted suites, `test:fast`, lint/typecheck, and Harness checks cover the changed paths.

## Module Boundary Plan

- Owner module: Workbench test suites under `tests/unit/`, split by capability domain.
- New / moved responsibilities: proposal-feedback tests move to `workbench-feedback-surface`; conversation lifecycle tests move to `workbench-conversation-lifecycle`; AgentTask/delegation tests remain in residual suite for a later split.
- Facade touch points: none; no product facade or manager behavior changes.
- Forbidden write-back locations: no new product logic in Workbench manager/server/frontend/bridge/facades.
- Compatibility surface: public product APIs and Workbench behavior remain unchanged.
- Boundary tests: moved tests themselves remain the behavior preservation checks; residual suite proves AgentTask coverage still runs.
- Follow-up split candidates: AgentTask/delegation/boundary residual domain.
- If not applicable, reason: not applicable; test ownership is the boundary concern for this phase.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Vitest suites, `tests/unit/workbench/fixtures.ts`, ECL active-change lifecycle, and package script suite membership.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed.
- Domain-specific logic location: test assertions stay in domain-named unit suites.
- Shared cross-cutting logic location: shared setup remains in `tests/unit/workbench/fixtures.ts`; proposal-only fixture code stays file-local.
- Local framework / state machine / projection / validation / gate avoided: no new fixture framework, local projection builder, local gate, or validation protocol.
- Future-cost reduction for similar features: future agents can run feedback or conversation lifecycle tests directly without executing unrelated AgentTask/delegation residual coverage.
- If not applicable, reason: not applicable; this phase directly supports Architecture Growth Control through test ownership.

## Planning-Discovered Gaps

None yet.
