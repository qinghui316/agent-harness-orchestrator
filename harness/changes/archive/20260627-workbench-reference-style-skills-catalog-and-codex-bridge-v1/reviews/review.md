# Review: workbench-reference-style-skills-catalog-and-codex-bridge-v1

Status: approved / ready to close.

## Findings

No blocking findings.

## Verification

- `npx vitest run tests/unit/skill-bridge.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/codex.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx tests/unit/skill-bridge.test.ts tests/unit/workbench-server.test.ts`
- `npx vitest run tests/integration/cli-flow.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

- Selected verification scope: Skill catalog/bridge, Workbench API, Settings /
  composer DOM, CLI import/sync compatibility, daily fast suite, and Workbench
  aggregate.
- Full / aggregate suites run or skipped: daily fast and Workbench aggregate
  passed; slow/release scheduler suites were not needed because this change does
  not alter scheduler runtime, source apply, validation/audit, or Goal Loop
  execution.
- Rationale for selected scope: the touched boundaries are runtime skill
  catalog/bridge materialization, Workbench settings/composer surface, and
  persisted project/topic enablement.
- If an aggregate Workbench / slow suite exceeded the tool window: no timeout.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed the old narrow `SKILL.md`/`references`/`examples` copy
  assumption and the accidental implicit global-Codex-skill scan from the V1
  UI path.
- reuse: existing `src/skill/catalog.ts`, Codex bridge materialization,
  `WorkbenchStore`, project/topic enablement, Workbench API, Settings shell, and
  composer controls.
- yagni: avoided marketplace, `$skill` completion, provider/model dropdowns,
  a second permission system, direct script execution, and any workflow truth
  migration.
- shrink: kept Skill roots/source scanning in the existing catalog owner and
  used one small Settings panel instead of a new Skills app/shell.
- net: Lean already for V1; follow-up features are separate backlog items.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first browser acceptance attempts used the
  default user `AHO_HOME`; restarted with E-drive `AHO_HOME` and `CODEX_HOME`.
  Real UI exposed an immediate composer indicator refresh gap after enabling a
  Skill; fixed in `SkillsPanel`.
- Screenshots / artifacts / run ids:
  - URL: `http://127.0.0.1:4363/`
  - Source: `E:\aho-accept\skills-catalog-v1\src`
  - Runtime home: `E:\aho-accept\skills-catalog-v1\home`
  - Codex home: `E:\aho-accept\skills-catalog-v1\codex-home`
  - Screenshot: `E:\aho-accept\skills-catalog-v1\screenshots\skills-settings-synced.png`
  - Bridge package:
    `E:\aho-accept\skills-catalog-v1\codex-home\plugins\aho-managed\skills\skillscatalog__pricing-helper`
- External source/state safety: the E-drive source was initialized for Harness
  acceptance and showed only setup-owned `.agent-harness/` and `AGENTS.md`.
  The Skill Settings flow did not run workflow actions, apply/close, scheduler,
  remote, merge, PR, Harness evolution, or execute Skill scripts.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: follow-ups remain
  `workbench-composer-skill-mention-v1`,
  `workbench-skill-runtime-usage-evidence-v1`,
  `workbench-codex-model-settings-v1`, and
  `workbench-provider-capability-matrix-v1`.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/BOUNDARIES.md`, `docs/RUNTIME.md`.
- If applicable, before/after line counts after close/handoff edit: `AGENTS.md`
  249, `docs/STATUS.md` 479, `docs/CURRENT-DEVELOPMENT-PLAN.md` 278.
- If applicable, duplicate current-state fields checked: latest product archive
  and active/pending fields will be aligned before close.
- If applicable, roadmap/current-direction stale language checked: current plan
  now states Skills settings are implemented and `$skill` completion /
  marketplace / unsupported controls remain future work.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: retained only current behavior; real UI screenshot paths stay in active/archive summary.
- If applicable, over-budget documents and rationale: `AGENTS.md` and
  `docs/STATUS.md` remain over the target budget from prior baseline; this
  closeout adds only a compact current-state delta.
- If applicable, tested with: Harness docs checks below.
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
- If applicable, sampled surface: Settings `技能` panel and composer Skill
  indicator.
- If applicable, visible primary UI backed by implemented workflow paths: all
  visible controls call real APIs: add root, refresh, enable/disable, sync
  Codex bridge, open Settings from composer.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: not applicable.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: no fake marketplace,
  provider/model dropdown, `$skill` completion, file/terminal/attachment, or
  direct script execution control is shown.
- If applicable, forbidden visible internal terms/actions checked: the panel
  describes Skills as Codex runtime capability and not Harness workflow
  permission; it does not expose `TaskRun`, `WorkerLease`, raw scheduler,
  apply/close, remote, merge, PR, or Harness evolution controls.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: real browser verified custom root, scanned `pricing-helper`, enabled, synced, composer `技能 1`, and Settings reopening from the composer indicator.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-server.test.ts`, and real API response from `/api/projects/skillscatalog/skills`.
- If applicable, tested with: commands listed under Verification plus real UI acceptance.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected: `docs/design-docs/ref-desktop-cc-gui.md` Skills / MCP / Tool Discovery.
- If applicable, reference source files or inspected commit used:
  `reference-projects/desktop-cc-gui/src/features/settings/components/SettingsView.tsx`,
  `SkillsSection.tsx`, `CuratedSection.tsx`,
  `CuratedSkillIndicator.tsx`, `src-tauri/src/skills.rs`,
  `src-tauri/src/backend/app_server_cli.rs`,
  `src-tauri/src/curated_skills.rs` at inspected commit
  `49a69c373c1fe34e0da56516ae5134007d485fd8`.
- If applicable, controls copied / adapted / intentionally omitted: adapted
  Settings-surface roots/list/enable/sync and composer indicator; omitted
  marketplace, `$skill` completion, fake provider/model, and other unfinished
  toolbar controls.
- If applicable, fake-control check: real UI and DOM showed only implemented
  Skill controls; unsupported controls remained hidden.
- If applicable, tested with: web DOM tests and real browser acceptance.
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
- If applicable, checked boundary: Skill catalog/roots/enablement live in
  Workbench SQLite as runtime interaction/configuration state; Codex bridge
  under `$CODEX_HOME/plugins/aho-managed` is a rebuildable runtime projection;
  Harness Change/artifacts/validation/audit/apply/close remain workflow truth.
  Skill scripts are copied as package content but not executed by AHO.
- If applicable, tested with: skill bridge unit tests, Workbench server routes,
  CLI import/sync integration test, and real bridge directory inspection.
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
- Future feature owner module: `src/skill/catalog.ts` for catalog/source
  scanning and manifest safety, `src/codex/bridge.ts` for bridge paths/status,
  `WorkbenchStore` for roots/enablement/sync records, Settings panel for UI.
- If applicable, module owners checked: yes.
- If applicable, moved responsibilities: none moved; existing skill owner was
  extended with roots and safe package manifests.
- If applicable, retained facade responsibilities: Workbench API only forwards
  to catalog/bridge owners.
- If applicable, forbidden write-back locations: no writes to Change artifacts,
  confirmation queue, validation/audit/apply/close records, reference projects,
  or source roots except explicit E-drive acceptance setup and bridge projection.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: targeted unit/DOM/server tests and aggregate
  suites listed above.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing skill
  catalog, Codex bridge, WorkbenchStore, project/topic enablement, Settings, and
  composer controls.
- If applicable, new cross-cutting mechanism and owner: no new cross-cutting
  mechanism; roots/source kinds are an extension of the skill catalog owner.
- If applicable, why existing mechanisms were insufficient: existing catalog
  lacked custom roots and full legal package manifest handling.
- If applicable, domain-specific logic location: `src/skill/catalog.ts`.
- If applicable, shared cross-cutting logic location: Codex bridge status and
  materialization remain in the Codex bridge owner.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoided.
- If applicable, public API / facade / Workbench compatibility result: existing
  CLI import/list/enable and Workbench routes remain compatible; scripts are now
  legal package content.
- If applicable, future-cost reduction result: future `$skill` completion and
  provider targets can reuse the same catalog and enablement records.
- If applicable, tested with: listed verification.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked for active path and
  latest skills wording before close.
- If applicable, latest archive / active path alignment: updated to
  `harness/changes/archive/20260627-workbench-reference-style-skills-catalog-and-codex-bridge-v1/summary.md` before close.
- If applicable, pending evolution state checked: no pending evolution before
  close.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
