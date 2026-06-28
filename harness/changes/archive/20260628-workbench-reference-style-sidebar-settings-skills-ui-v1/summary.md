# workbench-reference-style-sidebar-settings-skills-ui-v1

## Purpose

Align the Harness-mode Workbench product shell with the inspected
`desktop-cc-gui` interaction model for sidebar, settings, and Skills. The left
side should stay focused on project/session navigation, the center should host
home/composer/settings surfaces, and the right rail should remain confirmation
and implemented tools only.

## Scope

In scope:

- Replace the right-drawer settings affordance with a center `SettingsSurface`.
- Move Skills management into the settings `技能` section with a clearer
  roots/list/detail layout.
- Tighten the left project/session sidebar, project quick-new conversation,
  and project three-dot menu behavior.
- Remove ordinary-page technical clutter and keep advanced diagnostics behind
  an advanced settings section.

Out of scope:

- No Harness workflow truth, permission, Goal Loop, scheduler, apply/close, or
  Codex bridge behavior changes.
- No ordinary Agent mode, provider matrix, marketplace, terminal/browser,
  attachments, or write-capable file/Git actions.

## Current Status

Ready to close.

Implemented:

- Center `SettingsSurface` replaces the old right-side settings drawer.
- Settings categories are `基础` / `项目` / `Codex` / `技能` / `高级诊断`;
  raw diagnostics stay in `高级诊断`.
- Skills management moved from the project home into a settings page with
  roots/list/detail management and Codex bridge sync controls.
- Left sidebar project menus are lightweight popovers. Quick new conversation
  clears/focuses the project composer and does not create a topic until the
  first demand is sent.
- Home copy is reduced to the reference-style `创造任何东西` composer surface;
  fake/unsupported toolbar, provider, terminal, browser, attachment, and
  marketplace controls remain hidden.

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

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: in-app browser connector failed before
  asset bootstrap with `failed to write kernel assets`; fallback one-time
  Playwright acceptance used system Chrome/Edge without adding project
  dependencies.
- Screenshots / artifacts / run ids:
  `E:\aho-accept\reference-sidebar-settings-skills-v1\screenshots\01-home.png`,
  `02-project-menu.png`, `03-settings-project.png`,
  `04-settings-skills.png`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none. Real UI DOM summary
  confirmed settings surface and `demo-skill`, with no fake terminal/browser or
  marketplace text.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
