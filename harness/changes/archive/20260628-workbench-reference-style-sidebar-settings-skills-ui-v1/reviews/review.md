# Review: workbench-reference-style-sidebar-settings-skills-ui-v1

Status: reviewed.

## Findings

No blocking findings.

## Verification

Passed:

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts tests/unit/skill-bridge.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Mojibake scan over touched source/tests/change files: no matches.

Slow/release Workbench suites were not run because this change only moves the
product shell/settings/Skills UI. It does not change scheduler, validation,
audit, source apply, close, remote, or Harness evolution behavior.

## Complexity Deletion Review

- delete: removed the old right-side settings drawer and inline project-home
  Skills panel instead of keeping parallel settings surfaces.
- reuse: reused `ProjectConversationSidebar`, `ComposerControls`,
  `WorkspacePicker`, `ProjectAddForm`, `ProjectCreateForm`, `CodexModelPicker`,
  existing Skills APIs, and existing composer file/skill state.
- yagni: avoided a new settings store, provider matrix, marketplace, full
  settings framework, new Skill storage, workflow actions, or right-rail
  settings drawer.
- shrink: settings are a small center `SettingsSurface`; Skills are one
  dedicated view under settings rather than multiple ordinary-page widgets.
- net: removed duplicate settings/skills surface paths while adding focused
  owners for the new layout.

## Acceptance Feedback

- Real/manual acceptance performed: yes, with a real Workbench server and
  E-drive sandbox.
- Real Codex acceptance claimed: no.
- Manual config edits: none.
- Retries or environment failures: in-app browser connector failed before
  asset bootstrap with `failed to write kernel assets`; fallback one-time
  browser acceptance used system Chrome/Edge through bundled Playwright
  dependencies without adding project dependencies.
- Screenshots / artifacts:
  `E:\aho-accept\reference-sidebar-settings-skills-v1\screenshots\01-home.png`,
  `02-project-menu.png`, `03-settings-project.png`,
  `04-settings-skills.png`.
- External source/state safety: not applicable; UI-only acceptance did not run
  Agent workflow actions.
- Remote handoff acceptance: not applicable.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`.
- Result: only active-change pointers were updated. No archive ledger content
  was promoted into current handoff docs.
- Tested with: `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`,
  `scripts/harness-change.ps1 status`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: home composer, left project/session sidebar, project menu
  popover, center settings surface, Skills settings category.
- Visible primary UI backed by implemented paths: settings and Skills controls
  call existing project/skill APIs only; no fake provider, terminal, browser,
  marketplace, file edit, Git write, PR, remote, merge, or Harness evolution
  controls were added.
- Confirmation boundary: right rail confirmation owner was not changed; settings
  and sidebar controls do not render workflow confirmation buttons.
- Real UI result: screenshots captured under
  `E:\aho-accept\reference-sidebar-settings-skills-v1\screenshots`; DOM summary
  confirmed settings surface and `demo-skill`, with no fake terminal/browser or
  marketplace text.
- Tested with: `tests/unit/web-app.test.tsx`, real browser screenshots.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- Reference map inspected: `docs/design-docs/ref-desktop-cc-gui.md`.
- Reference source inspected:
  `reference-projects/desktop-cc-gui/src/features/settings/components/SettingsView.tsx`,
  `reference-projects/desktop-cc-gui/src/features/settings/components/SkillsSection.tsx`,
  `reference-projects/desktop-cc-gui/src/features/app/components/SidebarWorkspaceMenuOverlay.tsx`,
  `reference-projects/desktop-cc-gui/src/features/app/components/WorkspaceCard.tsx`.
- Adapted: center settings categories, Skills management page, lightweight
  project menu, sparse home composer.
- Intentionally omitted: normal Agent-mode controls, fake provider/model
  dropdowns, marketplace, terminal/browser/attachment affordances, and
  reference write-capable features.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: Skills remain Codex runtime capabilities managed by the
  existing catalog/bridge APIs. The UI move did not change bridge
  materialization, run context, script execution policy, or Harness workflow
  truth.
- Tested with: `tests/unit/skill-bridge.test.ts`,
  `tests/unit/workbench-server.test.ts`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- New owners: `src/web/src/panels/SettingsSurface.tsx` and
  `src/web/src/panels/SkillsSettingsView.tsx`.
- Retained owners: `App.tsx` stays orchestration/state glue; `ProjectHome`
  keeps sparse home/composer surfaces; `sidebar.tsx` keeps project/session
  navigation; right rail remains confirmation/files/Git.
- Tested with: `npm run typecheck`, `npm run lint`, targeted web DOM tests.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: registered project APIs, Harness
  init/trust buttons, Codex model picker, Skills catalog/bridge APIs, composer
  mode/file/skill controls, and right rail confirmation/tool boundaries.
- Avoided: workflow runtime, permission system, settings database, Skill storage
  replacement, or projection framework.
- Tested with: targeted web/server/skill tests and aggregate Workbench tests.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- Reason: change does not affect result review, worktrees, apply/discard flows,
  integration checks, or source-root apply handoff.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- Reason: change does not add or change GoalLoopDecision policy, autonomous loop
  behavior, or conflict-aware continuation behavior.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- Reason: change does not affect PR, remote, merge, provider capability, or
  remote handoff evidence.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- Active path alignment: ECL lint/status confirm active path alignment.
- Pending evolution state checked: `harness-evolve check` reports no pending
  evolution.
