# Review: main-agent-child-agent-workspace-flow-v2

Status: approved.

## Findings

No blocking findings.

## Verification

- Selected verification scope: Workbench read-model projection, frontend Agent workspace UI, planning action surface/revalidation, transcript renderer reuse, confirmationQueue suppression for planning, and broad Workbench regression.
- Passed: `npx tsc --noEmit --pretty false`.
- Passed: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`.
- Passed: `npx vitest run tests/unit/workbench-demand-worker.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts`.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run test:workbench`.
- Passed: `npm run test:fast`.
- Passed: `npm run build`.
- Passed: mojibake marker scan over `src docs harness AGENTS.md` with no matches.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`.
- Full / aggregate suites run or skipped: aggregate fast, build, and Workbench suites passed. Full `npm run test` was not run because this change is scoped to Workbench projection/UI/action routing and the touched package-level Workbench gate plus `test:fast` covered the relevant runtime boundaries.

## Real UI Acceptance

- Real/manual acceptance performed: partial read-only browser acceptance only.
- Real Codex acceptance claimed: no.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: no fake Codex, mocked PATH, fixture result, or hand-written run artifact was used.
- Browser evidence: the in-app browser plugin could not discover the user's existing tab (`browser.tabs.list()` and `browser.user.openTabs()` returned empty). A new in-app browser tab could open `http://127.0.0.1:4477/?project=goal-loop-demo-real`, load the App, expand the right rail, click `right-tool-launcher-agent`, and observe `agent-workspace-panel` visible.
- Limitation: fresh end-to-end `new demand -> real main-agent run -> planning-agent live stream -> implement plan` was not claimed as passed in this review because running it would create more conversations in the user's acceptance project and the current task was already repairing that exact visible flow.

## Complexity Deletion Review

- delete: removed planning draft assistant-message append from the planning handler and removed ordinary planning confirm/generate cards from confirmationQueue primary.
- reuse: reused `ParentAgentTranscriptCell`, existing transcript rendering, Workbench snapshot/read-model projection, right-rail shell, existing planning action handlers, and current workflow action revalidation.
- yagni: avoided a second chat UI, child-agent runtime, new action family, new workflow truth, or automation allowlist change.
- shrink: kept planning-agent workspace as projection plus scoped existing actions instead of adding a new planning controller.
- net: Lean enough for this stage; follow-up can deepen real A-to-A streaming if real acceptance exposes more gaps.

## Coverage Notes

- Documentation entropy coverage applicable: yes. Checked `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/WORKBENCH.md` for active-path/current-flow wording.
- Experience lifecycle coverage applicable: yes. Retired the old visible experience where planning draft prose and planning confirmation lived in the main conversation / ordinary confirmationQueue; retained backend planning actions and artifact promotion.
- Read model projection coverage applicable: yes. `workbench-read-model`, `workbench-demand-worker`, and planning scheduler prep tests cover planning-agent workspace projection, planning actions, and confirmationQueue suppression.
- Workbench user-surface honesty coverage applicable: yes. `web-app` tests and partial browser DOM acceptance cover the visible Agent rail/panel and ordinary chat not being hijacked into planning actions.
- Reference-driven UI/product coverage applicable: yes. The adapted reference behavior is cc-gui style parent conversation plus side Agent workspace; no reference runtime or fake controls were imported.
- Scoped Workbench action payload coverage applicable: yes. Demand-worker/planning tests cover `planning.confirm-execution` moving to Agent workspace while preserving target payload and stale revalidation.
- Transcript renderer source-boundary coverage applicable: yes. Main transcript and Agent workspace reuse the shared transcript cell renderer; planning-agent live events are scoped with `agentRoleId` / `agentTaskId`.
- Runtime bridge boundary coverage applicable: yes. Planning Codex live events are projected to the scoped child-agent workspace; no Codex runtime authority or Harness truth changed.
- Module boundary coverage applicable: yes. Boundary tests cover no recovery of old full-sequence entries and no forbidden planning assistant prose path.
- Core mechanism reuse coverage applicable: yes. Existing transcript/read-model/action-revalidation mechanisms were reused rather than creating a new controller.
- Worktree diff artifact coverage applicable: no. This change does not alter worktree diff collection or apply behavior.
- Source apply safety coverage applicable: no. This change does not alter result review, apply/discard, or source mutation.
- Remote handoff acceptance coverage applicable: no. This change does not affect PR/remote/merge handoff.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/WORKBENCH.md`, active `summary.md`.
- Stale active-path / phase grep: active path currently names `harness/changes/active/main-agent-child-agent-workspace-flow-v2/summary.md` before close and must be updated to the archive path after close.
- Pending evolution state checked: no pending Harness evolution before close.
