# Review: workbench-low-conflict-taskgraph-scheduler-reachability-v1

Status: completed; ready to close.

## Findings

- No blocking findings remain for this change.
- Resolved: Real UI reached low-conflict scheduler preparation/launch-direction gates, then the supported scheduler gate exposed Goal Loop preparation and scoped automation. `完全访问权限` consumed Goal Loop preparation and the existing controlled scheduler path; raw `planning.scheduler.*` and `planning.scheduler.controlled-advance.run` were not directly added to the automation allowlist.
- Resolved: when a confirmation card contains multiple allowed Goal Loop preparation actions, scoped automation now chooses the most advanced safe action first: `planning.goal-loop.controlled-continue.run`, then `planning.goal-loop.gate-readiness.prepare`, then controller refresh, then evaluation. This avoids looping on stale earlier preparation actions.
- Resolved: The initial scheduler preparation surface leaked internal terms such as `SchedulerContract`, `dry-run`, `WorkerLease`, and raw worker labels into the primary user flow. This is fixed in Workbench copy owners and protected by DOM/projection tests.
- Residual acceptance blocker, not a product blocker for this slice: the final E-drive worker run failed before code execution because the source root lacked `node_modules`, so the dependency bridge failed closed. The source root stayed clean.

## Verification

- Selected verification scope: planning/readiness classifier, scoped automation policy, Workbench projection/copy, DOM user-surface checks, and Workbench aggregate unit gate.
- PASS: `npx vitest run tests/unit/workbench-planning-scheduler-prep.test.ts tests/unit/automation-runtime.test.ts tests/unit/web-app.test.tsx`.
  - 3 files, 67 tests.
- PASS: `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`.
  - 3 files, 84 tests.
- PASS: `npx vitest run tests/unit/action-revalidation.test.ts tests/unit/workflow-actions.test.ts`.
  - 2 files, 25 tests.
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run build`.
- PASS: `npm run test:fast`.
  - 49 files, 523 tests. One aggregate attempt hit a known DOM aggregate-only flake; `npx vitest run tests/unit/web-app.test.tsx` passed, then `npm run test:fast` passed.
- PASS: `npm run test:workbench`.
  - 9 files, 121 tests.
- Full / release / slow suites skipped: this change did not alter scheduler runtime execution handlers, source apply, remote handoff, or release/deep scripts. The real UI scout supplied stronger product evidence for ordinary path reachability through the existing controlled scheduler path.
- Aggregate timeout: none in the commands above.

## Acceptance Feedback

- Real/manual acceptance performed: yes, E-drive external sandbox.
- Real Codex acceptance claimed: planning-only real Codex acceptance plus a real
  scheduler worker-start attempt that failed before Codex code execution due to
  missing source dependencies in the external sandbox.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: the Workbench planning stage used real `codex-readonly`; no fake Codex binary, mocked PATH, fixture result, or hand-written planning artifact was used for the real UI pass.
- Manual config edits:
  - Successful AHO runtime home: `E:\aho-accept\taskgraph-scheduler-v1b\home`.
  - Successful source root: `E:\aho-accept\taskgraph-scheduler-v1b\src`.
  - Default authenticated Codex home was used for credentials/trust only; AHO acceptance source/runtime state remained on E drive.
- Retries or environment failures:
  - Isolated E-drive `CODEX_HOME` attempt failed with 401 Unauthorized.
  - Fresh run with default authenticated Codex config succeeded through planning/decomposition/readiness/scheduler preparation.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4330/`.
  - UI snapshot: `E:\aho-accept\taskgraph-scheduler-v1b\ui-snapshot-final.json`.
  - Planning run id: `run-20260625-002142-src-alpha-ts-src-beta-ts-alphalabel-betalab-da9e6f`.
  - Latest bundle: `E:\aho-accept\taskgraph-scheduler-v1b\home\projects\taskgraph-scheduler-v1b\harness\changes\active\src-alpha-ts-src-beta-ts-alphalabel-betalab\planning\latest-bundle.json`.
- Post-fix real UI evidence:
  - Workbench URL: `http://127.0.0.1:4334/`.
  - UI snapshot: `E:\aho-accept\taskgraph-scheduler-v1b\ui-snapshot-after-fix.json`.
  - Automation run: `automation-run-20260624170747-a270a279`, completed steps `2`, stop reason `unsupported-gate`.
  - Goal Loop evidence: `goal-loop-next-step-packet-20260624170352-8bb78468`, `goal-loop-controller-policy-20260624170355-2b54fda3`, `goal-loop-gate-readiness-preflight-20260624170753-2142a5e8`.
  - Controlled scheduler evidence: `scheduler-controlled-step-20260624170755-899c7576`, `scheduler-worker-start-20260624170748-2500990f`, `scheduler-worker-result-46ece4dc`.
  - Worker run: `run-20260625-010748-src-alpha-ts-src-beta-ts-alphalabel-betalab-e0432d`, status `failed`, runtime `coder-codex`, execution mode `worktree`.
- External source/state safety: source root stayed clean before and after the scheduler-preparation scout; no source-root mutation occurred.
- Product-fixable workarounds or follow-up evidence: no workaround remained for scheduler reachability. The final stop is an environment/dependency setup blocker: `E:\aho-accept\taskgraph-scheduler-v1b\src\node_modules` was missing, and AHO correctly refused to run `npm install` automatically.
- Remote handoff acceptance: not applicable.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes for active handoff alignment.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Current result: handoff docs will be updated in the close pass. Detailed sandbox/run history stays in this archived review/summary instead of being promoted into `AGENTS.md` or `docs/STATUS.md`.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no archive history promoted; current docs should only name the completed change, the latest archive pointer, and the next recommended work.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is not a Harness evolution change and does not propose ECL/template/lint changes.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: this change does not affect worktree diff collection or apply preview/apply behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: low-conflict scheduler-ready readiness, Workpad nextAction labels, confirmation queue primary, and DecisionInspector primary DOM surface.
- Tested with:
  - `tests/unit/workbench-planning-scheduler-prep.test.ts`.
  - `tests/unit/web-app.test.tsx`.
  - `npm run test:workbench`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: right confirmation queue / DecisionInspector primary card / Workpad current action labels.
- Visible primary UI backed by implemented workflow paths: yes. The raw scheduler preparation and launch-direction gates are real implemented actions, while automation reachability uses Goal Loop preparation plus the existing controlled scheduler path.
- Authoritative primary-surface alignment checked: yes through Workbench unit/DOM suites.
- Stale-history override and running/archived suppression checked: covered by existing `npm run test:workbench` members.
- Out-of-scope future capability check: DOM tests assert no fake full-auto / parallel executor / merge queue wording on raw scheduler gates.
- Forbidden visible internal terms/actions checked: DOM tests now check the primary raw scheduler card does not expose `SchedulerContract`, `WorkerLease`, `dry-run`, or `worker`.
- Duplicate primary action / in-flight suppression check: not changed by this slice; existing Workbench tests cover running-state suppression.
- High-impact action path result: apply/close/merge/remote/Harness evolution remain outside the automation path.
- Real App DOM / browser UI verification result: real E-drive UI showed the low-conflict path reaching scheduler preparation, then after the fix exposed Goal Loop preparation and full-access scoped automation. It progressed into scheduler worker start and stopped at a missing-dependencies blocker before code execution.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: `changeId`, `decompositionPlanId`, `readinessManifestId`, scheduler preparation/launch ids, Goal Loop packet/controller/preflight ids, scheduler worker ids, and raw scheduler action payloads remaining outside scoped automation direct allowlist.
- Tested action path:
  - `planning.scheduler.plan.prepare` payload preservation in `tests/unit/workbench-planning-scheduler-prep.test.ts`.
  - raw scheduler action not full-access eligible in `tests/unit/automation-runtime.test.ts` and `tests/unit/web-app.test.tsx`.
- Duplicate action/evidence affordance result: no duplicate full-access/raw scheduler primary action introduced.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: this change does not alter the default parent-agent transcript renderer.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no for product code.
- Real UI external source safety: E-drive source root `E:\aho-accept\taskgraph-scheduler-v1b\src` stayed clean after scheduler preparation and after full-access controlled scheduler reachability. This change did not exercise source apply.
- If not applicable, reason: no result review, source apply, discard, or merge path was changed.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: real UI planning used Codex as an external read-only executor; Codex output remained planning evidence and did not become workflow authority. AHO memory/source/runtime artifacts for the acceptance run stayed under E-drive sandbox paths.
- Tested with: E-drive real UI scout plus project verification above.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification:
  - Planning bundle and decomposition plan: proposal/canonical planning artifacts after confirmation.
  - DecompositionReadinessManifest: guardrail artifact, not execution.
  - Scheduler preparation/launch records: non-source-mutating scheduler evidence and launch intent, not full executor.
- Boundary matrix checked:
  - required target ids: explicit `changeId`, readiness/decomposition ids, and scheduler ids where applicable;
  - Workbench/server scope propagation: covered by Workbench planning scheduler tests;
  - stale/forged/cross-change behavior: low-conflict negative readiness tests and existing Workbench aggregate members.
- Out-of-scope execution paths checked: no worker batch dispatch, no slot allocator, no child Change, no automatic apply/close/merge/remote/Harness evolution.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: selected Workbench demand / `changeId`.
- Recommendation authority checked: Goal Loop evidence remains evidence only; raw scheduler actions were not added to `完全访问权限`.
- Fallback priority checked: existing `npm run test:workbench` and targeted DOM tests cover concrete gate priority.
- Packet / controller / preflight freshness checked: yes. The real UI run produced fresh matching packet/controller/preflight evidence and used it to enter the controlled scheduler path.
- Hidden execution / source mutation check: no hidden source mutation occurred in real UI; source root stayed clean.
- ToolPolicyGate / human gate preservation checked: raw scheduler actions stay one-confirmation gates and full-access automation cannot directly consume them.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked:
  - low-conflict classification: `src/workbench/planning/builders.ts`;
  - user scheduler copy: `src/workbench/projections/read-model/confirmation/scheduler-user-surface.ts`;
  - scheduler confirmation projection: `src/workbench/projections/read-model/confirmation/typed-workflow.ts` and compatibility `src/workbench/workflow-projection.ts`;
  - frontend fallback labels: `src/web/src/action-labels.ts`, `src/web/src/scheduler-action-labels.ts`;
  - automation policy and action priority: `src/automation-runtime/policy.ts`;
  - automation handler resolver: `src/workbench/actions/handlers/automation.ts`.
- Retained facade responsibilities: Workbench manager/server facades remain compatibility surfaces only.
- Forbidden write-back locations: no new main logic added to `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, or `src/web/src/App.tsx`.
- Compatibility result: action ids, payload shapes, and server handler contracts remain unchanged.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: deterministic planning bundle, DecompositionPlan, DecompositionReadinessManifest, confirmation queue, scheduler preparation handler, controlled continuation allowlist policy, Workbench projection copy owner, and existing Workbench DOM tests.
- New cross-cutting mechanism and owner: none.
- Why existing mechanisms were insufficient: existing deterministic planning collapsed explicit two-file demands into one task and readiness accepted too-broad low-conflict signals; existing copy leaked internal scheduler terms.
- Local framework avoided: no second scheduler executor, permission system, projection system, evidence family, or full parallel runtime.
- Future-cost reduction result: future parallel work can build on strict source-scope readiness and user-facing scheduler copy instead of bypassing current gates.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes before close.
- Current result: close-ready after handoff docs and Harness checks. Handoff docs should point to the archive and name the next recommended work after this change.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: no Draft PR, PR feedback, provider, merge, push, or remote landing behavior changed.
