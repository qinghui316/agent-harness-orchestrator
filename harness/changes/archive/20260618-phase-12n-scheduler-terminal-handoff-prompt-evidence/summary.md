# Phase 12N Scheduler Terminal Handoff Prompt Evidence

## Purpose

Expose terminal SchedulerRun handoff evidence to the main-Agent prompt/context replay after it is already visible in the Workpad as read-only terminal evidence.

The change keeps terminal completion and blocked/exhausted closeout evidence non-executing. It lets `chat.ask` and `orchestrator.plan` explain the terminal scheduler posture from compact prompt evidence, while all apply, close, merge, scheduler loop, full-executor, and Harness evolution transitions remain separate human-gated workflow paths.

## Scope

In scope:

- Add compact main-Agent prompt/context evidence for matching SchedulerRun terminal completion and blocked closeout summaries.
- Reuse Workpad projection parity from `src/workbench/codex-chat/goal-loop-context.ts`; do not re-read scheduler-runtime artifacts for prompt evidence.
- Add prompt-stack and `context.prepared` evidence fields that contain only compact ids/status/counts/reason/artifact and false-authority flags.
- Cover chat and orchestrator prompt artifacts with deterministic unit tests.

Out of scope:

- Scheduler loop runtime, full parallel executor, worker auto-start, whole-wave dispatch, slot allocation, child Change creation, source mutation, apply, close, merge, remote landing, or Harness evolution automation.
- Changes to GoalLoopDecision, iteration, continuation brief, next-step packet, controller policy, or gate-readiness preflight schemas.
- Copying full scheduler-loop snapshots, markdown, recommended action scopes, worktree id arrays, action payloads, or approval ids into compact prompt evidence.
- Standalone stale documentation cleanup.

## Current Status

Completed.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- --run tests/unit/workbench.test.ts -t 'keeps scheduler terminal handoff prompt evidence compact'` passed.
- `npm run test -- --run tests/unit/workbench.test.ts -t 'records discarded SchedulerRun completion'` passed.
- `npm run test -- --run tests/unit/workbench.test.ts -t 'carries a second scheduler worker through current-worker gates'` passed.
- `npm run test:workbench -- --minWorkers=1 --maxWorkers=4` passed, 110 tests; first run hit the local tool timeout at 7 minutes, the rerun with a longer timeout passed.
- `npm run test:fast` passed.
- `npm run test:integration` passed.
- `npm run build` passed.
- `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check` passed.

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

- Documentation entropy check: active/close handoff only; this phase updated `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` with the smallest current-state delta and leaves detailed history in this archived summary plus `harness/changes/INDEX.json`.
- Experience lifecycle result: not applicable; this is a product runtime-context change, not Harness auto-evolution.
- Roadmap/current-direction stale language check: close handoff updated to post-Phase-12N baseline.
- Old experience retained / merged / retired / archive-only: not applicable.

