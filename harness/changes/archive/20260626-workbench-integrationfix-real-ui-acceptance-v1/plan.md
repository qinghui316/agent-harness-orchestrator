# Plan: workbench-integrationfix-real-ui-acceptance-v1

## Approach

Create a focused acceptance change and run the existing Workbench product path
against a fresh E-drive external source. The path must use the real browser UI
as the primary surface and real Codex-backed IntegrationFix as the repair
mechanism. If the path fails, classify the blocker and only patch the existing
owner that caused the failure.

## Steps

1. Record the active change scope, acceptance criteria, task map, and current
   active handoff pointers.
2. Run preflight checks: main repo status/build and external sandbox
   source/home setup.
3. Prepare a small Node/TypeScript external project with installed
   dependencies and a real aggregate validation script that can fail when
   integrated worker outputs conflict.
4. Start Workbench against the external source/runtime home, open it in the
   browser, and drive the ordinary UI path through planning, manual plan
   confirmation, `完全访问权限`, scheduler workers, and ready integration
   candidate.
5. Manually confirm `planning.scheduler.integration-check.run` and record the
   aggregate failure evidence plus IntegrationFix attempt.
6. Verify that Codex-backed repair runs in the integration fix checkout, writes
   repaired patch evidence, reruns aggregate validation/audit, and stops at the
   correct human gate or blocker.
7. If a product blocker appears, patch the smallest existing owner path and run
   targeted verification for that owner.
8. Close with real acceptance evidence, source safety record, handoff updates,
   Harness checks, and git settlement.

## Decisions

- Use real UI acceptance as the product proof; API snapshots and artifacts are
  supplemental evidence only.
- Use a real aggregate validation/audit failure, not deterministic marker-only
  removal, for product acceptance.
- Keep IntegrationCheck run and integration apply/discard human-gated.
- Treat reference projects as lifecycle evidence: ODWF supports bounded leaf
  execution and journaled evidence; Symphony supports isolated workspace,
  reconcile, retry, and blocked state. Neither implies a new AHO runtime here.

## Minimality Gate Plan

- Can this be a no-op: no; latest closeout explicitly lacks real UI
  acceptance for the new default Codex-backed IntegrationFix branch.
- Reuse: Workbench UI/actions, current-gate revalidation, scheduler worker
  progression, IntegrationCheck, IntegrationFix, Codex runtime,
  validation/audit, and source safety checks.
- Shared root fix: if a blocker appears, inspect the owner and caller surface
  before adding a local guard.
- Avoided: no new workflow runtime, permission system, projection framework,
  scheduler executor, evidence family, or fake acceptance helper.
- Smallest coherent change: acceptance evidence plus only blocker-driven code
  fixes.

## Module Boundary Plan

- Owner module: acceptance-only by default; blocker fixes must stay in the
  existing owner (`src/integration-check`, scheduler runtime/handoff,
  validation/audit, Workbench projection/action revalidation).
- New / moved responsibilities: none planned.
- Facade touch points: none planned; do not add main logic to broad facades.
- Forbidden write-back locations: no new main workflow logic in Workbench
  facade, server facade, manager facades, or frontend shell.
- Compatibility surface: Workbench action ids, projection shapes,
  IntegrationCheck artifacts, validation/audit artifacts, and source safety
  gates remain compatible.
- Boundary tests: targeted owner suites only if product code changes.
- Follow-up split candidates: none.
- If not applicable, reason: no product code change is planned unless real UI
  acceptance exposes a blocker.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: IntegrationCheck, IntegrationFix,
  Codex run artifacts, worktree isolation, aggregate validation/audit,
  Workbench confirmation queue, current-gate revalidation, and Harness source
  safety evidence.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: IntegrationFix behavior remains under
  `src/integration-check` if touched.
- Shared cross-cutting logic location: stale target checks, source safety,
  ToolPolicy/human gates, and artifact lineage remain in existing shared
  owners.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided unless a blocker proves an existing owner cannot express the path.
- Future-cost reduction for similar features: proves the real repair branch
  before widening scheduler/autonomy scope.
- If not applicable, reason: not applicable only if the change closes as
  acceptance evidence without code edits.

## Planning-Discovered Gaps

- None yet.
