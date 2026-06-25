# Project Status

## Current Handoff

- Current date: 2026-06-25.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product audit: `harness/changes/archive/20260625-workbench-goal-loop-decision-surface-audit-v1/summary.md`.
- Latest archived product change: `harness/changes/archive/20260625-workbench-post-plan-scoped-local-autonomy-v1/summary.md`.
- Previous post-plan automation hardening: `harness/changes/archive/20260625-workbench-post-plan-scoped-automation-execution-v1/summary.md`.
- Previous planning/decomposition hardening: `harness/changes/archive/20260625-workbench-planning-decomposition-scope-honesty-v1/summary.md`.
- Previous external-local restore change: `harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
- Latest archived Harness docs change: `harness/changes/archive/20260625-document-minimality-gate-and-complexity-review/summary.md`.
- Previous scheduler integration apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.
- Latest real UI continuation scout: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest completed Harness evolution: `harness/changes/archive/20260625-auto-evolve-post-goal-loop-decision-surface-window/summary.md`.
- Latest scheduler reachability change: `harness/changes/archive/20260625-workbench-low-conflict-taskgraph-scheduler-reachability-v1/summary.md`.
- Latest scheduler worker/integration acceptance: `harness/changes/archive/20260625-workbench-scheduler-worker-integration-real-acceptance-v1/summary.md`.
- Latest scheduler IntegrationCheck acceptance: `harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
- Latest scheduler integration apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.

The latest archived product audit is at
`harness/changes/archive/20260625-workbench-goal-loop-decision-surface-audit-v1/summary.md`.
It verified the existing Goal Loop decision surface without adding product code:
Goal Loop evidence remains explanation/assisted-gate context over the
authoritative Workbench `confirmationQueue.primary`, and it does not become a
new decision engine or execution authority.

The latest archived product change is at
`harness/changes/archive/20260625-workbench-post-plan-scoped-local-autonomy-v1/summary.md`.
It extends post-plan scoped `完全访问权限` through the local terminal loop. Plan
confirmation remains human-only; after human plan confirmation, one scoped
authorization can run local execution, validation/audit, safe `audit.accept`,
local `result.apply`, and local `change.close`, then stop with no primary gate
after the Change is archived. The real E-drive UI acceptance used
`E:\aho-accept\scoped-local-autonomy-v1c` and produced a local apply commit
without running remote, merge, PR, integration apply/discard, raw scheduler, or
Harness evolution actions.

The previous product hardening is at
`harness/changes/archive/20260625-workbench-post-plan-scoped-automation-execution-v1/summary.md`.
It tightens scoped `完全访问权限` so `planning.confirm-execution` cannot be
automated. Plan confirmation remains human-only, while existing post-plan
execution-stage gates continue through scoped automation.

The previous planning/decomposition hardening is at
`harness/changes/archive/20260625-workbench-planning-decomposition-scope-honesty-v1/summary.md`.
It tightens low-conflict scheduler readiness: accepted planning and
DecompositionPlan scopes must stay within explicit user source constraints, and
unaccepted expansion into tests, docs, indexes, or other files blocks
`ready-for-scheduler-contract`.

The previous external-local restore change is at
`harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
It fixes direct `workbench serve <sourcePath>` restore for old E-drive
sandboxes when marker and `AHO_HOME/projects/<projectId>` memory match.

The latest archived scheduler integration apply/discard hardening is at
`harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.
It hardens the final scheduler IntegrationCheck human decision. Apply keeps the
existing source clean, HEAD, artifact hash, aggregate validation, and audit
guards. Discard now fails closed at the handler for terminal or non-discardable
check states. Targeted and Workbench aggregate tests passed.

Previous scheduler IntegrationCheck acceptance is at
`harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
It verifies the scheduler IntegrationCheck handoff on an E-drive external
source with dependencies installed as acceptance setup. The real browser UI run
used ordinary planning, manual confirmation, `完全访问权限`, Goal Loop
preparation, and controlled scheduler continuation to reach two real
`coder-codex` worker worktrees, worker validation/audit, and a ready integration
candidate. The raw `planning.scheduler.integration-check.run` gate remained
manual. After manual confirmation, existing IntegrationCheck ran aggregate
validation/audit, passed, and stopped at the existing human integration
apply/discard gate.

The latest Harness evolution handled the five-archive window ending with
`20260625-workbench-goal-loop-decision-surface-audit-v1`. Authorized subagent
review recommended `noop` with score 89: existing ECL/template/handoff rules
already cover the lessons, so no durable ECL/template/lint/docs/product runtime
change was applied. It is archived at
`harness/changes/archive/20260625-auto-evolve-post-goal-loop-decision-surface-window/summary.md`.

## Current Baseline

The accepted product baseline is a local, manual-gated Workbench loop: ordinary
demand conversation, planning, decomposition/readiness, real `coder-codex`
`code.run`, validation/audit, result review, human-confirmed apply, and
human-confirmed close/archive have all passed real browser acceptance in
external sandboxes.

Bounded continuation V1 is implemented only for matching controlled Scheduler
gates. One explicit Workbench confirmation may run a small step budget and must
stop at blockers, unsupported gates, high-impact human gates, or budget limits.
It is not full-auto, not a parallel executor, and not automatic
apply/merge/close.

Two-tier scoped automation V1 is implemented for the ordinary Workbench
decision surface. A user can keep per-step `请求批准`, or choose
`完全访问权限` once for the current demand after manually confirming the plan.
V1 repeatedly consumes the current authoritative `confirmationQueue.primary`
only when the action is in the local allowed set. It can now run bounded local
execution/recovery gates, accept safe approved audit evidence through
`audit.accept`, apply the local result, and close/archive the local Change. It
does not auto-run plan confirmation, raw scheduler actions, integration
apply/discard, merge, push, PR, remote landing, or Harness evolution.

Scheduler worker and IntegrationCheck acceptance now verifies that strict
independent source scopes can continue past worker start when the external
source has dependencies installed. Two workers produced ready worktree outputs,
validation passed, audit approved, the integration candidate was ready, and
IntegrationCheck passed aggregate validation/audit before stopping at the human
integration apply/discard gate. This is still bounded scheduler execution, not
full parallel executor behavior.

External-local restore is now implemented for direct `workbench serve <path>`
sessions. Reopening an E-drive source with a valid marker and matching
`AHO_HOME` rehydrates the project, conversations, and current gate without
writing the registry or mutating the source root.

Verification baseline: daily `npm run test:workbench` is the fast Workbench
unit-capability gate. Heavier full-chain scheduler/apply/Goal Loop coverage is
kept in `npm run test:workbench:release` and other explicit slow/deep package
scripts.

## Next Resume Point

No active change.

No pending Harness evolution.

The latest product change is archived at
`harness/changes/archive/20260625-workbench-post-plan-scoped-local-autonomy-v1/summary.md`.
It confirmed through real UI that full-access scoped automation starts only
after human plan confirmation and can complete local apply and close/archive.

Previous resume context:

The pending evolution has been completed as `noop` with independent subagent
review. The latest completed product audit confirmed that the existing Goal
Loop chain stays a user-surface explanation layer over real Workbench gates:

```text
GoalLoopDecision -> GoalLoopNextStepPacket -> ControllerPolicy
-> GateReadinessPreflight -> confirmationQueue
```

Next recommended product work:

- Choose the next concrete product capability or blocker scout from the
  existing Workbench gate/action/runtime owners; do not add a new Goal Loop
  decision layer after the completed audit found no product-code gap.
- Keep ordinary planning/decomposition/code paths owned by existing Workbench
  gates; Goal Loop may explain matching scheduler/integration gates but must
  not manufacture execution authority.
- Do not widen `完全访问权限` into raw `planning.scheduler.*`, integration
  apply/discard, merge, remote landing, Harness evolution, PR, or full parallel
  execution.
- If widening scoped automation next, keep plan confirmation human-only and use
  the existing confirmation queue/current-gate revalidation path rather than a
  new permission or workflow runtime.

## Verification Commands

Harness/documentation verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification when product code changes:

```powershell
npm run typecheck
npm run lint
npm run test:fast
npm run build
npm run test:integration
npm run test:workbench
npm run test:workbench:release
```

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with
archived `summary.md` files; open specs, plans, reviews, or source only when the
current task needs that evidence.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
