# main-agent-strategy-policy-v2b-bounded-advice-consumption

## Purpose

Allow bounded LLM strategy advice to influence the internal
`MainAgentStrategyDecision` only inside a strict evidence envelope. V2b keeps
the deterministic baseline visible and preserves Harness authority: advice is
not a controller, not a gate, not an action payload, and not automation
authorization.

## Scope

In scope:

- Add advice consumption metadata and final-kind provenance to strategy
  decisions.
- Let safe advice narrow ambiguous/read-only strategy posture to direct,
  pipeline, clarify, blocked, or complete when current evidence permits.
- Reject advice that tries to create parallel Scheduler readiness, override
  stale/blocked evidence, or imply executable actions.
- Preserve existing stepwise and full-access execution boundaries.

Out of scope:

- Calling an LLM from runtime code.
- Adding UI, action types, confirmation queue behavior, Scheduler /
  IntegrationCheck execution, apply/close, remote, PR, merge, or Harness
  evolution authority.
- Expanding scoped automation allowlists or treating advice as workflow truth.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-strategy-consumption.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npx vitest run tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-strategy-consumption.test.ts tests/unit/main-agent-resume-continuation.test.ts tests/unit/automation-runtime.test.ts tests/unit/goal-loop-runtime.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed with existing Vite chunk size warning.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

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

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

