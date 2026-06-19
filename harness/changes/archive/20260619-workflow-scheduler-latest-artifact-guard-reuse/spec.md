# Spec: Workflow Scheduler Latest Artifact Guard Reuse

## Goal

Consolidate repeated scheduler latest-artifact id assertions into one owned
workflow-scheduler guard so future scheduler artifact phases do not repeat
private validation snippets.

## Users

- AHO developers extending scheduler-readiness artifacts.
- Future agents following Architecture Growth Control / Core Mechanism Reuse.

## Acceptance Criteria

- AC-001: `src/workflow-scheduler` has a scheduler-owned helper for latest
  artifact id assertions with the same error wording as the replaced checks.
- AC-002: `worker-plan.ts`, `claim-reconcile.ts`, `launch-preflight.ts`, and
  `scheduler-run.ts` reuse the helper only for identical latest id checks.
- AC-003: Status, lineage, source artifact hash, artifact-scope validation, JSON
  artifact shapes, markdown rendering, Workbench action behavior, ToolPolicyGate,
  human gates, and scheduler runtime execution behavior remain unchanged.
- AC-004: Focused tests or boundary assertions cover helper ownership,
  representative adoption, error wording, and workflow-scheduler import
  independence.

## Non-Goals

- Do not change `src/scheduler-runtime/*` latest reservation, snapshot,
  candidate, handoff, outcome, completion, or closeout checks.
- Do not add a scheduler loop, worker dispatch, slot allocator, child Change
  creation, worktree/run creation, source mutation, automatic apply/merge, or
  human-gate bypass.
- Do not reuse the Workbench action target helper as scheduler-domain logic.
- Do not inspect or modify reference projects.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation,
  Audit, IntegrationCheck, Apply/Close gates, and Harness evolution.
- `src/workflow-scheduler/manager.ts` may only receive a thin export if needed;
  main logic belongs in an owned module.
- The helper must stay a small pure assertion; it must not read latest artifacts,
  hide lineage/status/source-hash validation, or become a scheduler runtime gate.
- Preserve public TypeScript contracts and existing error wording.

## Risks

- Over-broad helper extraction could blur domain validation. Limit the helper to
  latest id equality and keep each caller's lineage/status/hash checks local.
- Exporting the helper could look like new public API. Avoid manager export
  unless a test or existing import surface requires it.
- Replacing checks mechanically could miss an intentionally different check.
  Limit replacements to the 14 exact `latest.id !== target.id` scheduler
  artifact checks found in planning.
