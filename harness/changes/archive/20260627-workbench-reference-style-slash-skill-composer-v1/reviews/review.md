# Review: workbench-reference-style-slash-skill-composer-v1

Status: complete.

## Findings

No correctness, authority, source-safety, or reference-alignment issues found.

## Verification

Passed.

- Selected verification scope: Skill mention parser, Workbench DOM composer,
  Skill bridge, Workbench server, Codex diagnostics, fast regression, build,
  and Workbench aggregate unit gate.
- Full / aggregate suites run or skipped: `npm run test:fast` and
  `npm run test:workbench` both ran and passed; slow/release suites were not
  needed because this change did not alter Scheduler, apply/close, runtime
  execution, or source mutation contracts.
- Rationale for selected scope: the changed boundary is product-visible
  composer selection plus existing Skill enablement / Codex bridge context, not
  workflow action execution.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing Skills API, topic enablement, Codex bridge, composer shell,
  Workbench project/topic state, and existing tests.
- yagni: avoided full slash-command registry, marketplace, provider/model
  dropdown, file/attachment controls, new Skill storage, new permission system,
  and new runtime/evidence layer.
- shrink: kept parsing as a small token helper instead of a markdown/AST parser
  or copied reference prompt assembler.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
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
- If applicable, sampled surface: home composer and selected topic composer.
- If applicable, visible primary UI backed by implemented workflow paths: `/`
  and `$` suggestions are backed by real scanned Skills from
  `/api/projects/:id/skills`; topic enablement uses the existing
  `/api/projects/:id/skills/:skillId/enable` route.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: not applicable.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: no marketplace, fake
  provider/model dropdown, file reference, attachment, or complete slash command
  controls were introduced.
- If applicable, forbidden visible internal terms/actions checked: composer
  remains user-facing and does not expose raw workflow internals.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx -t
  "slash Skill|dollar Skill" --reporter=dot` and full
  `tests/unit/web-app.test.tsx` in targeted suite.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` Skills / composer / product-layer
  guidance.
- If applicable, reference source files or inspected commit used:
  `reference-projects/desktop-cc-gui/src/features/composer/utils/inlineSelections.ts`,
  `reference-projects/desktop-cc-gui/src/features/composer/hooks/useComposerAutocompleteState.ts`,
  `reference-projects/desktop-cc-gui/src/features/composer/components/Composer.tsx`,
  and `reference-projects/desktop-cc-gui/src/features/composer/utils/promptAssembler.ts`.
- If applicable, controls copied / adapted / intentionally omitted: adapted
  `/skill` and `$skill` inline selection, selected Skill state, and cleaned
  prompt submission; intentionally omitted full command registry, attachments,
  file references, provider/model controls, marketplace, and prompt assembly
  replacement because AHO already has topic enablement and Codex bridge owners.
- If applicable, fake-control check: suggestions only show real scanned Skills;
  unmatched tokens remain plain text; unsynced Skills show `需要同步` instead of
  pretending to be runtime-ready.
- If applicable, tested with: DOM and parser tests listed in verification.
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
- If applicable, checked boundary: selected Skills are enabled through the
  existing Skill catalog/Codex bridge mechanism; AHO does not execute Skill
  scripts and does not make Skill selection workflow authority.
- If applicable, tested with:
  `tests/unit/skill-bridge.test.ts`, `tests/unit/workbench-server.test.ts`, and
  `tests/unit/codex.test.ts`.
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
- Future feature owner module: existing Workbench web shell / Skills API; no new
  runtime owner.
- If applicable, module owners checked:
  `src/web/src/shell/skill-mentions.ts`,
  `src/web/src/shell/SkillMentionPicker.tsx`, existing `App.tsx` state wiring,
  existing ProjectHome/TopicComposer owners, and existing Skill bridge/server
  routes.
- If applicable, moved responsibilities: not applicable.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: targeted parser, DOM, server, bridge, Codex,
  `test:fast`, build, and `test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: project Skill
  scanning, topic enablement, Codex bridge materialization, composer controls,
  and Workbench project/topic state.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new Skill runtime, no slash command registry, no provider matrix,
  no workflow projection, no permission system, no evidence family.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: not applicable.
- If applicable, tested with: targeted and aggregate verification listed above.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: summary/tasks/review updated before
  Harness checks; docs handoff will be updated by close/archive flow if needed.
- If applicable, stale active-path / phase grep: covered by
  `harness-change status` before close.
- If applicable, latest archive / active path alignment: pending close command.
- If applicable, pending evolution state checked: `harness-evolve check`.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

