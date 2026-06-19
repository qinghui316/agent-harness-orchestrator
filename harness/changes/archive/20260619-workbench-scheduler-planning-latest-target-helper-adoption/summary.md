# Workbench Scheduler Planning Latest Target Helper Adoption

## Purpose

Reuse the existing Workbench action latest-target assertion for repeated
scheduler planning-chain latest checks in `src/workbench/actions/boundary.ts`.
This continues the gate/action target revalidation convergence without changing
Scheduler, Goal Loop, ToolPolicyGate, human-gate, or Workbench UI behavior.

## Scope

In scope:

- Replace manual `latest.id !== target.id` checks with
  `assertLatestWorkbenchActionTarget` where the error wording and semantics are
  identical.
- Limit adoption to `planning.scheduler.worker-plan.compile`,
  `planning.scheduler.launch-preflight.check`, and
  `planning.scheduler.run.prepare` latest-target checks.
- Add targeted boundary tests proving the action boundary uses the shared helper
  and the helper owner stays pure.

Out of scope:

- `planning.scheduler.plan.prepare` snapshot/reservation "latest" checks, which
  are runtime-state field comparisons rather than latest target id comparisons.
- `planning.scheduler.run.complete`, because this slice avoids terminal-run
  completion semantics and IntegrationOutcome checks.
- Stale, lineage, status, ToolPolicyGate, human gate, Goal Loop, scheduler
  execution, Workbench UI/projection, manager facade, or reference-project changes.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed; 3 files, 49 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm run test:fast` - first run had one non-reproduced `web-app.test.tsx` `agent-run-graph` query failure; the failing test passed when run directly, and a full retry passed; 29 files, 339 tests.
- `npm run test:integration` - passed; 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan self-review by subagent
  `019ede48-44c3-7120-b5e2-5560bb7fc643` returned PASS with no required fixes.
  Close-ready review by subagent `019ede4f-c1fb-7700-b337-798097312aac`
  returned PASS with no blocking findings.
- Retries or environment failures: `npm run test:fast` initially failed one
  unrelated `web-app.test.tsx` assertion looking for `agent-run-graph`; the
  specific failing test passed on direct rerun and the full `test:fast` retry
  passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
