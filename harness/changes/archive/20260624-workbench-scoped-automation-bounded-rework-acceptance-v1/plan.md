# Plan: workbench-scoped-automation-bounded-rework-acceptance-v1

## Approach

Start with acceptance tests around the existing scoped automation path. If the
current implementation already supports bounded rework gates, keep product code
unchanged and record the proof. If gaps appear, make the smallest fix in the
existing owner module.

## Steps

1. Add runtime tests for `result.refresh-rework`, `result.revalidate`,
   `result.reaudit`, safe `audit.accept`, and terminal `result.apply`.
2. Add current-gate revalidation tests for recovery gate scope, missing target
   ids, stale worktree ids, and cross-change payloads.
3. Add/readjust Workbench read-model and DOM tests for `完全访问权限` availability
   on recovery gates and suppression on apply/close.
4. Run targeted verification and fix only real owner-scoped gaps.
5. Run product checks and Workbench aggregate or split members.
6. Perform E-drive real UI acceptance and record source safety.
7. Close the change, update handoff docs, regenerate Harness indexes, and git
   the closed work while excluding unrelated `README.md`.

## Decisions

- Use the existing `planning.automation.scoped-auto.run` runtime; do not create
  a bounded-rework runtime.
- Treat Workbench `confirmationQueue.primary` as the only executable source for
  automatic child steps.
- Keep `approved-with-notes` as a human decision, not an automatic accept.
- Stop at `result.apply` even if the remaining budget could continue.

## Module Boundary Plan

- Owner module: `src/automation-runtime/` for loop behavior and stop reasons;
  `src/workbench/actions/current-action-revalidation.ts` for current gate target
  checks; `src/workbench/actions/handlers/automation.ts` for action glue;
  Workbench read-model / DOM owners for projection and UI availability.
- New / moved responsibilities: none planned.
- Facade touch points: only thin handler/registry/test wiring if needed.
- Forbidden write-back locations: do not add core logic to broad Workbench
  manager/chat/server shells or `App.tsx`.
- Compatibility surface: existing action types and payload shape remain stable.
- Boundary tests: runtime, revalidation, read-model, and DOM suites.
- Follow-up split candidates: none unless implementation discovers existing
  logic already lives in a broad owner and must be extracted separately.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation authorization,
  current-gate revalidation, required target validation, ToolPolicy/high-impact
  action audit, Workbench confirmation queue, existing result rework handlers,
  validation/audit evidence, and source safety.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: recovery gate eligibility remains in existing
  Workbench projection and automation policy surfaces.
- Shared cross-cutting logic location: target freshness remains in current-gate
  revalidation.
- Local framework avoided: no private rework state machine, approval system,
  projection system, or artifact protocol.
- Future-cost reduction: future allowed gate families can reuse the same
  current-primary-gate and target-revalidation pattern.

## Planning-Discovered Gaps

None yet.
