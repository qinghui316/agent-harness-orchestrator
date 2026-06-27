# Spec: workbench-reference-style-readonly-git-status-diff-panel-v1

## Goal

Expose current project Git changes in Workbench with the same interaction shape
as the reference product: compact right-side Git navigation and a large center
diff reading surface.

## Users

Local AHO users working in Harness mode who need to inspect source changes
without leaving Workbench.

## Acceptance Criteria

- AC-001: Git repo status shows branch, dirty state, staged/unstaged/untracked
  groups, and changed file stats.
- AC-002: Non-Git repo, unsafe paths, unknown files, binary diffs, and oversized
  diffs return clear readonly states.
- AC-003: Right rail shows `确认 / 文件 / Git`; Git lists changed files and
  refreshes status.
- AC-004: Clicking a changed file opens a center `Git Diff` readonly viewer.
- AC-005: Git rows can reference files into the composer through the existing
  `@file` chip path.
- AC-006: No stage, discard, commit, push, PR, merge, or other fake write
  controls appear.
- AC-007: Opening Git UI never triggers a workflow action or mutates source.

## Non-Goals

- Git write operations, PR/remote/merge flows, or GitHub integration.
- A central workflow database or new workflow truth.
- Any permission, scheduler, Goal Loop, apply/close, or Harness evolution
  behavior change.

## Constraints

- Reuse existing project-scoped root safety and `src/project/git.ts` where
  practical.
- The Git panel is a readonly tool/projection, not Change evidence or authority.
- Reference project code may guide interaction, but must not be vendor-copied.

## Risks

- Git paths can escape the selected project if repo roots are not checked.
- Large/binary diffs can stall the UI if not bounded.
- UI could imply write support if unimplemented controls are shown.
