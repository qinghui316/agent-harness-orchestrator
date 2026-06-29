# Review: workbench-provider-capability-registry-v1

Status: approved.

## Findings

No blocking findings.

Notes:

- The registry is read-only readiness/projection state. It does not participate
  in permission decisions, action dispatch, source mutation, or Harness gates.
- V1 returns only Codex/Harness as runnable; future providers are represented by
  type shape only, not fake UI controls.

## Verification

- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- Harness checks run: `lint-encoding` passed, `harness-evolve check` passed.
- Selected verification scope: provider snapshot aggregation, Codex runtime
  metadata, Workbench Settings UI, and existing Workbench aggregate unit suite.
- Full / aggregate suites run or skipped: `test:fast`, `build`, and
  `test:workbench` were run; slow/release Workbench suites were not needed
  because this change does not alter action execution, scheduler, apply/close,
  remote, or source mutation paths.
- Rationale for selected scope: the touched boundary is Codex readiness
  projection, settings display, and Codex run metadata. The broader Workbench
  unit suite covers shell/read-model regressions without invoking slow
  scheduler/release acceptance.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing Codex diagnostics, model settings, app-server/model-list,
  Skills, attachment readiness, Workbench settings shell, and run event owners.
- yagni: avoided provider switching, provider catalog UI, provider authority
  model, new permission layer, new workflow engine, and duplicate Codex
  diagnostics.
- shrink: implemented a small registry/readiness adapter instead of refactoring
  Codex runtime owners or moving provider checks into Workbench UI.
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

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: Settings reads provider capability API and
  renders Codex matrix without fake provider controls.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx`,
  `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: Settings / Codex capability matrix and
  composer provider/model strip.
- If applicable, visible primary UI backed by implemented workflow paths:
  Codex-only readiness information and model picker remain backed by existing
  Codex diagnostics/model APIs.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation surfaces unchanged.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable; no primary gate change.
- If applicable, out-of-scope future capability check: Settings and composer do
  not expose Claude/OpenCode/Gemini or fake provider dropdowns.
- If applicable, forbidden visible internal terms/actions checked: provider
  readiness appears only as user-readable capability status.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx`,
  `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` engine/provider sections.
- If applicable, reference source files or inspected commit used:
  `reference-projects/desktop-cc-gui/src-tauri/src/engine/capability_matrix.rs`,
  `reference-projects/desktop-cc-gui/src/features/engine/engineCapabilityMatrix.ts`,
  `reference-projects/desktop-cc-gui/src/features/engine/EngineSelector.tsx`.
- If applicable, controls copied / adapted / intentionally omitted: adapted
  capability/readiness matrix shape; intentionally omitted provider switcher
  because AHO V1 has only Codex/Harness runnable.
- If applicable, fake-control check: composer still shows only Codex/model/mode;
  Settings shows Codex capability matrix only.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx`.
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
- If applicable, checked boundary: provider registry reuses Codex diagnostics,
  model settings, app-server/model-list, Skills, and attachments without
  replacing execution paths or bridge materialization.
- If applicable, tested with: `npx vitest run tests/unit/codex.test.ts
  tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`.
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
- Future feature owner module: `src/provider-runtime/`.
- If applicable, module owners checked: provider-runtime owns aggregation and
  metadata helpers; Codex runtime owners remain source of facts.
- If applicable, moved responsibilities: none; diagnostics/model/Skills owners
  remain in place.
- If applicable, retained facade responsibilities: Workbench API only exposes
  the read-only snapshot.
- If applicable, forbidden write-back locations: no SQLite, memory, source root,
  settings, or Harness truth writes from capability snapshot reads.
- If applicable, compatibility surface: existing composer/model picker and
  settings remain compatible.
- If applicable, behavior path tested: provider API, settings matrix, Codex run
  metadata helper.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: targeted Vitest, typecheck, lint, test:fast,
  build, test:workbench.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: Codex diagnostics,
  model settings, model-list, Skills, attachments, Workbench Settings, run
  events.
- If applicable, new cross-cutting mechanism and owner:
  `src/provider-runtime/` only aggregates readiness and run metadata.
- If applicable, why existing mechanisms were insufficient: they were
  feature-local and did not provide one stable provider capability snapshot for
  Settings/future provider tracks.
- If applicable, domain-specific logic location: Codex capability adaptation in
  `src/provider-runtime/codex.ts`.
- If applicable, shared cross-cutting logic location:
  `src/provider-runtime/types.ts` and `run-metadata.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no workflow runtime, permission system, provider switcher, or new gate.
- If applicable, public API / facade / Workbench compatibility result:
  project-scoped provider capability API is additive.
- If applicable, future-cost reduction result: future provider work can plug
  into the registry without adding fake controls or spreading provider checks
  across UI components.
- If applicable, tested with: targeted Vitest, typecheck, lint, test:fast,
  build, test:workbench.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: no. Change to `yes` when this change alters active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended work.
- If applicable, handoff files checked: not applicable.
- If applicable, stale active-path / phase grep: not applicable.
- If applicable, latest archive / active path alignment: not applicable.
- If applicable, pending evolution state checked: not applicable.
- If not applicable, reason: change does not alter active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended track.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
