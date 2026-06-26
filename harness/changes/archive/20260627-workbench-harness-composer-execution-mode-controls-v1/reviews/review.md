# Review: workbench-harness-composer-execution-mode-controls-v1

Status: complete.

## Findings

None.

## Verification

Passed:

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts tests/unit/codex.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Scope rationale: this change touches Workbench web shell / composer session
state, Codex diagnostics display, right-pane confirmation rendering, and
planning-confirmation payloads. Targeted DOM/server/Codex tests plus the
Workbench unit aggregate cover the changed boundary without needing slow
release suites.

## Complexity Deletion Review

- delete: removed the right-pane independent mode selector instead of keeping
  two competing mode controls.
- reuse: reused existing `postPlanAutomationMode`, scoped automation,
  `DecisionPanels`, project-home/topic composers, and Codex diagnostics.
- yagni: avoided provider matrix, fake model dropdown, model catalog
  persistence, normal Agent mode, new permission system, and new workflow
  runtime.
- shrink: kept persistence as frontend localStorage because execution mode is
  UI session preference, not Harness truth.
- net: Lean already.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: PowerShell fixture setup had two local
  command-shape retries; no product behavior failure.
- Screenshots / artifacts:
  - `E:\aho-accept\harness-composer-mode-v1\screenshots\home-composer-step-mode.png`
  - `E:\aho-accept\harness-composer-mode-v1\screenshots\home-composer-auto-mode.png`
  - `E:\aho-accept\harness-composer-mode-v1\screenshots\home-composer-auto-mode-after-reload.png`
  - `E:\aho-accept\harness-composer-mode-v1\screenshots\active-topic-composer-auto-mode.png`
  - `E:\aho-accept\harness-composer-mode-v1\screenshots\active-topic-confirmation-expanded.png`
- External source/state safety: UI-only acceptance on
  `E:\aho-accept\harness-composer-mode-v1\src`; no source apply, close,
  scheduler, remote, merge, PR, or Harness evolution action was executed.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: project-home composer, active-topic composer, collapsed /
  expanded right confirmation pane.
- Result: composer shows `Codex / gpt-5.5 / 逐步确认|自动推进`; mode switch is
  always clickable and remains selected after reload. The right confirmation
  card shows only the real current gate (`生成方案草案`) and no independent mode
  selector.
- Fake-control check: unsupported toolbar, recent-session, fake provider/model
  dropdown, attachment, remote, merge, and PR controls were not visible on the
  verified surface.
- Tested with: `tests/unit/web-app.test.tsx` and real in-app browser at
  `http://127.0.0.1:4349`.

## Reference-Driven UI / Product Source Evidence Coverage

- Applicable: yes.
- Reference map inspected: `docs/design-docs/ref-desktop-cc-gui.md`.
- Reference adaptation: adapted the `Codex / model / mode` composer strip while
  keeping AHO Harness semantics (`逐步确认` / `自动推进`) and hiding unimplemented
  toolbar/model-provider affordances.
- Boundary: reference UI is interaction evidence only; it does not replace AHO
  Change/artifact/validation/audit/apply/close truth.
- Tested with: DOM tests and screenshots listed above.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: planning bundle id, decomposition plan id, selected
  Change id, and scoped automation current-gate ids.
- Result: `planning.confirm-execution` carries the current composer
  `postPlanAutomationMode`; request-approval does not start post-plan
  automation, and full-access remains scoped to existing local allowed gates.
- Tested with: `tests/unit/web-app.test.tsx`.

## Module Boundary Coverage

- Applicable: yes.
- Owners:
  - `src/web/src/shell/composer-session.ts` owns frontend-only mode storage.
  - `src/web/src/shell/ComposerControls.tsx` owns shared composer controls.
  - `src/server/workbench/codex-diagnostics.ts` / `src/codex/trust.ts` own
    read-only Codex model diagnostics.
  - `DecisionPanels` remains the confirmation/action owner.
- Avoided: moving mode persistence into Harness memory, SQLite workflow truth,
  Workbench action handlers, or a new permission layer.
- Tested with: typecheck, lint, DOM tests, Workbench aggregate.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- Active path: both point to
  `harness/changes/active/workbench-harness-composer-execution-mode-controls-v1/summary.md`
  before close.
- Pending evolution: `harness-evolve check` reports no pending evolution.

## Not Applicable Coverage

- Transcript renderer source-boundary: not changed.
- Source apply safety: no source apply/discard behavior changed.
- Runtime bridge boundary: no executor/provider bridge behavior changed beyond
  read-only Codex model diagnostics.
- Proposal / runtime boundary: no planning artifact authority changed.
- Goal Loop boundary: no Goal Loop decision/runtime behavior changed.
- Remote handoff acceptance: not changed.
