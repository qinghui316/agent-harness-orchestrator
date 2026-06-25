# Review: workbench-external-local-restore-v1

Status: complete.

## Findings

No blocking findings.

## Change Summary

- Added a server-owned direct project restore helper for `workbench serve <path>`
  when the source has a valid `.agent-harness/project.json`.
- Threaded the restored session-scoped project through `/api/app/status`,
  `/api/projects`, and project-scoped Workbench routes without writing the
  registry.
- Added minimal memory diagnostics to project status and Workbench UI so a
  missing external-local memory root is shown as an `AHO_HOME` mismatch instead
  of generic Harness-uninitialized state.
- Added server and DOM coverage for restored, missing-memory, and duplicate-id
  fail-closed paths.

## Verification

Selected verification scope: server routing, project status/memory diagnostics,
Workbench DOM surface, fast product checks, and Workbench aggregate unit gate.

Passed:

- `npx vitest run tests/unit/registry.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Full release / slow Workbench suites were not run because this change does not
touch scheduler execution, worktree diff collection, validation/audit, apply,
IntegrationCheck runtime, remote handoff, or Goal Loop execution. The affected
Workbench projection/server boundary is covered by targeted tests plus the fast
Workbench unit aggregate.

## Real UI Acceptance

- Browser URL: `http://127.0.0.1:4331/`.
- External source: `E:\aho-accept\external-restore-v1\src`.
- External runtime home: `E:\aho-accept\external-restore-v1\home`.
- Restore sequence: initialized external-local sandbox, created active demand
  `restore-pending-gate`, committed sandbox marker files, stopped Workbench,
  restarted with the same `AHO_HOME`, and reloaded the browser.
- DOM evidence after restart:
  - project `External Restore V1`;
  - conversation `Restore Pending Gate`;
  - bottom status `记忆：external-local`, `状态：就绪`, `Harness 就绪`;
  - visible primary decision card for the restored demand;
  - no `初始化 Harness` button;
  - no `创建需求对话` button.
- Source safety: `git status --short` in the external source was empty before
  and after restore. Restore did not mutate the source root.

## Read Model Projection Coverage

Applicable: yes.

Checked scope: restored direct projects appear in `/api/projects` and
`/api/projects/:id/workbench/snapshot`; missing memory returns a diagnostic
instead of an initialized snapshot; restored topics and confirmation queue are
derived from external-local memory.

Tested with:

- `tests/unit/workbench-server.test.ts`
- `tests/unit/web-app.test.tsx`
- real browser DOM acceptance above.

## Workbench User-Surface Honesty Coverage

Applicable: yes.

Sampled surface: project sidebar, empty-workbench/project status surface,
bottom status, and right primary decision card.

Result: restored projects show as Harness-ready when memory exists. Missing
external-local memory shows `external-local 记忆未找到` / `AHO_HOME` mismatch copy
and does not expose misleading Harness initialization or demand creation as the
primary path. Existing primary gate projection still comes from the
authoritative Workbench snapshot; no future automation, parallel executor, or
apply/close capability is advertised.

Tested with:

- `tests/unit/web-app.test.tsx`
- real browser DOM acceptance above.

## Runtime Bridge Boundary Coverage

Applicable: yes.

Boundary checked: direct restore is routing and memory resolution only. The
server constructs a session-scoped `ManagedProject` from the source marker and
current `AHO_HOME`, but does not create workflow truth, write registry state,
or mutate source/memory. Change/ECL files, validation/audit, IntegrationCheck,
and human gates remain the durable source of truth.

Tested with:

- `tests/unit/workbench-server.test.ts`
- real restart acceptance proving the route rebuilds from marker + memory.

## Module Boundary Coverage

Applicable: yes.

Owner modules:

- `src/server/workbench/direct-project.ts`: session-scoped direct marker restore
  and direct project routing helpers.
- `src/project/status.ts`: project status plus memory diagnostics.
- `src/server/workbench/project-admin.ts` and
  `src/server/workbench/api-router.ts`: thin route wiring.
- `src/web/src/shell/sidebar.tsx` and `src/web/src/panels/ProjectPanels.tsx`:
  user-facing memory diagnostics.

Retained facade responsibilities: `startWorkbenchServer` composes server
context only; Workbench action handlers and runtime services are unchanged.

Compatibility result: HTTP routes remain project-scoped and additive DTO fields
do not remove existing fields.

Tested with targeted server/DOM suites and `npm run test:workbench`.

## Core Mechanism Reuse Coverage

Applicable: yes.

Existing mechanisms reused: project marker, registry store, memory resolver,
memory status, project status, Workbench snapshot, and project-scoped route
handlers.

No new registry, permission system, execution state machine, workflow runtime,
or projection family was introduced. The new helper only adapts existing marker
and memory resolution into the existing Workbench route/project status paths.

## Source Apply Safety Coverage

Applicable: no for apply; source safety still sampled because acceptance uses an
external managed source.

Checked source project / runtime home:

- `E:\aho-accept\external-restore-v1\src`
- `E:\aho-accept\external-restore-v1\home`

Result: no source apply, discard, merge, or close path changed. Restore did not
mutate source root after sandbox initialization; `git status --short` was empty
before and after restart restore.

## Scoped Workbench Action Payload Coverage

Applicable: no. This change does not add or change Workbench live/server action
payloads; it only restores project routing and projection.

## Worktree Diff Artifact Coverage

Applicable: no. This change does not affect worktree-backed diff behavior.

## Transcript Renderer Source-Boundary Coverage

Applicable: no. This change does not affect the default conversation transcript
renderer.

## Proposal / Runtime Boundary Coverage

Applicable: no. This change does not add planning proposals, readiness
manifests, workflow plans, or executable runtime artifacts.

## Goal Loop Boundary Coverage

Applicable: no. This change does not add or change Goal Loop policy,
recommendation, continuation, or execution behavior.

## Documentation Entropy Coverage

Applicable: yes because closeout updates handoff docs.

Before line counts:

- `AGENTS.md`: 179
- `docs/STATUS.md`: 149
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: 252

After line counts:

- `AGENTS.md`: 182
- `docs/STATUS.md`: 161
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: 254

Closeout decision: keep detailed UI/sandbox evidence in this archived change;
update handoff docs only with the new current baseline and next direction.

## Close / Handoff Drift Coverage

Applicable: yes.

Handoff files checked:

- `AGENTS.md`
- `docs/STATUS.md`
- `docs/CURRENT-DEVELOPMENT-PLAN.md`

Stale active-path / phase grep: checked with
`rg "external-local restore|restore-path blocker|Harness-uninitialized|memory unknown|workbench-external-local-restore-v1" AGENTS.md docs/STATUS.md docs/CURRENT-DEVELOPMENT-PLAN.md harness/changes/active/workbench-external-local-restore-v1`
before close, then handoff docs were switched from active to archive after
`harness-change close`. Final verification uses `lint-ecl`,
`harness-change reindex`, `harness-change status`, and `harness-evolve check`.

## Remote Handoff Acceptance Coverage

Applicable: no. This change does not affect Draft PR, PR feedback, provider
capability, remote checks, or remote handoff behavior.
