# Plan: workbench-repaired-integration-apply-real-ui-acceptance-v1

## Approach

Run the smallest real acceptance that closes the latest IntegrationFix gap:
restore the prior E-drive sandbox, confirm its current repaired
IntegrationCheck apply gate through Workbench UI, and verify the repaired patch
lands in the external source root. If restore fails, rebuild the same scenario
in a fresh E-drive sandbox rather than hand-writing artifacts.

## Steps

1. Check repo and sandbox preconditions: main repo only has unrelated
   `README.md`, external source is clean, and the IntegrationCheck artifact is
   still passed with `latestArtifactRef` pointing at `repaired.patch`.
2. Build the product and start Workbench against the external source with
   `AHO_HOME=E:\aho-accept\integrationfix-real-ui-v1\home`.
3. Use the browser UI to verify the visible primary gate is
   `integration-apply` for `apply-check-20260625165935-fa41891a`, with
   `apply-check.apply` and `apply-check.discard` as human actions.
4. Confirm `apply-check.apply` in the UI.
5. Verify source status, changed files, IntegrationCheck status, and Workbench
   next primary gate after apply.
6. If a product blocker appears, repair only the relevant existing owner and
   run targeted tests plus required product checks.
7. Close the change with source-safety evidence, handoff updates, Harness
   checks, and git settlement excluding unrelated `README.md`.

## Decisions

- Acceptance-first change: no code changes unless a real UI blocker appears.
- Integration apply/discard remains a terminal human gate outside scoped
  automation.
- Repaired artifact apply is validated in an external sandbox, not the AHO
  development checkout.

## Minimality Gate Plan

- Can this be a no-op: no, the latest real UI acceptance stopped before the
  final repaired artifact apply.
- Reuse: Workbench confirmation queue, approval execution,
  integration-check apply/discard, current-gate revalidation, source safety,
  and artifact hash guards.
- Shared root fix: if blocked, inspect integration-check apply, Workbench
  projection, approval routing, and revalidation owners before adding a local
  guard.
- Avoided: new runtime, permission system, projection framework, scheduler
  executor, child Change, and evidence family.
- Smallest coherent change: real UI acceptance plus only blocker-driven minimal
  fixes.

## Module Boundary Plan

- Owner module: existing `src/integration-check/*` for apply safety if a bug is
  found; otherwise not applicable.
- New / moved responsibilities: none planned.
- Facade touch points: existing Workbench approval execution only if needed.
- Forbidden write-back locations: automation policy, raw scheduler allowlist,
  remote/merge/PR/Harness evolution paths.
- Compatibility surface: Workbench approval action payload and existing
  IntegrationCheck record shape.
- Boundary tests: targeted integration-check / action revalidation /
  read-model / DOM suites only if product code changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: IntegrationCheck latest artifact
  hash, source clean/HEAD guards, Workbench approval action routing, and real
  UI confirmation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: existing integration-check owner if needed.
- Shared cross-cutting logic location: existing current-gate revalidation and
  Workbench confirmation queue if needed.
- Local framework / state machine / projection / validation / gate avoided:
  yes.
- Future-cost reduction for similar features: confirms the repaired
  integration artifact can travel through the existing apply owner without
  inventing a new integration landing path.

## Planning-Discovered Gaps

None yet.
