# main-agent-old-seam-retirement-v5d-inbound-only-action-alias-finalization

## Purpose

Finalize the `role.pipeline.*` action alias seam as permanent inbound-only
compatibility while keeping `main-agent.execution.*` as the canonical public
main-agent execution action family.

This closes the V5c uncertainty without breaking historical thread, gate, or
decision records. Legacy inbound requests remain executable and may keep their
original `request.actionType` in historical echoes. New generated Workbench,
server, and current-gate payloads must remain canonical.

## Scope

In scope:

- Keep legacy action ids in registry/live sets and handler alias maps as
  inbound compatibility only.
- Remove or restrict production access to `toLegacyMainAgentExecutionAction`
  so new code cannot use it to generate legacy outbound payloads.
- Strengthen tests for canonical outbound payloads, legacy inbound echoes,
  high-impact/revalidated exclusions, stop conflict bypass, and helper-based
  labels/summaries.
- Update handoff docs and archived closeout evidence.

Out of scope:

- Deleting `role.pipeline.*` registry or handler aliases.
- Deleting `MainAgentLoopProjection`.
- Deleting internal demand-worker `rolePipeline: result`.
- Changing `mainAgentExecution` DTO shape.
- Changing confirmationQueue, ToolPolicyGate, automation allowlist, Scheduler,
  IntegrationCheck, apply/close, remote, PR, merge, or Harness evolution.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-action-results.test.ts tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed with the existing Vite chunk-size warning.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` created `harness/evolution/pending.md` after V5d close, as expected at the archive threshold.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` passed after close with active change none and STATUS aligned.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: update only current handoff pointers and V5d
  next-step wording; keep detailed rationale in this archive.
- Experience lifecycle result: retain legacy inbound compatibility; do not
  promote a new process rule.
- Roadmap/current-direction stale language check: completed after close; handoff docs now point to the V5d archive and pending Harness evolution.
- Old experience retained / merged / retired / archive-only: V5c readiness
  evidence is retained as archive-only; V5d decision becomes current handoff.
