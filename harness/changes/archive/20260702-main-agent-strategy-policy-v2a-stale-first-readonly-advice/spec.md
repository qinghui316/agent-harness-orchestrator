# Spec: main-agent-strategy-policy-v2a-stale-first-readonly-advice

## Goal

Repair the V1c resume-consumption stale/blocked precedence and introduce a
strict, read-only strategy advice contract that can be safely reviewed before a
later phase decides whether LLM advice may influence strategy policy.

## Users

- Developers using AHO Harness mode with `逐步确认` or `自动推进`.
- Future main-agent policy work that needs LLM-assisted reasoning without
  making LLM output a controller or workflow truth.

## Acceptance Criteria

- AC-001: Resume consumption returns `stale` before explain/allow when the
  current gate is cross-Change/stale-target, the ResumePoint bind is
  stale/key/scope mismatched, or strategy evidence has unsafe gaps.
- AC-002: Resume consumption returns `blocked` for malformed/blocked evidence
  only after stale/scope drift has been ruled out.
- AC-003: Request-approval with stale or unsafe resume/strategy evidence does
  not return `explain-existing-gate`.
- AC-004: `MainAgentStrategyAdvice` is read-only, schema-validated, and marked
  with `authority: "read-only-main-agent-strategy-advice"`,
  `executionStarted: false`, and `controller: false`.
- AC-005: Advice containing action, approval, scheduler, recommended-action, or
  apply/close payload hints is rejected and converted to ignored advice.
- AC-006: V2a does not use advice to change `MainAgentStrategyDecision.kind`,
  `modeCompatibility.fullAccess`, scoped automation allowlist eligibility, or
  current-gate execution behavior.
- AC-007: Strategy advice boundaries are covered by module-boundary tests and
  documentation.

## Non-Goals

- LLM strategy model calls.
- New strategy JSONL or durable advice evidence family.
- New action types, UI, confirmationQueue behavior, automation allowlist
  permissions, Scheduler/IntegrationCheck execution, apply/close, remote, PR,
  merge, or Harness evolution.

## Constraints

- `deriveStrategyDecision(...)` remains the only strategy decision producer.
- Strategy Consumption remains the only bridge to scoped automation.
- Advice may be attached only as bounded metadata; any future consumption must
  be a separate structured change.
- ODWF is a shape/recovery reference only; no ODWF runtime dependency or
  executable workflow scripts are introduced.

## Risks

- If advice is shaped too much like a decision, future code may accidentally
  treat it as a controller.
- If stale-first ordering is incomplete, automatic and stepwise modes may hide
  unsafe evidence behind generic human-gate posture.

