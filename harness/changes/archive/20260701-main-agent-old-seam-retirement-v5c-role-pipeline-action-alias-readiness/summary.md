# main-agent-old-seam-retirement-v5c-role-pipeline-action-alias-readiness

## Purpose

Continue main-agent old seam retirement by proving the remaining
`role.pipeline.*` action ids are legacy inbound compatibility aliases only.
`main-agent.execution.*` remains the canonical public action id family.

This is a readiness and boundary-hardening change. It does not remove
`role.pipeline.*` yet; it records the consumer inventory and adds tests that
prevent new UI/server/generated outbound payloads from reintroducing legacy ids.

## Scope

In scope:

- Classify remaining `role.pipeline.*` consumers as canonical-only,
  legacy inbound compatibility, test-only, or docs/archive-only.
- Strengthen boundary tests so literal legacy ids can appear only in the
  registry, normalizer, handler alias map, and compatibility tests.
- Verify labels, summaries, thread-stream labels, and stop conflict bypass use
  main-agent execution helpers rather than direct legacy string checks.
- Verify new generated Workbench action payloads use `main-agent.execution.*`
  and not `role.pipeline.*`.
- Keep legacy inbound routing working for compatibility.

Out of scope:

- Deleting `role.pipeline.*` action ids.
- Deleting `MainAgentLoopProjection`.
- Deleting internal demand-worker `rolePipeline: result`.
- Changing the `mainAgentExecution` DTO shape.
- Changing confirmationQueue, ToolPolicyGate, automation allowlists, Scheduler,
  IntegrationCheck, apply/close, remote, PR, merge, or Harness evolution
  authority.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-action-results.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed; Vite reported the existing chunk-size warning.
- Harness checks: `lint-ecl`, `lint-encoding`, and `harness-change reindex`
  passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Chandrasekhar approved the
  plan and requested explicit separation of literal legacy strings from helper
  compatibility, plus a generated-outbound-only interpretation of the legacy
  payload ban.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: updated `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` with active V5c handoff state.
- Experience lifecycle result: retained `role.pipeline.*` as inbound
  compatibility for V5c; canonical `main-agent.execution.*` remains the
  outbound/public family.
- Roadmap/current-direction stale language check: V5c is recorded as the active
  old-seam retirement readiness slice.
- Old experience retained / merged / retired / archive-only: legacy action ids
  retained as inbound compatibility; generated outbound legacy use is blocked
  by tests.

