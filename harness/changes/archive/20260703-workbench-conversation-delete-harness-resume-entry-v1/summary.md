# workbench-conversation-delete-harness-resume-entry-v1

## Purpose

Add test-stage deletion for Workbench conversation records without deleting or closing the underlying Harness Change. Users can remove a conversation from the left sidebar, and Workbench message/transcript state for that conversation may be deleted, while workflow progress remains recoverable from Harness evidence.

This aligns the product model with AHO truth boundaries: chat history is UI/runtime state; Change docs, workflow evidence, runs, validation/audit, ResumePoint, and current gates remain authoritative for workflow progress.

## Scope

In scope:

- Allow deleting active and archived Workbench conversations from the sidebar.
- Remove the archived-only sidebar restriction and the "处理完成后才能移出侧栏" disabled menu.
- Preserve Harness Change directories and all workflow evidence when deleting a conversation.
- Keep deleted active Changes addressable through a project-level active-work resume entry.
- Ensure resume/main-agent context for a deleted conversation uses Harness evidence instead of deleted transcript.
- Update Workbench/RUNTIME/BOUNDARIES docs for the conversation-delete boundary.

Out of scope:

- No close / abandon / cancel Change UI or lifecycle transition.
- No deletion of Change docs, workflow evidence, run artifacts, validation/audit, Scheduler, IntegrationCheck, ResumePoint, source files, or Codex session storage.
- No new automation permission, action type, ToolPolicyGate behavior, apply/close behavior, or scheduler behavior.

## Current Status

Completed.

## Verification

Passed:

Targeted:

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts`

Standard:

- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`

Notes:

- `npm run build` emitted the existing Vite large chunk warning.
- Initial `lint-ecl` before closeout failed because handoff docs and task status had not yet been updated; closeout updates address that expected active-change drift.

Harness:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

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

- Documentation entropy check: applicable; this change updates current product boundary docs.
- Experience lifecycle result: delete old archived-only conversation-hide UX for test-stage Workbench conversations; retain Harness Change lifecycle gates unchanged.
- Roadmap/current-direction stale language check: docs/WORKBENCH.md, docs/RUNTIME.md, and docs/BOUNDARIES.md updated for the conversation-delete boundary.
- Old experience retained / merged / retired / archive-only: archived-only sidebar hide restriction retired.
