# Plan: auto-evolve-harness-workbench-rework-helper-reuse-window

## Approach

Use the pending archive window as evidence. Compare the repeated helper-reuse pattern against current ECL/review-template rules. If existing rules already cover the observed behavior, record a `keep / independent_review` evolution proposal and mark the pending window complete without changing rules/templates/lint/product code.

## Steps

1. Review pending candidate archive summaries and current ECL/template coverage.
2. Run subagent independent evolution assessment.
3. Write the evolution proposal with Decision, Evidence Window, Rationale, Independent Review, Experience Retention Scan, and Validation Plan.
4. Run Harness/documentation checks.
5. Run `harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
6. Update close/handoff pointers, close/archive the auto-evolve change, and run final Harness checks.

## Decisions

- Proposed result is `keep / independent_review`.
- No durable Harness rule/template/lint/product runtime change is proposed because the current ECL and review template already require Core Mechanism Reuse, Module Boundary, scoped action payload coverage, targeted verification rationale, Documentation Entropy, Experience Lifecycle, close/handoff drift, workflow truth, ToolPolicyGate, and human-gate preservation.
- Product `npm` suites are not planned because this evolution assessment does not change product source/runtime behavior.

## Module Boundary Plan

- Owner module: not applicable; no product module changes.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product source/runtime, Workbench UI, scheduler runtime, ECL templates/rules unless a durable gap is found.
- Compatibility surface: pending evolution state and handoff docs only.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: product module-boundary coverage is not applicable because this is a no-product-code Harness evolution assessment.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Harness evolution proposal/results flow, Documentation Entropy, Experience Lifecycle, Core Mechanism Reuse, Module Boundary, and targeted verification review fields.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: candidate helper/action/field details remain in archive/proposal evidence.
- Shared cross-cutting logic location: existing `docs/ECL.md` and review template coverage.
- Local framework / state machine / projection / validation / gate avoided: avoids adding another narrow helper-specific process rule.
- Future-cost reduction for similar features: future agents can continue using existing broad rules and archived examples without expanding current docs.
- If not applicable, reason: not applicable; this evolution directly evaluates mechanism reuse.

## Planning-Discovered Gaps

- Subagent evolution assessment agreed with `keep / independent_review`: no new durable rule/template/lint/product change is required, action/field details should remain archive-only, and closeout must fix stale active/pending handoff pointers.

