# Plan: workbench-conversation-delete-harness-resume-entry-v1

## Approach

Use the existing Workbench store as the conversation/catalog owner, but split sidebar visibility from addressability. Sidebar-visible topics should filter deleted conversations; internal projections must still be able to resolve a deleted active Change when the project exposes a continue/resume entry.

## Implementation Notes

- Extend Workbench store APIs so conversation delete can clear SQLite topic messages and record a deleted/tombstoned topic for sidebar filtering.
- Keep Change directories and Harness artifacts untouched. Existing `summary.md` Raw Request creation is sufficient for early-demand recovery; do not add a user-visible preservation step.
- Refactor topic listing/resolution so:
  - sidebar lists exclude deleted conversations;
  - selected/resume/projection paths can include deleted active Changes when explicitly requested.
- Add a project-level active-work entry for deleted active Changes. The entry opens the same Change state without restoring deleted transcript.
- Add a resume/context mode for deleted conversations that excludes recent transcript messages and relies on Harness evidence/replay/current gate.
- Keep conversation deletion UI simple: `删除对话`; no close/abandon/cancel/Change lifecycle language.

## Risks

- Filtering too early can make active Changes unreachable. Mitigate with include-deleted resolver/projection tests.
- Deleting SQLite messages while old `thread.jsonl` remains can accidentally restore transcript. Mitigate by recording a tombstone and making read paths respect it.
- Resume context can accidentally include old transcript. Mitigate with explicit context-builder option and tests.
