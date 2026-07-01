# main-agent-controlled-scheduler-integration-v1

## Purpose

Harden the non-executing Scheduler candidate signal so it can safely feed later
controlled Scheduler integration, and add a narrow main-agent integration route
that points only to the existing controlled Scheduler path.

This is still an architecture seam. It does not execute Scheduler actions,
does not create a new Scheduler gate, and does not connect Scheduler to the
main-agent action bridge.

## Scope

In scope:

- Extend WorkflowGraph observation with existing readiness `nextAllowedAction`
  and `schedulerEligible` fields.
- Require `status + nextAllowedAction + schedulerEligible + freshness/scope`
  agreement before emitting `candidate-signal-observed`.
- Add a non-executing main-agent controlled Scheduler integration route helper.
- Add unit and module-boundary tests for old-schema, no-payload, and no
  scheduler-runtime execution boundaries.
- Update current roadmap / handoff docs.

Out of scope:

- Raw Scheduler action execution, SchedulerRun / WorkerLease /
  IntegrationCheck creation, worker start, validation, audit, rework, or
  integration handoff.
- Workbench UI, confirmation queue, action bridge, automation allowlist,
  apply/close, remote, merge, PR, or Harness evolution changes.

## Current Status

Completed. Ready to close.

## Verification

- `npx vitest run tests/unit/main-agent-scheduler-candidate-assessment.test.ts tests/unit/main-agent-controlled-scheduler-integration.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; active change is close-ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested no messy code and no
  duplicate Scheduler gate.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; docs/STATUS.md and
  docs/CURRENT-DEVELOPMENT-PLAN.md current-state wording will be updated.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
