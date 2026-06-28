# workbench-reference-style-sidebar-and-skills-polish-v2

## Purpose

Polish the Harness-mode Workbench sidebar and Skills surface to better match
the `desktop-cc-gui` reference interaction model. The ordinary left sidebar
should remain project/session navigation only, while Skills should read as a
runtime capability browser rather than a Harness management panel.

## Scope

In scope:

- Remove ordinary project-menu entries for refresh, Codex trust, and project
  preparation from the left sidebar.
- Keep project/session navigation, non-destructive project removal, and first
  demand project preparation behavior intact.
- Allow existing history/archived conversations to open for reading even when
  the project is not currently prepared for new execution.
- Tighten sidebar alignment and short user-facing labels.
- Rework the Skills settings surface hierarchy so native Codex skills look
  available by default and custom/managed sync is secondary.

Out of scope:

- No Harness workflow truth, Goal Loop, Scheduler, apply/close, remote, merge,
  PR, or Harness evolution behavior changes.
- No provider matrix, marketplace, terminal/browser/editor, or normal Agent
  mode implementation.
- No reference source vendoring.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts tests/unit/skill-bridge.test.ts tests/unit/registry.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- Harness checks: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, `harness-evolve check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  `E:\aho-accept\sidebar-skills-polish-v2\screenshots\01-sidebar-home.png`,
  `E:\aho-accept\sidebar-skills-polish-v2\screenshots\02-project-menu.png`,
  `E:\aho-accept\sidebar-skills-polish-v2\screenshots\03-skills.png`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: project `aho-self` in the
  stable registry is intentionally unprepared in this smoke run, so the UI
  shows "需要准备" and still keeps ordinary sidebar actions minimal. The
  screenshot verifies native Codex skills are visible as "Codex 可用" without
  enable/sync controls.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
