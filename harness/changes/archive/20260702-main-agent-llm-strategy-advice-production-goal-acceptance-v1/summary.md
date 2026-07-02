# main-agent-llm-strategy-advice-production-goal-acceptance-v1

## Purpose

Connect bounded `MainAgentStrategyAdvice` to real main-Agent run output without
turning LLM advice into a controller, gate, workflow truth, or automation
authority. The advice is current-run metadata that can be consumed by the V2b
strategy policy only inside the existing evidence envelope.

This change also adds Goal-style acceptance coverage for the existing
full-access loop: after plan confirmation, scoped automation may continue only
through current visible Harness gates and must stop at complete, blocked,
stale, no-progress, or human-only gates.

## Scope

In scope:

- Prompt contracts for bounded strategy advice in main-agent chat/orchestrator
  runs.
- Parser and stripping path that keeps strategy advice out of user-visible
  transcript, plan, and live text.
- One-shot policy consumption for current-run advice only.
- Strategy-consumption hardening so `modeCompatibility.fullAccess` cannot be
  bypassed by advice.
- Unit and boundary tests for advice production, consumption, and full-access
  Goal-style loop acceptance.

Out of scope:

- Runtime LLM as a new controller.
- New action type, runner, ledger, JSONL strategy store, UI, confirmation
  queue behavior, Scheduler / IntegrationCheck authority, apply/close,
  remote, PR, merge, or Harness evolution authority.
- Reading latest historical advice from replay as workflow truth.
- Raw parallel executor or expanded full-access allowlist.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/main-agent-strategy-advice-runtime.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-strategy-consumption.test.ts tests/unit/automation-runtime.test.ts tests/unit/goal-loop-runtime.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after active handoff alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed.

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

- Documentation entropy check: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/BOUNDARIES.md` updated for active handoff and strategy advice boundary.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

