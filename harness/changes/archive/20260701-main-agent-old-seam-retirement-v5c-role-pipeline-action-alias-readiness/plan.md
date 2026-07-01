# Plan: main-agent-old-seam-retirement-v5c-role-pipeline-action-alias-readiness

## Implementation

1. Record the current alias inventory in the active change:
   - canonical-only: `main-agent.execution.*` outbound payloads and user-facing
     labels.
   - legacy inbound compatibility: registry entries, normalizer aliases, and
     handler alias map.
   - test-only: compatibility and boundary assertions.
   - docs/archive-only: historical roadmap and archived summaries.
2. Strengthen module-boundary tests:
   - literal `role.pipeline.*` is allowed only in the registry, normalizer,
     handler alias map, and tests.
   - helper consumers such as labels, summaries, thread-stream labels, and
     stop conflict bypass must use main-agent execution helpers, not direct
     legacy string comparisons.
   - generated outbound payloads must not contain `role.pipeline.*`.
3. Preserve runtime compatibility:
   - canonical and legacy action ids must still normalize to the same canonical
     ids.
   - canonical and legacy actions must route to the same handlers.
   - stop actions from both families must bypass in-flight workflow conflict.
4. Update current handoff docs only enough to mark V5c as the active slice.
5. Close with targeted tests, standard product gates, and Harness checks.

## Inventory Result Target

- Current V5c inventory:
  - `canonical-only`: new outbound Workbench action payloads and user-visible
    labels use `main-agent.execution.*` plus helper-normalized copy.
  - `legacy inbound compatibility`: `src/workflow-actions/registry.ts`,
    `src/workflow-actions/main-agent-execution.ts`, and
    `src/workbench/actions/handlers/index.ts` retain literal
    `role.pipeline.*`.
  - `helper-based compatibility`: labels, summaries, thread-stream labels,
    and stop conflict bypass consume `normalizeMainAgentExecutionAction()` or
    `isMainAgentExecutionStopAction()` and must not directly branch on legacy
    strings.
  - `test-only`: compatibility and boundary assertions may mention literal
    `role.pipeline.*`.
  - `docs/archive-only`: historical roadmap and archived summaries may mention
    old seam names as history.
- If V5c proves no durable inbound compatibility risk, V5d may remove legacy
  registry/handler aliases.
- If historical payload or live-gate compatibility remains plausible, V5d
  should keep `role.pipeline.*` as permanent inbound-only compatibility and
  preserve negative tests against generated outbound use.

## Boundaries

- Do not remove `role.pipeline.*` in V5c.
- Do not remove `MainAgentLoopProjection`.
- Do not remove internal demand-worker `rolePipeline: result`.
- Do not change `mainAgentExecution` DTO shape.
- Do not alter confirmationQueue, ToolPolicyGate, automation allowlists,
  Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or Harness
  evolution authority.
