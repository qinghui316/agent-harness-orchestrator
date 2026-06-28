# Spec: workbench-reference-style-sidebar-settings-skills-ui-v1

## Goal

Make the Workbench Harness-mode entry and management surfaces feel like the
reference desktop Agent product while preserving AHO's Harness boundaries.

## Users

- Local AHO users who need to open a project, start a demand conversation,
  manage Skills, and inspect settings without seeing internal diagnostics or
  unfinished controls.

## Acceptance Criteria

- AC-001: Clicking settings opens a center `SettingsSurface` with `基础`,
  `项目`, `Codex`, `技能`, and `高级诊断` categories; it does not open the old
  right drawer.
- AC-002: Ordinary settings categories hide raw config, memory roots,
  capabilities, and raw errors; those details appear only under
  `高级诊断`.
- AC-003: Skills management lives under settings `技能` with a roots/skills list
  and selected skill detail surface, backed by the existing Skill APIs.
- AC-004: The composer `技能 N` indicator opens settings directly to the
  `技能` category.
- AC-005: The left sidebar keeps project/session navigation compact: project
  name opens the project home, quick-new conversation clears/focuses composer
  without creating a topic, sessions show short status and badge only, and the
  three-dot menu is a lightweight popover.
- AC-006: The home surface stays sparse: logo, `创造任何东西`, workspace picker,
  and composer; no long Harness/Codex explanatory or diagnostic copy.
- AC-007: The right rail continues to own only implemented `确认 / 文件 / Git`
  tools and no settings or future placeholder controls.
- AC-008: No workflow action, apply, close, scheduler, remote, merge, PR, or
  Harness evolution is triggered by opening settings, selecting sidebar items,
  or using Skills settings.

## Non-Goals

- Do not change Harness workflow truth, confirmation queue semantics,
  automation permissions, Codex bridge materialization, validation/audit,
  apply/close, or scheduler behavior.
- Do not implement normal Agent mode, provider matrix, marketplace, terminal,
  browser, attachments, or file/Git write actions.

## Constraints

- Reference source is evidence only; do not vendor-copy `desktop-cc-gui` code.
- Reference projects and unrelated `README.md` / package files must not be
  staged.
- Reuse existing project, topic, settings, Skills, composer, and right rail
  owners where possible.

## Risks

- Settings/Skills UI can become another cluttered surface if diagnostics and
  future features are not separated.
- Quick-new conversation can accidentally create state too early if it reuses
  create-topic paths instead of only clearing/focusing the composer.
- Moving settings can break existing DOM tests or hide real Skill controls.
