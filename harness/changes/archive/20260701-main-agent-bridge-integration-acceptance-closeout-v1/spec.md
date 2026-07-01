# Spec: main-agent-bridge-integration-acceptance-closeout-v1

## Goal

Confirm and close out the existing main-agent bridge integration without adding
a second implementation layer. The bridge must remain a non-executing
fail-closed check that only validates explicit main-agent evidence ids against a
currently visible Harness gate.

## Users

- AHO maintainers continuing the main-agent architecture migration.
- Future agents that need accurate roadmap state before starting
  Recovery/resume work.

## Acceptance Criteria

- AC-001: Approval action server path with explicit main-agent evidence ids
  calls the existing bridge assessment before `runAllowlistedAction`.
- AC-002: Approval action server path rejects non-ready bridge assessments and
  partial evidence ids without executing the approval action.
- AC-003: Workflow action revalidation preserves existing behavior when no
  bridge ids are present and rejects partial ids.
- AC-004: Core bridge coverage proves scheduler/worker/integration-like gates
  are unsupported and stale or incomplete result-handoff evidence fails closed.
- AC-005: Current handoff docs mark bridge practical integration complete and
  identify Recovery/resume as the next main-agent migration slice.

## Non-Goals

- No new bridge owner, server action framework, or user-facing control.
- No change to confirmation queue selection, action registry, revalidation,
  automation allowlist, ToolPolicyGate, or workflow authority.
- No deletion of legacy seams that are scheduled for later retirement.

## Constraints

- `assessMainAgentActionBridge` remains the single bridge assessment owner.
- Workflow visible-gate extraction remains in current action revalidation.
- Approval visible-gate extraction remains in the server Workbench action route.
- Requests without bridge ids must behave exactly as before.

## Risks

- Over-abstracting the two server paths would create a cross-layer mini
  framework for a closeout change.
- Treating bridge evidence as authorization would weaken Harness authority.
- Leaving docs stale would make later agents repeat completed bridge work
  instead of starting Recovery/resume.

