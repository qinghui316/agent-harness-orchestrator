# main-agent-orchestration-old-pipeline-removal-v1

## Purpose

Move the main coding workflow control out of the old monolithic
`runCodeValidateAuditSequence` implementation and into a dedicated
`main-agent-orchestration` owner.

This is an architecture migration, not a UI change and not an algorithm
expansion. V1 preserves current behavior: coder, validator, auditor, and at
most one rework attempt. The important change is ownership: the new owner
observes state, decides the next leaf, runs one leaf stage, records evidence,
and observes again. The old export may remain only as a compatibility facade.

## Scope

In scope:

- Add `src/main-agent-orchestration/` as the main workflow controller owner.
- Extract one-role leaf stage functions for coder, validator, auditor, and
  rework coder.
- Change `runMainAgentToolOrchestration` to call the new owner rather than the
  old full-sequence runner.
- Keep `runCodeValidateAuditSequence` as a thin compatibility facade for old
  callers such as task-run sequence and refresh rework paths.
- Preserve existing ToolPolicyGate, RoleDispatcher, AgentTask lifecycle, run
  artifacts, boundary audit, maintenance ledger, live events, and result shapes.
- Add boundary/regression tests proving no new UI/action/permission path is
  introduced.

Out of scope:

- Free-form main-agent planning, parallel workers, scheduler waves, journal
  recovery, ordinary Agent mode, Open Dynamic Workflows runtime, UI changes,
  new action types, changed action revalidation, or expanded automation
  allowlist.

## Current Status

Completed.

## Verification

- `npm run typecheck`
- `npx vitest run tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly required removing old
  full-sequence ownership instead of decorating the old pipeline.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable unless Workbench UI is
  touched.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; this change updates active handoff
  only and keeps implementation details in the archive.
- Experience lifecycle result: architecture migration.
- Roadmap/current-direction stale language check: current roadmap already points
  to phased main-agent continuous orchestration; this change implements only the
  first internal controller migration slice.
- Old experience retained / merged / retired / archive-only: the old facade is
  temporary compatibility only; full-stage control moves to the new owner.
