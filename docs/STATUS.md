# Project Status

## Current Handoff

- Current date: 2026-06-25.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
- Previous scheduler integration apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.
- Latest real UI continuation scout: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest completed Harness evolution: `harness/changes/archive/20260625-auto-evolve-post-scheduler-integration-window/summary.md`.
- Latest scheduler reachability change: `harness/changes/archive/20260625-workbench-low-conflict-taskgraph-scheduler-reachability-v1/summary.md`.
- Latest scheduler worker/integration acceptance: `harness/changes/archive/20260625-workbench-scheduler-worker-integration-real-acceptance-v1/summary.md`.
- Latest scheduler IntegrationCheck acceptance: `harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
- Latest scheduler integration apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.

The latest archived product change is at
`harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
It fixes external-local Workbench restore for old E-drive sandboxes: when
`workbench serve <sourcePath>` sees a valid `.agent-harness/project.json` and
the current `AHO_HOME/projects/<projectId>` memory exists, the server restores a
session-scoped direct project, `/api/projects` includes it, project-scoped
Workbench routes rehydrate existing conversations/gates, and the UI shows
Harness-ready external-local memory. Missing memory is now shown as an
`AHO_HOME` mismatch instead of generic Harness-uninitialized copy.

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

The latest Harness evolution handled the scheduler integration five-archive
window ending with
`20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1`.
Authorized subagent review recommended `docs_merge`: compact handoff alignment
only, with no ECL/template/lint/product runtime change. It is archived at
`harness/changes/archive/20260625-auto-evolve-post-scheduler-integration-window/summary.md`.

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
`完全访问权限` once for the current demand. V1 repeatedly consumes the current
authoritative `confirmationQueue.primary` only when the action is in the local
allowed set, and it stops at unsupported gates or high-impact human gates. It
can now automatically run bounded local recovery gates, automatically accept
safe approved audit evidence through `audit.accept`, and then stops at
`result.apply`. It does not auto apply, close, merge, push, or run Harness
evolution.

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

No active change and no pending evolution.

Next product-sized blocker: planning/decomposition scope honesty for
low-conflict scheduler demands. When a user constrains the change to explicit
source scopes, the accepted plan should not add test/index work items or diffs
unless it explains why they are necessary and the user accepts that expansion.

Latest result:

- Real E-drive UI acceptance used `E:\aho-accept\scheduler-integrationcheck-v1g\src` and
  `E:\aho-accept\scheduler-integrationcheck-v1g\home`.
- `完全访问权限` reached two real scheduler worker `coder-codex` runs, worker
  validation/audit, and `scheduler-integration-candidate-c71d788b`.
- `planning.scheduler.integration-check.run` stayed a manual gate. After manual
  confirmation, `apply-check-20260624205104-80da3aab` passed aggregate
  validation/audit and stopped at the existing integration apply/discard gate.
- Raw `planning.scheduler.*` actions remain outside the direct
  `完全访问权限` allowlist.

Next recommended work:

- Fix planning/decomposition honesty for low-conflict scheduler demands before
  widening scheduler automation or full Goal-driven loop behavior.
- If designing wider automation, keep it scoped by current Change, source
  state, accepted artifacts, stale revalidation, ToolPolicyGate, and human
  terminal gates.
- Keep automatic apply/close/merge, remote landing, Harness evolution, and full
  parallel executor out of scope.

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
