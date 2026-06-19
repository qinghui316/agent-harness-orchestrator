# Plan: Maintenance Markdown Section Helper Reuse

## Approach

Add the smallest useful generic section helper to the existing `maintenance-markdown.ts` owner and make canonical maintenance renderers call it for repeated `## Section` layout. The helper is a tiny layout helper, not a markdown DSL, artifact/report framework, validation system, or protocol.

## Steps

1. Add `renderMaintenanceMarkdownSection` to `src/agent-task/maintenance-markdown.ts`.
2. Reuse it in `src/agent-task/canonical-updates.ts`, `src/agent-task/canonical-patch-application.ts`, and `src/agent-task/canonical-patch-application-report.ts`.
3. Add exact helper output tests, including empty-list behavior through composed section output.
4. Add module-boundary assertions that canonical maintenance renderers reuse the section helper and do not regain local section layout ownership.
5. Run targeted product and Harness verification, complete independent close-ready review, update handoff, close, handle pending evolution if triggered, and commit.

## Decisions

- Plan review `019ee20c-57bd-71d0-9b05-023178af2adc` returned PASS.
- Reference projects are not needed; this is internal renderer/helper reuse.
- Full `npm run test` is not required unless implementation touches behavior outside renderer-only code.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-markdown.ts`.
- New / moved responsibilities: generic maintenance Markdown section layout only.
- Facade touch points: none.
- Forbidden write-back locations: Workbench action/server/frontend code, manager facades, artifact stores/lifecycle, ledger, authority, lineage, target validation, runtime, scheduler, Goal Loop, ToolPolicyGate, human-gate code, and source mutation code.
- Compatibility surface: generated canonical maintenance Markdown meaning, public manager exports, artifact shapes, Workbench maintenance flow.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts` and `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `maintenance-markdown.ts` and existing canonical maintenance renderers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: current list/detail helpers exist, but `## Section` layout is still repeated across canonical maintenance renderers.
- Domain-specific logic location: canonical update/proposal/gate/manifest/result/report modules keep their source ids, target kinds, operations, risks, guardrails, policy audit, and evidence content.
- Shared cross-cutting logic location: maintenance Markdown owner.
- Local framework / state machine / projection / validation / gate avoided: no markdown DSL, artifact framework, local state machine, projection, validation gate, or runtime protocol.
- Future-cost reduction for similar features: future maintenance evidence renderers can reuse one section layout helper instead of reimplementing local section arrays.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
