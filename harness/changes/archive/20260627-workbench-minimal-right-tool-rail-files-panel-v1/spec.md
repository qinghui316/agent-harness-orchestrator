# Spec: workbench-minimal-right-tool-rail-files-panel-v1

## Goal

Make the Workbench right rail match the reference-style tool panel interaction without cluttering the UI: one collapsed right-side entry, and when expanded only two real tabs, `确认` and `文件`.

The `确认` tab remains the only Harness decision/action surface. The `文件` tab is a read-only project tool for browsing, previewing, and adding file references to the composer.

## Users

- Local Harness-mode users who need to inspect project files while keeping the main conversation clean.
- Users waiting on Harness decisions who need a clear, single right-side confirmation entry.

## Acceptance Criteria

- AC-001: Collapsed right rail shows one panel entry with a pending-confirmation badge/highlight; it does not show separate file/confirmation rail buttons.
- AC-002: Expanded right rail shows only `确认` and `文件` tabs. `确认` renders the existing `DecisionInspectorPane`; `文件` renders a real read-only project file browser.
- AC-003: The file browser supports directory expansion, search, refresh, breadcrumb/lightweight path context, text preview, and adding a selected file/directory to the existing composer file refs.
- AC-004: File tree and preview APIs are project-scoped and fail closed for path escape, symlink, ignored/cache/build directories, oversized files, and binary/unsupported previews.
- AC-005: The file tab does not show confirmation buttons, does not trigger workflow actions, and does not alter `confirmationQueue.primary`, apply/close, scheduler, automation, remote, merge, PR, or Harness evolution.
- AC-006: Unsupported future controls such as browser, Git, terminal, runtime log, file editing, delete, drag/drop, and upload are not visible in V1.

## Non-Goals

- Editing, saving, deleting, dragging, uploading, or writing files.
- Full file editor, Git diff/status, terminal, browser dock, runtime log, or attachment panel.
- Moving file contents into Codex prompts by default.
- Adding a database, workflow runtime, permission system, action path, or projection framework.

## Constraints

- Reference alignment must cite `desktop-cc-gui` right panel / `filePanelMode = "files"` / `FileTreePanel` evidence, but no reference source may be copied.
- `confirmationQueue.primary` remains the only executable primary decision source.
- File browsing is a project tool and runtime context helper, not Harness workflow truth.
- Existing `@file` composer references and file safety helpers should be reused before adding new mechanisms.

## Risks

- The right-side UI can become cluttered if future tools are shown before implementation; V1 must show only `确认 / 文件`.
- File preview can accidentally become a source read/exfiltration path if root and size guards are not shared with existing file-reference safety.
- Mixing confirmation actions into the file tab would weaken Workbench user-surface honesty.
