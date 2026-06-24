# Review: workbench-two-tier-scoped-automation-authorization-v1

Status: ready to close.

## Findings

No unresolved findings.

During real UI acceptance, the first scoped automation run advanced 0 steps
because the runtime reread the ordinary Workbench snapshot after its own
top-level `workflow.started` event. That ordinary snapshot correctly hid the
selected-demand primary gate while a workflow action was running. The fix adds
an internal-only snapshot option for automation child execution to ignore its
own top-level workflow action while preserving ordinary UI suppression and
active execution/role-pipeline suppression.

## Verification

- Selected scope: workflow action contract, scoped automation runtime, shared
  current-gate revalidation, Workbench read-model projection, Workbench DOM
  surface, server/live payload forwarding, module-boundary guard, and full
  Workbench aggregate.
- Targeted:
  - `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/web-workflow-actions.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx`
  - `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx`
  - `npx vitest run tests/unit/action-revalidation.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/automation-runtime.test.ts tests/unit/web-app.test.tsx`
- Product:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `npm run test:workbench`
- Harness:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

`npm run test:workbench` passed after the final internal snapshot fix. Final
temporary log: `C:\Users\qinghui\AppData\Local\Temp\aho-test-workbench-two-tier-final.log`.

## Real UI Acceptance

- Browser URL: `http://127.0.0.1:4333`.
- External source: `C:\aho-accept\two-tier-v3\src`.
- External runtime home: `C:\aho-accept\two-tier-v3\home`.
- UI path: register external source, initialize Harness, create ordinary
  demand, run `planning.generate` through request approval, select
  `完全访问权限` on `planning.confirm-execution`, and confirm once.
- Evidence:
  - Initial `planning.generate` showed `完全访问权限` disabled, proving full
    access was not global.
  - `planning.confirm-execution` showed exactly the two modes:
    `请求批准` / `完全访问权限`.
  - After confirming `完全访问权限`, automation run
    `automation-run-20260624064345-0560e025` completed 1 step.
  - Iteration `automation-iteration-20260624064345-1d38b4e9` submitted and
    completed `planning.confirm-execution`.
  - The run stopped with `stopReason: unsupported-gate` at the next visible
    gate, `planning.decomposition.generate`, which is intentionally outside V1.
  - The UI returned to an explicit user decision surface and did not expose
    automatic apply, close, merge, remote, parallel executor, slot allocator, or
    full-auto controls.

## Workbench User-Surface Honesty Coverage

Applicable.

- Sampled surface: right-side confirmation card and `DecisionPanels` action
  card in real browser plus App DOM test.
- Visible primary UI backed by implemented workflow paths:
  `planning.automation.scoped-auto.run` routes through the normal workflow
  action service, high-impact audit, target validation, shared current-gate
  revalidation, and owned automation handler/runtime.
- Authoritative primary alignment: the UI consumes `confirmationQueue.primary`;
  automation child execution rereads an internal snapshot only to avoid its own
  top-level running-action self-suppression.
- Stale/running suppression: ordinary snapshots still hide selected-demand
  primary gates while workflow actions are running; test coverage now also
  proves the internal automation snapshot can see the gate without changing the
  ordinary UI.
- Forbidden capability check: DOM and real UI evidence did not show fake
  full-auto, parallel executor, merge queue, slot allocator, automatic apply, or
  automatic close controls.
- High-impact gates: `result.apply`, `change.close`, remote, merge, and Harness
  evolution are terminal/unsupported for V1 automation and remain human-gated.

## Scoped Workbench Action Payload Coverage

Applicable.

- Required target ids checked: `changeId`, current concrete gate target ids
  such as `planningBundleId`, `automationCurrentGateActionType`,
  `automationMode`, and `maxSteps`.
- Tested path: web payload serialization, server/live forwarding,
  `planning.automation.scoped-auto.run` required-target validation, shared
  `assertCurrentWorkflowAction`, and automation child dispatch.
- Fail-closed checks: missing/stale/mismatched scoped-auto current gate fails
  closed in action revalidation tests; required-target validation rejects
  incomplete payloads.
- Duplicate action check: UI exposes a single primary action; selecting full
  access changes the submitted action wrapper instead of adding a second
  independent confirmation gate.

## Source Apply Safety Coverage

Applicable by boundary, because this change touches automated action execution
near source-producing workflow gates. V1 explicitly does not authorize apply.

- Source project: `C:\aho-accept\two-tier-v3\src`.
- Runtime home: `C:\aho-accept\two-tier-v3\home`.
- Source mutation scope: only Harness initialization occurred in the external
  source before the acceptance demand; no result apply or merge was authorized.
- Before/after source safety: after real UI acceptance, `git status --short`
  showed only `?? .agent-harness/` and `?? AGENTS.md` from external Harness
  initialization. No worktree result diff was applied to the source root.
- Apply/close preservation: automation stopped before any apply/close gate and
  allowed action policy excludes apply/close/merge/remote/Harness evolution.

## Runtime Bridge Boundary Coverage

Applicable.

- Boundary checked: Codex runtime full-access capability is recorded on
  `AutomationAuthorization` as runtime capability only; it does not expand AHO
  `allowedActionTypes`.
- Harness memory remains truth for accepted spec/plan/tasks/ac-map, run
  artifacts, validation/audit, and close/apply gates.
- SQLite/UI state is not an authority source; the runtime rereads the
  authoritative Workbench confirmation projection and revalidates concrete
  targets before each child step.

## Goal Loop Boundary Coverage

Applicable because this is scoped automation adjacent to Goal-driven runtime.

- Persistent scope: current `projectId + changeId`.
- Owner module: `src/automation-runtime/`, not GoalLoopDecision or UI state.
- Evidence read before each continuation: current Workbench snapshot,
  `confirmationQueue.primary`, source state, accepted artifact hashes, and
  concrete action target ids.
- High-impact gates preserved: apply, close, merge, remote, and Harness
  evolution remain outside V1 automation.
- GoalLoopDecision / packet / controller evidence is not used as authority.
  The allowed action set includes the existing bounded controlled continuation
  action, but only when it is the current revalidated primary gate.

## Module Boundary Coverage

Applicable.

- New owner modules:
  - `src/automation-runtime/`: authorization/run/iteration artifacts, allowed
    action policy, stop rules, source/hash safety.
  - `src/workbench/actions/handlers/automation.ts`: Workbench action handler and
    child dispatch.
  - `src/workbench/actions/current-action-revalidation.ts`: reusable current
    gate revalidation shared by server and automation.
  - `src/workbench/projections/read-model/confirmation-queue.ts`: selected
    demand running suppression and internal automation snapshot option.
  - `src/web/src/panels/workbench/DecisionPanels.tsx`: two-tier UI selector.
- Retained facade responsibilities: action registry, server route forwarding,
  and handler index wiring only.
- Forbidden write-back locations checked by tests and review: no main logic was
  added to `src/workbench/chat.ts`, `src/workbench/manager.ts`,
  `src/server/workbench-server.ts`, or `src/web/src/App.tsx`.
- Compatibility result: existing per-step request approval path remains the
  default; new fields are optional in payload/read-model types.

## Core Mechanism Reuse Coverage

Applicable.

- Reused mechanisms: Workbench confirmation queue, workflow action registry,
  required-target validation, strict scope matching, high-impact audit /
  ToolPolicyGate, existing handler map, source-state capture, accepted artifact
  hashes, and Workbench read-model projection.
- New cross-cutting owner: `src/automation-runtime/` is the reusable owner for
  scoped automation artifacts and loop stop rules.
- Avoided local frameworks: no parallel permission system, action registry,
  projection system, scheduler loop, full-auto mode, or workflow truth.
- Future-cost result: later scoped profiles can reuse authorization/run/
  iteration artifacts and the shared current-gate revalidation instead of
  inventing feature-local loops.

## Proposal / Runtime Boundary Coverage

Applicable.

- Artifact classification:
  - `AutomationAuthorization`: human-confirmed scoped authorization evidence.
  - `AutomationRun` / `AutomationIteration`: executable runtime evidence for
    bounded continuation over existing gates.
  - `GoalLoopDecision`, packet, controller, and UI state: non-authoritative
    evidence/projection only.
- Boundary matrix: action payload carries `changeId` and target ids; server and
  automation child executor share revalidation; stale/missing/forged/
  cross-change targets fail closed; child execution reuses owner handlers.
- Out-of-scope execution checked: automatic apply/merge/close, remote actions,
  Harness evolution, parallel executor, slot allocator, and child Change
  creation are not implemented.

## Documentation Entropy And Handoff Drift Coverage

Applicable.

- Files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change summary/review/tasks.
- Line counts before close updates: `AGENTS.md` 128, `docs/STATUS.md` 66,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 239.
- Drift check: active path and current phase are aligned before close; close
  handoff must update active state to archive path and remove stale active
  references.
- Entropy decision: implementation and real UI details stay in archived change
  records; entry/handoff docs only keep current baseline and next direction.

## Worktree Diff Artifact Coverage

Not applicable. This change does not alter worktree diff collection or result
diff hashing.

## Transcript Renderer Source-Boundary Coverage

Not applicable. This change does not alter the default parent-agent transcript
renderer.

## Remote Handoff Acceptance Coverage

Not applicable. This change does not alter remote handoff, PR, push, merge, or
provider capability behavior.
