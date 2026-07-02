# main-agent-strategy-policy-v2a-stale-first-readonly-advice

## Purpose

Fix the V1c resume-consumption fail-closed ordering and add a bounded
read-only `MainAgentStrategyAdvice` contract. The advice is an explanation /
candidate evidence shape only; it must not alter the deterministic
`MainAgentStrategyDecision`, scoped automation compatibility, or Harness
authority in this slice.

## Scope

In scope:

- Make resume consumption stale-first so cross-Change, stale-target,
  stale/key/scope mismatch, and unsafe strategy gaps cannot be hidden behind
  request-approval explanation or generic stop states.
- Add strict read-only strategy advice validation and ignored/advisory metadata.
- Attach bounded advice metadata only where it cannot drive execution.
- Document the LLM strategy advice boundary.

Out of scope:

- Calling an LLM to make strategy decisions.
- Letting advice change `strategyDecision.kind`, `modeCompatibility`, scoped
  automation eligibility, confirmation queue ordering, action payloads, or
  Harness authority.
- UI, Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or Harness
  evolution changes.

## Current Status

Ready to close.

Implemented stale-first resume consumption precedence and added a bounded
read-only `MainAgentStrategyAdvice` contract. Advice can be attached to the
deterministic strategy result for inspection, but V2a does not let advice
change strategy kind, execution mode compatibility, scoped automation
eligibility, or any Harness authority.

## Verification

- `npx vitest run tests/unit/main-agent-strategy-consumption.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npx vitest run tests/unit/main-agent-strategy-consumption.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-resume-continuation.test.ts tests/unit/automation-runtime.test.ts tests/unit/goal-loop-runtime.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:workbench` - passed.

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

- Documentation entropy check: applicable; current handoff docs and
  `docs/BOUNDARIES.md` were updated for this active slice and read-only advice
  authority boundary.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active slice language points
  to V2a and preserves V2b as future consumption work.
- Old experience retained / merged / retired / archive-only: not applicable.

