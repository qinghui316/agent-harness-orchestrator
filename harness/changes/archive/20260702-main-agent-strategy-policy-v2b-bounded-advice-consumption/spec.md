# Spec: main-agent-strategy-policy-v2b-bounded-advice-consumption

## Goal

Let main-agent LLM strategy advice safely influence the internal strategy
classification only when current Harness evidence already supports that move.
The deterministic baseline must remain visible, stale or unsafe evidence must
win, and no advice may become an executable action or authority source.

## Users

- Developers using AHO Harness mode with request-approval or scoped
  full-access execution.
- Future main-agent policy work that needs a safe bridge between LLM judgment
  and deterministic Harness gates.

## Acceptance Criteria

- AC-001: Strategy decisions retain deterministic baseline kind/reason and
  expose final kind source / advice consumption metadata.
- AC-002: Valid advice can be accepted bounded only for direct, pipeline,
  clarify, blocked, or complete when the canonical evidence envelope permits.
- AC-003: Advice cannot override stale, malformed, old-schema, scope-mismatch,
  source/artifact drift, or blocked evidence.
- AC-004: Advice cannot create `parallel-scheduler-candidate`; that remains
  deterministic Scheduler readiness only.
- AC-005: Complete advice is accepted only when canonical completed posture or
  terminal result-gate evidence exists.
- AC-006: Executable-looking advice is rejected without echoing dangerous
  payloads.
- AC-007: Request-approval remains explain/wait only; full-access still runs
  only through current visible gate, existing allowlist, target freshness,
  revalidation, ToolPolicy/high-impact checks, and action owners.
- AC-008: No Workbench UI, worker context, delegate manifest, Scheduler worker
  context, confirmationQueue, action registry, automation allowlist,
  Scheduler/IntegrationCheck, apply/close, remote, PR, merge, or Harness
  evolution authority changes.

## Non-Goals

- Runtime LLM invocation.
- Free-form workflow controller.
- New strategy JSONL or durable advice ledger.
- New action type, UI surface, provider/runtime feature, or automation
  permission.

## Constraints

- AHO workflow truth remains Change/ECL plus accepted artifacts, current gates,
  ToolPolicyGate, validation/audit, confirmationQueue, and apply/close
  records.
- ODWF is only a workflow-shape and resume-journal reference; no ODWF runtime
  dependency.
- Codex Goal is only a persistent-objective and completion-audit reference; it
  does not replace AHO Change/ECL authority.

## Risks

- Advice could silently become a second controller if final-kind provenance is
  not explicit.
- Completion could be over-trusted if terminal evidence is not required.
- Automation could expand by accident if full-access eligibility is derived
  from advice instead of current gate + allowlist + revalidation.

