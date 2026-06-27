# Spec: workbench-reference-style-file-reference-composer-v1

## Goal

Add `@file` references to the Workbench composer in the same product sense as
the `desktop-cc-gui` reference: file references are user-selected project
context for the agent runtime, not workflow authority.

## Users

Developers using Harness mode who want to point Codex at relevant project files
while creating a demand or sending follow-up feedback.

## Acceptance Criteria

- AC-001: The server can search files/directories only inside the selected
  project source root, with ignore rules, symlink/path-escape protection,
  result limits, and stable ordering.
- AC-002: Home and topic composers expose a real `@file` picker backed by the
  server search API and show selected file chips.
- AC-003: Sending a demand/message parses selected or hand-written matching
  file tokens, removes matched tokens from submitted body text, deduplicates
  refs, and leaves unmatched tokens as ordinary text.
- AC-004: Draft file refs migrate to the first created topic message; existing
  topic refs are scoped to the message that is sent.
- AC-005: Codex chat/planning context includes referenced relative paths and
  kinds, without default full-file injection.
- AC-006: File refs do not alter confirmation queues, Goal Loop, Scheduler,
  validation/audit, apply/close, remote, merge, PR, or Harness evolution.

## Non-Goals

- No central file index database.
- No contenteditable composer rewrite.
- No file tree, attachment upload, marketplace, provider/model dropdown, or
  full slash-command framework.
- No sticky project-wide context pinning.
- No direct execution of referenced files or scripts.

## Constraints

- Reference source evidence must come from the local-only `desktop-cc-gui`
  reference map and source files; do not vendor-copy reference code.
- Workbench SQLite/thread logs remain interaction records, not Harness workflow
  truth.
- File search must fail closed for invalid project paths, symlinks, and path
  escapes.
- Keep implementation in owned helper/components instead of broad facades.

## Risks

- Large repositories can make naive recursive search slow; use debounce,
  limits, ignored directories, and stable early result collection.
- File refs could be mistaken for authority; UI/runtime copy and review must
  state they are scoped runtime context only.
