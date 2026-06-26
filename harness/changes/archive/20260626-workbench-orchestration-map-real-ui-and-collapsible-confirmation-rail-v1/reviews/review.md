# Review: workbench-orchestration-map-real-ui-and-collapsible-confirmation-rail-v1

Status: completed / ready to close.

## Findings

No blocking findings.

## Verification

- Selected verification scope: frontend shell DOM behavior, existing
  orchestration graph projection/layout coverage, full fast product checks, and
  real in-app browser visual acceptance.
- Full / aggregate suites run or skipped: `npm run test:workbench` was run and
  passed because the change touches the Workbench shell / DOM contract. Slow
  scheduler/release suites were not run because no scheduler/runtime/apply
  behavior changed.
- Rationale for selected scope: the implementation changes only a frontend
  shell wrapper, App composition, CSS layout, and App DOM expectations. The
  existing `DecisionInspectorPane` action owner, confirmation queue, server
  action path, revalidation, apply/close, automation, and scheduler code were
  not changed.
- Commands:
  - `npx vitest run tests/unit/web-app.test.tsx --reporter=basic` - passed.
  - `npx vitest run tests/unit/agent-orchestration-layout.test.ts tests/unit/workbench-run-graph-projection.test.ts --reporter=basic` - passed.
  - `npm run typecheck` - passed.
  - `npm run lint` - passed.
  - `npm run test:fast` - passed.
  - `npm run build` - passed.
  - `npm run test:workbench` - passed.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.
  - Not applicable; `npm run test:workbench` completed successfully.

## Complexity Deletion Review

- Complexity deletion review applicable: yes.
- delete: none.
- reuse: reused existing `DecisionInspectorPane`, `confirmationQueue`, App
  snapshot state, lazy run-graph projection, and `AgentOrchestrationMap`.
- yagni: avoided persisted user preference, backend/SQLite memory writes, new
  action path, new projection framework, graph runtime, and custom SVG icons.
- shrink: kept the new code to one shell component plus App/CSS/test wiring;
  did not move confirmation card/action logic.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: old E-drive sandboxes restored as projects
  but had no Workbench topics in the direct snapshot, so a fresh E-drive UI
  acceptance sandbox was created.
- Screenshots / artifacts / run ids:
  - URL: `http://127.0.0.1:4363/`.
  - Source: `E:\aho-accept\orchestration-map-ui-v1\src`.
  - Runtime home: `E:\aho-accept\orchestration-map-ui-v1\home`.
  - `01-collapsed-rail.png`: default `app-shell decision-pane-collapsed`;
    rail visible; primary card not mounted.
  - `02-agent-orchestration-map.png`: `Agent 编排图` canvas visible with
    avatar cards, status dots, SVG edges, and zoom/fit controls.
  - `03-expanded-confirmation-pane.png`: expanded pane visible with real
    planning confirmation primary gate.
  - Run graph route returned 2 nodes / 2 edges, including `main-agent` and
    `planning-agent`.
  - Planning evidence run: `run-20260626-220907-agent-0b1a1b`.
- External source/state safety: the E-drive source was used only as a temporary
  visual acceptance project. The rail toggle, graph tab click, and pane expand
  did not execute workflow actions, source apply/close, scheduler, remote,
  merge, PR, or Harness evolution.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes for close/handoff pointer
  updates.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts:
  `AGENTS.md` 169 -> 172, `docs/STATUS.md` 347 -> 357,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 233 -> 233.
- If applicable, duplicate current-state fields checked: latest product change
  and active/pending state will be aligned during closeout; detailed screenshot
  evidence stays archive-only.
- If applicable, roadmap/current-direction stale language checked: next
  direction will remain generic and will not claim new workflow runtime.
- If applicable, archive-ledger content promoted / retained / merged /
  retired / archive-only: screenshot paths, run ids, and E-drive sandbox
  details are archive-only except for a compact baseline note.
- If applicable, over-budget documents and rationale: `docs/STATUS.md` is
  already over compact handoff size because it carries current archived
  pointers; this change adds only a small current closeout note.
- If applicable, tested with: `lint-ecl`, `lint-encoding`,
  `harness-change reindex/status`, `harness-evolve check`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or handoff change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: Workbench shell, collapsed confirmation rail,
  expanded `DecisionInspectorPane`, and `Agent 编排图`.
- If applicable, visible primary UI backed by implemented workflow paths:
  confirmation buttons are only present in the expanded existing
  `DecisionInspectorPane`; the collapsed rail is a toggle only.
- If applicable, authoritative primary-surface alignment checked across
  confirmation queue / decision inspector / visible primary card: real browser
  expanded pane showed the existing planning confirmation gate from the
  authoritative queue. No second primary card appeared while collapsed.
- If applicable, stale-history override and running/archived selected-demand
  suppression checked: not changed by this shell-only update.
- If applicable, out-of-scope future capability check: DOM tests and real UI
  acceptance did not expose fake full-auto, remote/merge, or action execution
  from graph nodes.
- If applicable, forbidden visible internal terms/actions checked: existing
  graph and transcript tests continue to cover forbidden internal workflow
  text; the new shell adds no internal runtime terms.
- If applicable, duplicate primary action / in-flight suppression check:
  collapsed rail unmounts the primary card, and the DOM test verifies toggling
  does not submit `/workbench/actions`.
- If applicable, high-impact action path result: unchanged; shell toggle does
  not dispatch actions.
- If applicable, real App DOM / browser UI verification result when the
  behavior is product-visible: three in-app browser screenshots captured.
- If applicable, projection/unit evidence that supplements but does not
  replace visible-surface acceptance: web DOM tests cover collapsed/expanded
  rail, no action submit, and graph rendering with collapsed rail.
- If applicable, tested with: `tests/unit/web-app.test.tsx`, real browser
  screenshots.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If applicable, canonical transcript projection checked: not applicable.
- If applicable, assistant markdown source checked: not applicable.
- If applicable, process/tool row compactness checked: not applicable.
- If applicable, derived workflow summary exclusion checked: not applicable.
- If applicable, worker/role transcript scoping checked: not applicable.
- If applicable, private chain-of-thought exclusion checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked runtime home / external managed-project isolation: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module:
  `src/web/src/panels/workbench/DecisionPaneShell.tsx`.
- If applicable, module owners checked: `DecisionPaneShell` owns layout/toggle;
  `DecisionInspectorPane` remains confirmation card/action owner.
- If applicable, moved responsibilities: none. Existing confirmation/action
  logic was not moved.
- If applicable, retained facade responsibilities: `App.tsx` composes shell and
  passes existing props; `WorkbenchPanels.tsx` remains export surface only.
- If applicable, forbidden write-back locations: no backend routes, action
  handlers, projection builders, SQLite stores, or graph projection code were
  changed for shell behavior.
- If applicable, compatibility surface: no API/projection/action payload shape
  changed.
- If applicable, behavior path tested: App DOM collapsed, expand, collapse,
  graph rendering with rail collapsed.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: `tests/unit/web-app.test.tsx`.
- If applicable, compatibility result: compatible.
- If applicable, tested with: targeted DOM tests plus build/typecheck.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing
  confirmation queue, `DecisionInspectorPane`, App snapshot state, lazy
  run-graph projection, and `AgentOrchestrationMap`.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: only a shell
  wrapper was missing for compact layout; confirmation mechanisms were already
  sufficient.
- If applicable, domain-specific logic location: rail layout and count display
  live in `DecisionPaneShell` / App shell.
- If applicable, shared cross-cutting logic location: confirmation authority
  remains in existing queue/read-model/action owners.
- If applicable, local framework / state machine / projection / validation /
  gate avoided: no persisted preference, no new projection system, no action
  duplication.
- If applicable, public API / facade / Workbench compatibility result:
  compatible.
- If applicable, future-cost reduction result: future shell polish can stay in
  the shell without touching workflow logic.
- If applicable, tested with: DOM tests, build/typecheck.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: `rg -n
  "harness/changes/active|workbench-rudder-style-agent-orchestration-map-v1"
  AGENTS.md docs\STATUS.md docs\CURRENT-DEVELOPMENT-PLAN.md` found only the
  generic context-loading active path and the intended previous-archive
  references.
- If applicable, latest archive / active path alignment: handoff docs now point
  at the expected archive path
  `harness/changes/archive/20260626-workbench-orchestration-map-real-ui-and-collapsible-confirmation-rail-v1/summary.md`;
  final filesystem alignment will be checked after `harness-change close`.
- If applicable, pending evolution state checked: no pending evolution before
  closeout.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

