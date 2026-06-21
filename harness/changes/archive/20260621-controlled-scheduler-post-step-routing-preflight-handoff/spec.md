# Spec: controlled-scheduler-post-step-routing-preflight-handoff

## Goal

When the main Agent prepares a `GoalLoopGateReadinessPreflight` after a
controlled Scheduler step stopped, the preflight can optionally carry compact
support lineage from the latest aligned
`controlledLoopPostStepRoutingDecision`.

The support proves that the current preflight follows the existing owner/gate
named by the prior one-confirmed Scheduler step. It remains evidence only and
does not authorize the concrete gate.

## Users

- Main Agent / Goal Loop prompt and continuation paths that need to explain why
  the current existing gate is the next safe decision.
- Developers reviewing run artifacts and Workpad evidence after a controlled
  Scheduler transition.
- Future controlled Scheduler continuation slices that need a reusable
  preflight support pattern instead of feature-local routing checks.

## Acceptance Criteria

- AC-001: `GoalLoopGateReadinessPreflight` supports an optional compact
  controlled Scheduler post-step routing support object with source step id,
  source artifact, route family, owner module, existing gate action type,
  continuation readiness status, reason, evidence refs, and explicit false
  authority flags.
- AC-002: Preflight compilation writes that support only when deterministic
  fail-closed checks pass: same Change, source step present, continuation
  decision status `ready-for-human-gate`, routing readiness
  `ready-for-human-gate`, `needsReevaluation === false`, existing gate action
  type equals the current gate action type, target scope is compatible with the
  preflight current gate, and all execution/source/apply/close/merge/remote
  /evolution authority flags are false.
- AC-003: Stale or mismatched support is rejected, including cross-Change
  support, missing source step data, non-ready continuation/routing status,
  reevaluation-required routing, current-gate action mismatch, target scope
  mismatch, forged authority flags, or packet/controller/preflight lineage
  mismatch.
- AC-004: Existing preflight behavior remains compatible when no support object
  is provided. No Workbench action, confirmation queue behavior, ToolPolicy
  path, source/apply/close/merge/remote path, or Harness evolution path changes.
- AC-005: Schema parsing, markdown rendering, repository read/write, and
  targeted unit coverage prove ready inclusion, rejection paths, legacy
  compatibility, and no-authority preservation.
- AC-006: Handoff docs no longer point the next resume step at the already
  completed prompt-context consumption stage.

## Non-Goals

- Do not execute the concrete gate or call its handler from Goal Loop preflight.
- Do not add a scheduler loop, automatic continuation, worker start, whole-wave
  dispatch, slot allocator, or parallel executor.
- Do not add a new Workbench action, UI button, confirmation queue item, server
  route, or request carrier for controlled post-step routing support.
- Do not treat `ControlledSchedulerPostStepRoutingPromptEvidence`, Workpad
  projection, or routing confidence as workflow truth.
- Do not change ToolPolicyGate, human confirmation, source apply/close/merge,
  remote landing, or Harness evolution behavior.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit,
  IntegrationCheck, ToolPolicyGate, Apply/Close human gates, and Harness
  evolution records.
- `src/goal-loop/` owns preflight policy and support validation.
- `src/scheduler-runtime/` remains the owner of controlled step and post-step
  routing evidence production.
- Workbench, bridge, frontend, and manager facades may not own routing support
  policy.
- The support object must be compact and must not persist full prompt markdown,
  full Workpad snapshots, or executable action payloads.

## Risks

- Risk: adding another evidence field could become append-only complexity.
  Mitigation: attach it to the existing preflight mechanism and make it optional
  and compact.
- Risk: support lineage could be mistaken for execution authority. Mitigation:
  schema/type/rendering preserve explicit no-authority flags and tests assert
  no concrete gate invocation or ToolPolicy authorization.
- Risk: Workbench scope expansion. Mitigation: no new action/request carrier in
  this slice; compiler-level support only.

