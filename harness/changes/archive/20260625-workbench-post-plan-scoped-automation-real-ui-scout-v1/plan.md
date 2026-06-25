# Plan: workbench-post-plan-scoped-automation-real-ui-scout-v1

## Approach

Create a small external Node/TypeScript project on E drive, start Workbench
against it, and drive the real browser UI through the ordinary demand path. The
scout first proves the plan-confirmation boundary, then verifies post-plan
`完全访问权限` automation using the existing Workbench confirmation queue and
automation runtime. Product code changes are deferred until a concrete blocker
is observed.

## Steps

1. Record the active change boundary and update handoff docs to point at this
   active scout.
2. Build the current product so Workbench can serve from `dist/`.
3. Prepare `E:\aho-accept\post-plan-auto-scout-v1\src` and
   `E:\aho-accept\post-plan-auto-scout-v1\home` as an isolated acceptance
   source/runtime home.
4. Start Workbench for the external source with the external `AHO_HOME`.
5. Use the browser UI to create a small ordinary code demand, generate a plan,
   verify `完全访问权限` is unavailable for plan confirmation, and human-confirm
   the plan.
6. Select `完全访问权限` only after the accepted plan and observe automation until
   it reaches `result.apply` or a classified blocker.
7. Record UI/DOM evidence, automation and run artifacts, validation/audit
   evidence, and source status.
8. If no product blocker is found, close the scout as no-code acceptance. If a
   blocker is found, fix only the relevant owner path and run targeted checks
   before close.

## Decisions

- Real browser UI is the primary acceptance surface; server/API artifacts are
  supporting evidence.
- The acceptance project is external-local on E drive; the AHO development repo
  is only the product under test.
- The scout should not widen automation policy. It verifies the latest boundary
  and fixes only concrete blocker paths.

## Minimality Gate Plan

- Can this be a no-op: yes if the real UI path passes; close with evidence only.
- Reuse: existing Workbench confirmation queue, scoped automation runtime,
  current-gate revalidation, validation/audit, result review, and source safety
  gates.
- Shared root fix: if blocked, inspect the owning action/revalidation/runtime
  path before adding local guards.
- Avoided: new workflow runtime, permission system, evidence family, scheduler
  executor, and Goal Loop decision layer.
- Smallest coherent change: acceptance evidence first; code only for observed
  blocker.

## Module Boundary Plan

- Owner module: not applicable unless a blocker requires a code fix.
- New / moved responsibilities: none planned.
- Facade touch points: none planned.
- Forbidden write-back locations: no new main logic in broad Workbench facades,
  `src/web/src/App.tsx`, or manager facades if a fix is needed.
- Compatibility surface: Workbench HTTP/action payloads and UI behavior must
  remain compatible except for any blocker fix.
- Boundary tests: targeted owner tests only if product code changes.
- Follow-up split candidates: none.
- If not applicable, reason: no product-code change is planned before the scout.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation runtime,
  confirmation queue, action target revalidation, ToolPolicy/human gates,
  validation/audit, and result apply safety.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: only the owning Workbench/action/runtime
  module if a blocker is found.
- Shared cross-cutting logic location: existing current-gate revalidation and
  safety owners.
- Local framework / state machine / projection / validation / gate avoided: all
  avoided unless a blocker proves an existing owner cannot express the path.
- Future-cost reduction for similar features: records whether post-plan scoped
  automation is product-ready before widening Goal-driven continuation.
- If not applicable, reason: not applicable only if scout closes no-code.

## Planning-Discovered Gaps

None yet.
