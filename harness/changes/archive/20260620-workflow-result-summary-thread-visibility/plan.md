# Plan: workflow-result-summary-thread-visibility

## Approach

Extend the existing Workbench workflow action result path so the already-owned result summary is captured on terminal workflow thread entries and displayed by the thread read model. This reuses the current action service, result summarizer, thread log, and read-model projection instead of introducing a separate report/evidence/manifest layer.

Subagent plan review result: PASS with required tightening. The implementation must keep `resultSummary` display-only, compute the summary once, limit read-model preference to workflow completed/failed items, sanitize failure presentation, and record concrete UI validation coverage.

## Steps

1. Add optional `resultSummary` to product and web thread message types.
2. Update `runWorkbenchWorkflowActionService` to compute one outcome summary and reuse it for both the terminal thread entry and decision record.
3. Update the Workbench thread read model to prefer `resultSummary` only for terminal workflow items and evidence display blocks, preserving existing fallback behavior.
4. Add/adjust targeted tests for controlled Scheduler handoff visibility, compatibility fallback, summary reuse, and internal-term leakage.
5. Run targeted product verification and determine whether a stable real browser Workbench validation is available for this non-React rendering change; record the result in review.
6. Run Harness verification, close the change only if review and handoff are aligned.

## Decisions

- `resultSummary` remains a string snapshot because existing result summaries are string-based and already feed decision history.
- The field is optional and ignored by non-workflow projection paths.
- No new scheduler runtime behavior is introduced.

## Module Boundary Plan

- Owner module: `src/workbench/actions/` owns action outcome summary capture; `src/workbench/projections/read-model/` owns display projection from durable thread entries.
- New / moved responsibilities: terminal workflow entries may carry a user-facing display snapshot; read-model turns it into item body/block copy.
- Facade touch points: none expected.
- Forbidden write-back locations: scheduler runtime, Goal Loop policy, ToolPolicyGate, validation/audit, IntegrationCheck, apply/close gates, accepted artifact records.
- Compatibility surface: `TopicThreadEntry.resultSummary?` and web `TopicMessageEntry.resultSummary?` are optional.
- Boundary tests: targeted read-model and action service tests.
- Follow-up split candidates: broader Workbench test-file split remains a later convergence change, not part of this product slice.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: action result summarizers, thread log entries, thread read-model projection, and existing Workbench render path.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: controlled Scheduler handoff wording remains in the controlled scheduler/action result modules.
- Shared cross-cutting logic location: thread display preference stays in the read model.
- Local framework / state machine / projection / validation / gate avoided: no new workflow state machine, evidence truth, report layer, gate, or scheduler loop.
- Future-cost reduction for similar features: future workflow actions can surface their existing summaries through the same optional field rather than adding feature-local projection rules.

## Planning-Discovered Gaps

- Need inspect whether real browser validation can be stable without creating fake seed data. If not stable, use DOM render test and record the limitation explicitly.
