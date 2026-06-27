# Review

Status: Completed.

## Correctness / Boundary Review

- `src/workbench/git-panel.ts` is the single new readonly Git projection owner.
  It uses the selected project source path, rejects path escape / absolute
  paths / symlinks, and returns explicit non-Git, binary, oversized, unknown,
  or no-diff states instead of guessing.
- `src/server/workbench/api-router.ts` adds only project-scoped readonly
  `git/status` and `git/diff` routes. No action route or workflow action was
  added.
- `ProjectGitPanel` renders branch, dirty stats, staged/unstaged/untracked
  groups, refresh, file selection, and existing composer `@file` references.
  It intentionally has no stage, discard, commit, push, PR, merge, or remote
  controls.
- `GitDiffViewer` is a center workspace reader only. It does not mutate source
  and does not affect `confirmationQueue.primary`.
- Real UI acceptance found and fixed one layout bug: flex-shrunk Git groups
  overlapped file rows and prevented clicking. The fix stays in the Git UI
  owner and is covered by DOM tests plus screenshot evidence.

## Source Safety

- Git APIs are readonly command surfaces. They call status/diff operations and
  never call `git add`, `git checkout`, `git commit`, `git push`, PR, merge, or
  source write commands.
- The external acceptance sandbox status after UI verification remained the
  prepared state: `M src/pricing.ts`, `A src/staged.ts`, untracked setup files,
  and `src/untracked.ts`.
- Right rail `Git` is a tool tab, not a Harness gate. It does not change
  Change, accepted artifacts, validation/audit, apply/close, scheduler,
  automation, or Harness evolution state.

## Complexity Deletion Review

- delete: No old Git write UI existed to delete. The change keeps unsupported
  write controls absent rather than adding disabled placeholders.
- reuse: Reused `src/project/git.ts`, existing project routing, existing right
  tool rail shell, existing composer file-reference chips, and current
  Workbench center-tab structure.
- yagni: Did not add Git write operations, commit history, PR/remote plumbing,
  GitHub auth, a file index DB, a new workflow action path, or a second
  permission system.
- shrink: Kept Git path checks in one helper owner rather than duplicating
  safety checks in the UI.
- net: Small positive code growth for a real tool surface; no obvious dead or
  duplicate path remains. Lean already.
