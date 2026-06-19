# Plan: auto-evolve-harness-maintenance-section-helper-window

## Approach

Handle the pending evolution as a bounded `keep / independent_review` evaluation unless the evidence reveals a current rule/template/lint gap. The likely window lesson is already covered by existing Architecture Growth Control/Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, and targeted Workbench test-strategy guidance.

## Steps

1. Review the pending file and the five candidate archive summaries.
2. Write a proposal with decision, rationale, Experience Retention Scan, and no-change scope.
3. Request independent subagent review of the proposal.
4. Run `harness-evolve mark-complete` with the independently reviewed result.
5. Run Harness validation, update handoff, close, handle any new pending evolution if triggered, and commit.

## Decisions

- Initial decision: propose `keep / independent_review`.
- No reference-project source review is needed; this window concerns local Harness/process evidence.
- No product source changes are allowed in this auto-evolve change.

## Module Boundary Plan

- Owner module: not applicable for product module boundaries.
- New / moved responsibilities: not applicable.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench/server/frontend/runtime/scheduler/Goal Loop/ToolPolicy/human-gate code, and broad Harness rule/template files unless proposal review finds a real gap.
- Compatibility surface: ECL lifecycle, pending evolution handling, handoff docs.
- Boundary tests: Harness validation commands.
- Follow-up split candidates: none.
- If not applicable, reason: auto-evolve evaluation records process evidence; it does not add product module logic.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Controlled Evolution, Experience Lifecycle, Documentation Entropy, Architecture Growth Control/Core Mechanism Reuse, Module Boundary review, targeted verification guidance.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed unless independent review finds a gap.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: current ECL rules and archived proposal evidence.
- Local framework / state machine / projection / validation / gate avoided: no new product or Harness mechanism.
- Future-cost reduction for similar features: keep detailed examples archive-only and preserve current docs as compact derived memory.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
