# Spec: main-agent-llm-strategy-advice-production-goal-acceptance-v1

## Goal

Let the main Agent produce bounded strategy advice during real `chat.ask` and
`orchestrator.plan` runs, parse that advice as current-run metadata, and pass
it one-shot into the existing V2b strategy policy without exposing it to users
or expanding execution authority.

## Users

- AHO users running Harness-mode request-approval or full-access workflows.
- Future main-agent policy work that needs real LLM strategy judgment while
  preserving Harness gates.

## Acceptance Criteria

- AC-001: Main-agent prompt context asks for bounded strategy advice with only
  `kind`, `reason`, `confidence`, and `evidenceRefs`; forbidden executable
  fields are rejected.
- AC-002: Advice is parsed from current-run output and stripped from assistant
  text, plan cards, suggested actions, transcript blocks, and live-visible
  deltas.
- AC-003: Advice is passed one-shot to
  `evaluateMainAgentWorkflowGraphReplayPolicy(..., { strategyAdviceInput })`
  for the current run only; replay does not read latest historical advice.
- AC-004: `assessMainAgentStrategyConsumption(...)` requires both final
  strategy eligibility and
  `strategyDecision.modeCompatibility.fullAccess ===
  "eligible-for-existing-scoped-automation"` before allowing full-access.
- AC-005: Request-approval remains explain/wait only; full-access still uses
  current visible gate, target freshness, existing allowlists, revalidation,
  ToolPolicy/high-impact checks, and action owners.
- AC-006: Goal-style full-access acceptance proves the existing loop stops at
  complete, blocked, stale, no primary gate, no progress, source/artifact drift,
  handler failure, max-steps, or human-only gates.
- AC-007: Advice never enters Workbench UI, worker `RoleContextPacket`,
  delegate manifests, scheduler worker context, confirmation queue, action
  payloads, automation allowlists, Scheduler / IntegrationCheck, apply/close,
  remote, PR, merge, or Harness evolution paths.

## Non-Goals

- New workflow runtime, runner, action type, strategy JSONL, UI surface, or
  durable advice truth.
- Any expansion of scoped automation allowlists.
- Raw Scheduler, whole-wave dispatch, manual IntegrationCheck automation,
  integration apply/discard automation, remote/PR/merge, or Harness evolution
  automation.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, current visible
  gates, ToolPolicyGate, validation/audit, confirmationQueue, and apply/close
  records.
- ODWF is a workflow-shape and journal/resume reference only; AHO does not
  import or execute ODWF runtime.
- Advice is same-run and same-Change metadata. It must not be replay truth or
  worker instruction.

## Risks

- Advice may leak to visible transcript if the parser strips only persisted
  final text and not live deltas.
- Advice may accidentally bypass human-gated policy unless
  `modeCompatibility.fullAccess` is checked.
- Reading latest historical advice from replay would make stale LLM output look
  authoritative.

