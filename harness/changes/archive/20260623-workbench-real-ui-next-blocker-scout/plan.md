# Plan: workbench-real-ui-next-blocker-scout

## Approach

Use the current AHO product build as the Workbench under test and a fresh
external sandbox as the managed project. Drive a small real demand through the
browser UI. Treat any failure as evidence first: classify it, then either make
the smallest product fix inside this change or close the change with a clear
blocker if the failure is environment/provider or Codex agent quality.

## Steps

1. Confirm repository state and build the current Workbench.
2. Prepare external sandbox directories for source and runtime home.
3. Start Workbench server against the sandbox source using the sandbox runtime
   home.
4. Use browser UI to create a normal small demand and advance legal primary
   gates one at a time.
5. Capture visible gate evidence, run artifacts, validation/audit evidence,
   result review state, source safety state, and close/archive result.
6. If a product blocker appears, update this change with the classification,
   implement the smallest fix in the owned module, and run targeted
   verification.
7. If no blocker appears, record the smoke pass and close with next direction
   `scheduler-slow-runtime-reduction`.

## Decisions

- External sandbox is mandatory; same-root acceptance is not positive pass
  evidence for apply/close.
- UI evidence is mandatory for scout pass; API/server calls are only
  supplemental when the UI reaches a state but the browser tool cannot click a
  specific control.
- No full-auto or parallel executor scope is allowed in this change.
- Any product code fix must name its owner module before implementation.

## Module Boundary Plan

- Owner module: not predetermined. If a blocker is found, choose the existing
  owner for the failing path before editing: Workbench action handler,
  read-model projection builder, server Workbench route/action revalidation,
  runtime service, validation/audit service, apply/landing service, or
  frontend panel.
- New / moved responsibilities: none unless a blocker requires a minimal fix.
- Facade touch points: compatibility facades may receive only thin wiring.
- Forbidden write-back locations: do not add new main logic to broad facades
  such as Workbench chat/read-model/server shell/App unless no suitable owner
  exists and the review records the exception.
- Compatibility surface: Workbench action ids, payload target ids, API shapes,
  SSE/live behavior, and human gates remain compatible.
- Boundary tests: targeted tests for any touched owner module.
- Follow-up split candidates: none planned.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench confirmation queue,
  scoped action target revalidation, ToolPolicy/human gates, real Codex
  worktree execution, validation/audit, result review, source apply safety, and
  close/archive handoff.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is planned.
- Domain-specific logic location: the existing owner for any discovered
  blocker.
- Shared cross-cutting logic location: existing target revalidation, artifact
  repositories, projection builders, and source safety helpers.
- Local framework / state machine / projection / validation / gate avoided:
  avoid adding new evidence-only layers or duplicate confirmation systems.
- Future-cost reduction for similar features: classify real UI blockers from
  current product evidence before expanding automation.

## Planning-Discovered Gaps

None yet.
