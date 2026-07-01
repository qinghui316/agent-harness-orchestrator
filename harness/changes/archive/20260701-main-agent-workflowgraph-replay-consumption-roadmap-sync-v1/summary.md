# main-agent-workflowgraph-replay-consumption-roadmap-sync-v1

## Purpose

Connect the existing read-only `MainAgentWorkflowGraphReplaySummary` builder to production WorkflowGraph observation points and update the main-agent roadmap to match the current architecture migration state.

This is an architecture migration slice only. Replay summaries remain in-memory read models and `nextObservation` remains a non-executing observation recommendation, not an action, confirmation, scheduler transition, prompt context, UI surface, or workflow truth.

## Scope

In scope:

- Add a main-agent owner helper that records WorkflowGraph observation evidence and then builds a replay summary.
- Use that helper after planning milestones and TaskQueue lifecycle terminal observation.
- Keep replay summary output internal and non-persistent.
- Update current roadmap / handoff documentation drift for the main-agent migration state.
- Add tests proving the helper is read-only and does not trigger queue/action/scheduler side effects.

Out of scope:

- Workbench UI, transcript, right rail, Agent graph, confirmation card, or prompt-context changes.
- Action bridge expansion, confirmationQueue changes, workflow action registry changes, action revalidation changes, or automation allowlist changes.
- Scheduler, WorkerLease, IntegrationCheck, Terminal, apply, close, remote, PR, merge, or Harness evolution execution.
- Treating replay summary, policy recommendation, ODWF journal, or Codex Goal as workflow truth.

## Current Status

Ready to close.

Implemented a main-agent replay consumption helper, routed planning milestones and TaskQueue terminal observation through it, updated roadmap / handoff docs, and added unit / boundary coverage proving replay remains read-only and non-executing.

## Verification

- `npx vitest run tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npm run typecheck`
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
- Extra prompts or reviewer instructions: subagent Plato reviewed the plan and recommended three changes: expand doc sync to current handoff drift, encapsulate record+replay in a main-agent owner helper, and add side-effect tests for production consumption points.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; this change updates roadmap/current-state handoff wording.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: updated `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/STATUS.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
