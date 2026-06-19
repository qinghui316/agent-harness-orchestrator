# Workflow Scheduler Latest Artifact Guard Reuse

## Purpose

Reuse one scheduler-domain latest-artifact guard for repeated latest id checks
inside `src/workflow-scheduler`. This continues Architecture Growth Control by
moving a repeated cross-cutting validation idiom into an owned scheduler helper
without changing scheduler artifacts, Workbench actions, Goal Loop, ToolPolicy,
human gates, or runtime execution behavior.

## Scope

In scope:

- Add a small pure scheduler artifact guard owner for `latest.id === target.id`
  assertions.
- Replace identical latest id checks in `worker-plan.ts`,
  `claim-reconcile.ts`, `launch-preflight.ts`, and `scheduler-run.ts`.
- Preserve existing error wording and all status, lineage, source-hash, artifact
  scope, and write behavior.
- Add focused boundary/unit assertions for the helper owner and representative
  adoption.

Out of scope:

- Scheduler runtime reservation/snapshot/candidate/outcome latest checks.
- Workbench action target helpers, UI, action ids, payload contracts, server
  routes, manager facade main logic, Goal Loop, ToolPolicyGate, human gates,
  reference projects, or actual scheduler loop / parallel executor behavior.

## Current Status

Completed.

## Verification

- `rg -n "requires the latest" src/workflow-scheduler` - confirmed the scoped
  latest checks are represented by scheduler guard calls after implementation.
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` - passed; 1
  file, 36 tests.
- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/web-workflow-actions.test.ts tests/unit/scheduler-run-completion.test.ts tests/unit/scheduler-run-closeout.test.ts tests/unit/scheduler-loop-snapshot.test.ts tests/unit/scheduler-integration-outcome.test.ts tests/unit/scheduler-execution-mode.test.ts` - passed; 7 files, 38 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm run test:fast` - passed; 29 files, 339 tests.
- `npm run test:integration` - passed; 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - initial 20s run timed out; rerun with longer timeout passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan self-review by subagent
  `019ede54-9892-7311-82fa-349ff6f7039c` returned PASS with no required
  fixes. Close-ready review by subagent
  `019ede5c-1ae0-7f00-a529-c80e978d4121` returned PASS with no blocking
  findings.
- Retries or environment failures: `scripts/lint-encoding.ps1` timed out once
  with a 20s command timeout; rerun with a longer timeout passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff only; no durable rule expansion
  planned.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
