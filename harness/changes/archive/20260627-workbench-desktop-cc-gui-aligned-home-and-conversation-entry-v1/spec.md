# Spec: workbench-desktop-cc-gui-aligned-home-and-conversation-entry-v1

## Goal

Make the Workbench first-use and selected-project entry feel like the
`desktop-cc-gui` product surface: the user sees workspaces, recent
conversations, and a central composer to create a demand conversation. The
main home must not be a diagnostics dashboard.

After implementation feedback, V1 intentionally keeps only controls backed by
real behavior. Reference-style toolbar icons, fake project dropdowns, and
recent-session shortcuts are omitted until their actions exist.

## Users

- Local personal users opening AHO in Harness mode.
- Future product-layer implementers who need a clean shell to extend with
  files, Git, terminal, Skills, and normal Agent mode later.

## Acceptance Criteria

- AC-001: With a selected managed project and no active topic, the main area
  renders a desktop-cc-gui-style home composer with title, selected project
  label, Codex provider label, real permission-mode toggle, input, and send
  button.
- AC-002: The main home no longer renders Codex diagnostics or project-status
  dashboard cards as the primary content.
- AC-003: Sending text from the home composer creates a demand topic through
  the existing Workbench topics API, selects the new topic, refreshes the
  snapshot, and shows the normal Workbench conversation.
- AC-004: The sidebar project/new-demand affordance opens or focuses the home
  composer and does not create an empty demand.
- AC-005: Codex diagnostics remain available from settings / advanced detail
  only, and are still read-only.
- AC-006: Page load, project selection, and settings open do not trigger
  trust, init, source mutation, workflow, apply, close, remote, merge, PR, or
  Harness evolution actions.
- AC-007: Uninitialized or missing-memory projects still fail closed and do
  not expose demand creation.
- AC-008: The composer permission mode behaves like Codex permission mode:
  switching `请求批准` / `完全访问权限` updates the current UI mode and is reused by
  subsequent home demand creation; it is not a fake disabled chip and not a
  one-off plan-card selector.
- AC-009: Unsupported file, skill, attachment, provider/model, recent-session,
  refresh, and fake project-dropdown controls are not shown on the home
  composer.

## Non-Goals

- Do not copy or vendor reference project code.
- Do not implement the reference project's full rich ChatInputBox, files,
  Git, terminal, Skills, attachments, slash commands, prompt marketplace, or
  provider matrix in this change.
- Do not add a central workflow database or move Harness truth into SQLite or
  UI state.
- Do not implement normal Agent mode or desktop packaging.

## Constraints

- Reuse existing Workbench topic creation, project selection, settings, and
  diagnostics routes.
- Keep diagnostics as supporting information, not the primary task surface.
- Use only visible actions backed by implemented paths.
- Keep the UI compact and operational; avoid dashboard-card mosaics.

## Risks

- A visually faithful composer could imply unsupported file/skill/attachment
  features. V1 must hide or clearly disable unsupported controls.
- Moving diagnostics out of the home must not remove required init/trust
  guidance for unmanaged projects.
- Reusing existing topic creation must preserve the current explicit
  `confirm: true` safety check.

