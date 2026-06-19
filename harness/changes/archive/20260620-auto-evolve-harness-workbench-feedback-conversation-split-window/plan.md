# Plan: Auto Evolve Harness Workbench Feedback Conversation Split Window

## Approach

Use the pending archive window as evidence, compare repeated lessons against current Harness and planning docs, and record `keep` because existing Architecture Growth Control, Documentation Entropy, Experience Lifecycle, and test-strategy guidance already cover the Workbench test-architecture lesson.

## Steps

1. Read `harness/evolution/pending.md` and each candidate archive summary.
2. Confirm current docs already cover capability-domain splits, shared fixture reuse, targeted verification, and compact current-doc memory.
3. Produce `harness/evolution/proposals/20260620-workbench-feedback-conversation-split-window-keep.md`.
4. Record independent subagent review.
5. Run `mark-complete` with `Status=keep` and `EvalMode=independent_review`.
6. Run Harness validation, update final handoff, and close.

## Decisions

- Subagent plan review `019ee1cf-63ec-7523-ad86-14736dd5abdd` returned PASS and found no required durable Harness rule/template/lint/product-runtime change.
- The proposal must use the exact current candidate window, not the prior Workbench split proposal window.
- Handoff updates stay limited to active/pending/latest archive state; no new process rule text is added.

## Module Boundary Plan

- Owner module: Harness evolution artifacts under `harness/evolution/` and ECL change files under the active change.
- New / moved responsibilities: no product responsibilities moved.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench manager/server/frontend/bridge/facades, and reference projects remain untouched.
- Compatibility surface: Harness evolution command surface remains unchanged.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: AgentTask/delegation Workbench residual tests remain product-side future work, not part of this evolution.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Harness evolution pending/proposal/results flow, ECL active change lifecycle, Documentation Entropy, Experience Lifecycle, and current Workbench test strategy guidance.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: Workbench test-architecture details remain in archive summaries and current plan guidance.
- Shared cross-cutting logic location: ECL and current-plan docs already own process guidance.
- Local framework / state machine / projection / validation / gate avoided: no new evolution framework or rule layer.
- Future-cost reduction for similar features: records that existing guidance is sufficient and prevents duplicate current-doc rules.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
