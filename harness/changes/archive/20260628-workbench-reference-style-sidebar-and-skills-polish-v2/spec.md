# Spec: workbench-reference-style-sidebar-and-skills-polish-v2

## Goal

Make the AHO Harness-mode sidebar and Skills settings feel closer to the
`desktop-cc-gui` product layer without weakening AHO workflow boundaries.

## Users

Local AHO users who want to open projects, resume demand conversations, create
new conversations, and select Codex Skills without seeing internal Harness
terms or fake controls.

## Acceptance Criteria

- AC-001: The project three-dot menu shows only `打开项目首页`,
  `新建对话`, `项目设置`, and `移出项目`.
- AC-002: Ordinary project menus do not show `刷新会话`, `准备项目`, or
  `信任 Codex`; trust and diagnostics remain accessible from settings.
- AC-003: Clicking new conversation does not create a topic/change; sending
  the first demand still creates the topic/change and can run deterministic
  project preparation when required.
- AC-004: Existing history or archived conversations can be opened read-only,
  including `Agent 编排图`, even if the project is not currently prepared for new
  execution.
- AC-005: Sidebar project and conversation rows use stable alignment, short
  labels, duplicate-name path context, and no internal runtime terms.
- AC-006: Skills settings shows native Codex Skills as available runtime
  capabilities without enable/sync controls, while custom/managed Skills keep
  sync status and actions.
- AC-007: Ordinary Skills details hide ids, hashes, raw payloads, and bridge
  internals; advanced diagnostics may keep technical detail.
- AC-008: The change does not trigger workflow actions, apply/close, scheduler,
  remote, merge, PR, or Harness evolution.

## Non-Goals

- No new Skill marketplace, provider capability matrix, normal Agent mode, or
  editable file/terminal/browser panels.
- No changes to Codex bridge materialization semantics for custom/managed
  Skills.
- No deletion of source roots or Harness evidence.

## Constraints

- `desktop-cc-gui` is reference evidence for interaction and visual hierarchy,
  not AHO workflow authority.
- Skills are runtime capabilities, not Harness workflow truth.
- Project preparation remains deterministic infrastructure, not AI-generated.
- Reference projects and local app data must remain untracked.

## Risks

- Hiding preparation/trust actions from the sidebar must not make recovery
  impossible; settings and first-demand flow must remain reachable.
- Allowing read-only historical access for unprepared projects must not execute
  new actions or mutate project state.
- Skills UI simplification must not hide custom Skill sync blockers.
