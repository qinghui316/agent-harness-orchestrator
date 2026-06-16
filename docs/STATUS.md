# Project Status

## Current Handoff

- Current date: 2026-06-16.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260616-phase-10w-goal-loop-assisted-concrete-gate-confirmation/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260615-harness-self-evolution-slimming-rule-tuning/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260616-auto-evolve-harness-phase-10r-10v-goal-loop-gate-evidence/summary.md`.
- Active product phase: none. Active Harness evolution phase: none.

This file is the short resume point. No active change is open. For full history, use `harness/changes/INDEX.json` and archived `summary.md` files.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`.

## Recent Completed Work

### Phase 10W Goal Loop Assisted Concrete Gate Confirmation

Archived at `harness/changes/archive/20260616-phase-10w-goal-loop-assisted-concrete-gate-confirmation/summary.md`.

Phase 10W connects `GoalLoopGateReadinessPreflight` to the concrete Workbench confirmation path without adding a Goal Loop wrapper executor. Matching concrete actions can carry `goalLoopGateReadinessPreflightId` as additional evidence, while the concrete action type remains the stale-target, ToolPolicyGate, handler, decision/audit, and human-gated transition path.

### Auto Evolve Harness Phase 10R-10V Goal Loop Gate Evidence

Archived at `harness/changes/archive/20260616-auto-evolve-harness-phase-10r-10v-goal-loop-gate-evidence/summary.md`.

The pending Phase 10R-10V Goal Loop controller/gate evidence window was handled as `noop/subagent_review` with subagent scores 88/100 and 90/100. Existing Goal Loop Boundary, Module Boundary, Runtime/Proposal Boundary, ToolPolicy/human gate, workflow-truth, and documentation entropy rules were sufficient; no new Harness rule was added.

### Phase 10V Goal Loop Concrete Gate Readiness Preflight

Archived at `harness/changes/archive/20260616-phase-10v-goal-loop-concrete-gate-readiness-preflight/summary.md`.

Phase 10V adds `GoalLoopGateReadinessPreflight` as non-executing evidence that the latest Goal Loop packet, controller policy, and current concrete Workbench gate still match before a future concrete gate invocation phase. It adds a secondary readiness action only; it does not invoke the concrete gate, authorize ToolPolicy, mutate source, create workers/runs/worktrees, or replace the separate human-gated confirmation.

### Phase 10U Goal Loop Guided Gate Handoff Acceptance

Archived at `harness/changes/archive/20260616-phase-10u-goal-loop-guided-gate-handoff-acceptance/summary.md`.

Phase 10U hardens the main-Agent prompt handoff from fresh Goal Loop controller policy to the current concrete Harness gate. Fresh `chat.ask` and `orchestrator.plan` prompt artifacts now include a guided concrete gate handoff with action type and scoped target ids only while Workpad-visible controller policy evidence is current. The handoff is non-executing prompt/audit evidence only; it does not add actions, routes, UI controls, scheduler execution, source mutation, child Changes, or workflow-truth authority.

### Harness Self Evolution Slimming Rule Tuning

Archived at `harness/changes/archive/20260615-harness-self-evolution-slimming-rule-tuning/summary.md`.

This change strengthens Harness self-evolution slimming rules without adding product runtime behavior. It adds roadmap/current-direction stale-language checks to ECL and templates, historicalizes the old Phase 7F/7H current-state wording in `docs/AGENT-DEVELOPMENT-OS.md`, and updates the `ecl-harness-engineer` skill recommendation document.

### Harness Doc Entropy And Experience Lifecycle

Archived at `harness/changes/archive/20260615-harness-doc-entropy-and-experience-lifecycle/summary.md`.

This change compressed the current handoff documents and added Harness rules/templates so future self-evolution can both summarize new experience and retire stale or archive-only experience. It does not change product runtime behavior, Workbench actions, CLI actions, schemas, source execution paths, or the user-local `ecl-harness-engineer` skill.

### Phase 10T Goal Loop Controller Policy Runtime Prompt Evidence Acceptance

Archived at `harness/changes/archive/20260615-phase-10t-goal-loop-controller-policy-runtime-prompt-evidence-acceptance/summary.md`.

Phase 10T verifies that actual `chat.ask` and `orchestrator.plan` run artifacts include controller policy prompt context only when the Workpad-visible packet/policy match the selected Change, and that stale or mismatched policy evidence stays out of prompt stack and context. It is acceptance hardening only; it does not add actions, routes, CLI commands, UI controls, worker prompts, scheduler/runtime execution, source mutation, child Changes, or workflow-truth authority.

### Phase 10S Goal Loop Controller Policy Main Agent Context Boundary

Archived at `harness/changes/archive/20260615-phase-10s-goal-loop-controller-policy-main-agent-context-boundary/summary.md`.

Phase 10S connects latest valid `GoalLoopControllerPolicy` evidence into main-Agent prompt context so the main Agent can see controller verdict, gate status, and summary while still requiring the concrete scoped Harness gate, ToolPolicyGate, and human confirmation for any transition.

### Auto Evolve Harness Phase 10P-10T Goal Loop Controller Evidence

Archived at `harness/changes/archive/20260615-auto-evolve-harness-phase-10p-10t-goal-loop-controller-evidence/summary.md`.

The pending Phase 10P-10T Goal Loop controller/feedback/context/prompt evidence window was handled as `noop/subagent_review` with subagent score `92/100`. Existing Goal Loop Boundary, Runtime Bridge Boundary, Module Boundary, ToolPolicy/human gate, and workflow-truth rules were sufficient.

## Current Baseline

- User-facing product model: project folders contain demand conversations.
- Internal workflow model: each demand conversation binds to Change/Workpad/Topic state, role pipeline evidence, validation/audit, result review, apply/close records, and later landing/remote handoff evidence.
- `planning-agent` and `coder-agent` may use Codex app-server when available; `codex exec` fallback remains valid and must be labeled honestly.
- Validator and auditor remain independent evidence runners.
- Workbench conversation rendering centers on user-visible parent-agent/Codex runtime transcript cells; AHO orchestration, evidence, maintenance, policy, and boundary records stay in graph/detail/confirmation/evidence surfaces unless literally surfaced in the main transcript.
- Goal Loop evidence is non-executing. GoalLoopDecision, GoalLoopIteration, continuation brief, next-step packet, feedback evidence, controller policy, and gate-readiness preflight can explain continuation posture or recommend existing Harness gates, but cannot execute, mutate source, bypass ToolPolicyGate/human gates, or become workflow truth.
- Phase 10V adds non-executing Goal Loop gate-readiness preflight evidence for a fresh packet / controller policy / current concrete gate match. It can record that the concrete gate is ready to present, but it cannot invoke the gate, authorize ToolPolicy, start workers, mutate source, or replace the separate human-gated confirmation.
- Phase 10W allows a matching concrete confirmation to carry the preflight id as evidence. The executable path remains the concrete action and its existing stale revalidation, ToolPolicyGate, handler, decision/audit, and human gate.
- Scheduler runtime remains staged and bounded. Existing scheduler worker/result/validation/audit/rework/integration/completion gates do not authorize scheduler loops, whole-wave dispatch, slot allocation, automatic child Changes, automatic apply/merge, or a full parallel executor.
- Documentation entropy is now an explicit Harness concern: `AGENTS.md` is the routing map, `docs/STATUS.md` is the short handoff, `docs/ECL.md` owns reusable process rules, and archived summaries / `harness/changes/INDEX.json` own history.

## Next Resume Point

No active change is open. The next structured product change should continue from `docs/CURRENT-DEVELOPMENT-PLAN.md`: either keep Goal Loop work non-executing and concrete-gate-bound, or choose the next scheduler/parallel slice explicitly without implying a full scheduler loop.

## Verification Commands

Harness checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product checks:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

Documentation entropy checks for docs/Harness changes:

```powershell
(Get-Content -LiteralPath AGENTS.md -Encoding UTF8).Count
(Get-Content -LiteralPath docs/STATUS.md -Encoding UTF8).Count
rg "harness/changes/active/" AGENTS.md docs/STATUS.md
rg "Latest Harness evolution|Pending Harness evolution|Current active phase|Active ECL change" AGENTS.md docs/STATUS.md
```

## History Index

- Full generated index: `harness/changes/INDEX.json`
- Archive summaries: `harness/changes/archive/*/summary.md`
- Evolution proposals and results: `harness/evolution/proposals/`, `harness/evolution/results.tsv`
