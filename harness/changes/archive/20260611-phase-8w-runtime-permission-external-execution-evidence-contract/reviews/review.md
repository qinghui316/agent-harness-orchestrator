# Review: Phase 8W Runtime Permission External Execution Evidence Contract

Status: approved.

## Findings

- No blocking issue found.
- Runtime Continuity helpers remain evidence writers only; they do not alter ToolPolicyGate authority.
- External-execution events wrap existing worker lifecycle events and do not replace `validation.command.*`, `codex.*`, `audit.*`, or run events.
- `permission.decision.recorded` is available as a typed helper for WorkerSession-backed mirror evidence; this phase does not create Workbench action sidecars or new ToolPolicy decisions.

## Verification

- Drift check passed: no stale Phase 8V active claim in `AGENTS.md`, `docs`, or active change files.
- `npm run typecheck`
- Focused tests passed: `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/validation.test.ts tests/unit/audit.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Runtime Continuity sidecars around Codex app-server, codex exec, validation command, and audit Codex readonly worker paths.
- If applicable, tested with: runtime-continuity, validation, audit, workbench-module-boundaries focused tests; full test suite.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: Runtime Continuity permission/external-execution events are auxiliary evidence, not workflow truth or execution authority.
- If applicable, boundary matrix checked: SchedulerContract remains non-executing; permission evidence does not create runtime artifacts.
- If applicable, out-of-scope execution paths checked: no new scheduler, TaskRun, WorkerLease, AgentTask, TaskQueueRun, WorkflowRun, worktree, run, child Change, Workbench action, route, CLI, or UI/lazy projection was added.
- If applicable, stale/forged target behavior checked: helper tests prove raw payload cannot set canonical scope; low-level runtime-continuity direct read guards remain covered.
- If applicable, tested with: runtime-continuity focused tests, workbench-module-boundaries tests, full test suite.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/runtime-continuity/`.
- If applicable, module owners checked: Runtime Continuity owns event helper schema; worker paths only call helpers.
- If applicable, moved responsibilities: no moved responsibilities; additive helper responsibility.
- If applicable, retained facade responsibilities: existing manager/facade exports unchanged.
- If applicable, forbidden write-back locations: Workbench server/routes/UI, CLI command modules, broad manager facades, ToolPolicyGate authority logic.
- If applicable, compatibility surface: existing run, validation, audit, Workbench, CLI, and event shapes.
- If applicable, behavior path tested: code runner typecheck plus validation/audit runtime-continuity tests.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: workbench-module-boundaries test and lint/typecheck.
- If applicable, compatibility result: public run, validation, audit, Workbench, CLI, and existing event shapes remain compatible.
- If applicable, tested with: focused tests, full tests, lint, build.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/AGENT-MODEL.md`, `docs/BOUNDARIES.md`.
- If applicable, stale active-path / phase grep: passed.
- If applicable, latest archive / active path alignment: Phase 8V archived, Phase 8W active.
- If applicable, pending evolution state checked: `harness-evolve.ps1 check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
