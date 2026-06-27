# Review: workbench-reference-style-codex-runtime-model-picker-v1

Status: ready.

## Findings

No blocking findings.

## Verification

Passed.

- Selected verification scope:
  - `npx vitest run tests/unit/codex.test.ts`
  - `npx vitest run tests/unit/web-app.test.tsx --testNamePattern "Codex model|selected project"`
  - `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `npm run test:workbench`
- Full / aggregate suites run or skipped: product aggregate `test:fast`, build,
  and Workbench aggregate unit suite passed. Slow/release Workbench suites were
  not run because this change is limited to Codex model settings, project
  restore UI state, and model-picker surface, not scheduler/apply/Goal Loop
  runtime behavior.
- Rationale for selected scope: covered Codex TOML/runtime candidate handling,
  Workbench model route, composer model picker DOM, selected-project restore,
  and existing Workbench projection contracts.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed the visible custom model add/remove path from the picker and
  stopped surfacing legacy custom candidates.
- reuse: existing Codex settings owner, Workbench API router, project
  diagnostics/model route, composer controls, and localStorage-only UI state.
- yagni: avoided provider capability matrix, API-provider model mapping, fake
  provider dropdowns, and a new model registry.
- shrink: kept `customModels` only as compatibility cleanup in the existing
  settings schema instead of adding a migration subsystem.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes for runtime model-list UI evidence.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: PowerShell sandbox setup needed two command
  syntax corrections; browser and product path then worked.
- Screenshots / artifacts / run ids:
  - `E:\aho-accept\codex-runtime-model-picker-v1\model-picker-viewport.png`
  - `E:\aho-accept\codex-runtime-model-picker-v1\restored-project-model-picker.png`
- External source/state safety: external source
  `E:\aho-accept\codex-runtime-model-picker-v1\src`; runtime home
  `E:\aho-accept\codex-runtime-model-picker-v1\home`. UI Harness
  initialization wrote external `.agent-harness/` and `AGENTS.md` only. No
  workflow action, source apply, close, scheduler, remote, merge, PR, or
  Harness evolution ran.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: no. Change to `yes` when this change updates `AGENTS.md`, `docs/STATUS.md`, Harness rules/templates, auto-evolve evidence, or other current-state / handoff documents.
- If applicable, documents checked: not applicable.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: not applicable.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not alter docs, handoff files, current-state wording, Harness rules/templates, or auto-evolve evidence.

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
- If applicable, sampled surface: composer model control and Codex model picker.
- If applicable, visible primary UI backed by implemented workflow paths:
  model selection updates only runtime preference through the existing model
  route; it does not claim workflow authority.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: not applicable.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: no custom model entry,
  no Claude/OpenCode/Gemini provider dropdown, and no fake API-provider model
  mapping.
- If applicable, forbidden visible internal terms/actions checked: not applicable.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible:
  in-app browser on `http://127.0.0.1:4373/` showed
  `Codex / gpt-5.5 / 逐步确认|自动推进`, picker runtime candidates, no
  custom-model entry, and selected project restored after browser refresh.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance:
  targeted DOM and server tests passed.
- If applicable, tested with:
  `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`;
  real in-app browser acceptance.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` Engine / Provider, Codex bridge,
  Settings, and App shell sections.
- If applicable, reference source files or inspected commit used:
  - `reference-projects/desktop-cc-gui/src-tauri/src/codex/model_selection.rs`
  - `reference-projects/desktop-cc-gui/src-tauri/src/codex/thread_listing.rs`
  - `reference-projects/desktop-cc-gui/src-tauri/src/shared/codex_core.rs`
  - `reference-projects/desktop-cc-gui/src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`
  - `reference-projects/desktop-cc-gui/src/app-shell-parts/selectedComposerSession.ts`
- If applicable, controls copied / adapted / intentionally omitted:
  adapted runtime/config-backed model candidates and per-workspace UI
  selection persistence; intentionally omitted arbitrary custom model entry,
  fake provider dropdowns, and non-Codex provider controls.
- If applicable, fake-control check: browser DOM confirmed no custom model
  entry and no Claude/OpenCode/Gemini strings.
- If applicable, tested with: targeted DOM/server tests and real browser UI.
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

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Codex model candidates come from runtime
  `model/list`, Codex config, or Codex default; model preference is runtime UI
  setting only and is not Harness truth.
- If applicable, tested with:
  `tests/unit/codex.test.ts`, `tests/unit/workbench-server.test.ts`, and real
  UI model picker evidence.
- If not applicable, reason: not applicable.

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
- Future feature owner module: not applicable.
- If applicable, module owners checked: `src/codex/model-settings.ts`,
  `src/server/workbench/api-router.ts`, `src/web/src/App.tsx`, and
  `src/web/src/panels/ProjectHome.tsx`.
- If applicable, moved responsibilities: none; responsibilities stayed in
  existing model settings, API route, and composer/picker owners.
- If applicable, retained facade responsibilities: Workbench API validates
  selected model against real current candidates; UI only renders candidates
  and persists project selection as frontend preference.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: config/runtime candidate snapshot,
  POST selected model validation, picker DOM, selected project restore.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: targeted Codex/server/web tests.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: Codex model
  settings snapshot, Workbench API routes, composer controls, reference-driven
  localStorage UI preference.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided:
  avoided new model registry, provider matrix, workflow evidence, permission
  system, or workflow gate.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: not applicable.
- If applicable, tested with: targeted Codex/server/web tests and real UI.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: latest handoff now points to
  the expected archive path
  `harness/changes/archive/20260627-workbench-reference-style-codex-runtime-model-picker-v1/summary.md`.
- If applicable, latest archive / active path alignment: handoff points to the
  archive path that `harness-change close` will create.
- If applicable, pending evolution state checked: no pending evolution at start
  of this change.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

