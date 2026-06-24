# Plan: workbench-real-ui-continuation-next-blocker-scout

## Approach

Use the current clean AHO baseline as the product under test and create an
external managed source/runtime sandbox. Drive Workbench through a real browser
session. Prefer observation over new code: fix product code only when the scout
reveals a concrete blocker on an implemented path.

## Steps

1. Confirm repo state contains only the unrelated untracked `README.md`.
2. Run `npm run build` so the Workbench server can start from current product
   code.
3. Create `C:\aho-accept\continue-next\src` and
   `C:\aho-accept\continue-next\home` as the external sandbox.
4. Start Workbench against the external source and runtime home.
5. Use a real browser UI to create a small natural-language demand and progress
   legal visible gates.
6. Record visible primary gates, action ids, runtime artifacts, validation/audit
   artifacts, result review state, source status, and close/archive evidence.
7. If a supported controlled Scheduler gate is visible, confirm bounded
   continuation once and record authorization/run/iteration artifacts.
8. If a blocker appears, classify it, fix the smallest owned boundary, and run
   the targeted and aggregate verification required by the touched surface.
9. Close with either pass evidence or blocker evidence and update handoff docs.

## Decisions

- Use external sandbox acceptance, not same-root acceptance.
- Do not implement broader automation in this change.
- API snapshots may supplement browser evidence, but visible UI is the product
  acceptance surface.
- If no supported continuation gate appears naturally, do not fabricate one;
  record that ordinary path did not exercise continuation and classify the scout
  result accordingly.

## Module Boundary Plan

- Owner module: not applicable unless a real blocker requires a product fix.
- New / moved responsibilities: none planned.
- Facade touch points: none planned.
- Forbidden write-back locations: broad Workbench/server/frontend facades must
  not receive new main logic unless no owned boundary exists and the review
  records why.
- Compatibility surface: Workbench UI/API/action payloads remain compatible
  unless a blocker fix explicitly requires a stricter fail-closed behavior.
- Boundary tests: required only for any touched blocker fix.
- Follow-up split candidates: none.
- If not applicable, reason: acceptance scout may close with no product code
  changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench action registry,
  scoped target revalidation, ToolPolicy/human gates, code runtime,
  validation/audit, result review, apply/close, and bounded continuation V1.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is planned.
- Domain-specific logic location: blocker fixes must stay in the owned module
  for the failing path.
- Shared cross-cutting logic location: target validation, stale checks,
  projection summaries, and source safety remain in existing shared owners.
- Local framework / state machine / projection / validation / gate avoided: no
  new local framework or evidence family.
- Future-cost reduction for similar features: real UI scout establishes the next
  product blocker before broader automation design.
- If not applicable, reason: not applicable only if this remains no-code
  acceptance.

## Planning-Discovered Gaps

- The ordinary demand-to-code path may not produce a controlled Scheduler gate.
  If so, this scout should still validate the ordinary path and explicitly record
  that continuation was not naturally exercised.
