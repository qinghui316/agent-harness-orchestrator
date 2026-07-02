# Plan: main-agent-llm-strategy-advice-production-goal-acceptance-v1

## Approach

Reuse the existing strategy policy and automation gates. Add a narrow
current-run advice extraction/stripping helper for main-Agent run output, then
thread the parsed advice explicitly into the policy call for that same run.
Do not add a new runner or persistent advice ledger.

## Steps

1. Add a main-agent strategy advice prompt section and parser/strip helper.
2. Thread current-run advice through `chat.ask` / `orchestrator.plan` run
   artifacts without putting it into visible transcript text or worker context.
3. Add an explicit policy call path that accepts current-run advice while
   keeping replay default behavior historical-advice-free.
4. Harden strategy consumption to require `modeCompatibility.fullAccess`
   before full-access scoped automation.
5. Add unit/boundary tests for advice parsing, invisibility, policy
   consumption, execution-mode boundaries, and Goal-style scoped automation
   acceptance.
6. Update handoff docs, run verification, close, and commit immediately.

## Decisions

- Advice is current-run metadata only, not replay truth.
- The replay builder remains deterministic unless advice is explicitly passed
  by the caller for the current run.
- No full-access path may use advice unless mode compatibility, current gate,
  target freshness, existing allowlist, revalidation, and action owner all
  agree.
- Goal-style loop acceptance tests existing `runScopedAutomation` behavior; it
  does not create a new loop runner.

## Minimality Gate Plan

- Can this be a no-op: no; V2b consumes injected advice but no real
  main-Agent run path produces and strips advice yet.
- Reuse: existing strategy advice schema, decision policy, strategy
  consumption, scoped automation runner, current-gate revalidation, and
  ToolPolicy/high-impact audit.
- Shared root fix: keep advice production in main-Agent run output handling and
  keep execution control in existing automation/action owners.
- Avoided: no new controller, runner, durable strategy JSONL, UI, action type,
  Scheduler path, or allowlist.
- Smallest coherent change: parse current-run advice and pass it one-shot into
  the existing policy.

## Module Boundary Plan

- Owner module: main-agent orchestration policy remains the strategy owner;
  codex-chat run handling owns current-run output parsing/stripping.
- New / moved responsibilities: current-run strategy advice extraction and
  invisibility; full-access mode compatibility check.
- Facade touch points: main-agent orchestration exports only bounded helper
  types/functions needed by tests and current-run callers.
- Forbidden write-back locations: Workbench UI, confirmationQueue, worker
  role packets, delegate manifests, scheduler worker context, automation
  allowlists, Scheduler / IntegrationCheck executors, terminal, apply/close.
- Compatibility surface: callers without advice keep deterministic behavior.
- Boundary tests: module grep for no advice in worker/action/UI paths and no
  automation allowlist changes.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: strategy advice validation,
  strategy decision policy, strategy consumption, scoped automation, current
  gate revalidation, Goal Loop local coordinator, ToolPolicy/high-impact audit.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  broad new mechanism is proposed; only current-run extraction glue is needed.
- Domain-specific logic location: `main-agent-orchestration` policy and
  `workbench/codex-chat` run-output handling.
- Shared cross-cutting logic location: none added.
- Local framework / state machine / projection / validation / gate avoided: no
  new gate, ledger, runner, or workflow state machine.
- Future-cost reduction for similar features: future LLM strategy work can use
  one bounded current-run advice path instead of adding another controller.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

