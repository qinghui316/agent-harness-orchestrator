# workbench-minimal-right-tool-rail-files-panel-v1

## Purpose

Upgrade the Workbench right confirmation rail into a minimal reference-style
right tool panel. The collapsed state remains a single rail entry; expansion
shows only implemented tools: `确认` for the existing decision inspector and
`文件` for safe read-only project file browsing/preview/reference insertion.

This keeps `confirmationQueue.primary` as the only executable decision source
and avoids exposing future browser/Git/terminal/log affordances before those
features exist.

## Scope

In scope:

- `RightToolRailShell` replacing the old decision shell wrapper.
- Safe project-scoped file children and text preview routes.
- Read-only files tab with search, refresh, breadcrumb, preview, and
  "引用到输入框" composer reference insertion.
- Backend/frontend tests for file safety, tab behavior, fake-control absence,
  and non-action behavior.

Out of scope:

- File editing, saving, deleting, drag/drop, upload, Git, terminal, browser,
  runtime log, or workflow action execution from the files tab.
- Changes to Harness workflow truth, action revalidation, apply/close,
  scheduler, automation, remote, PR, or Harness evolution.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/file-references.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` initially had one transient web-app Skill mention failure; the test passed standalone and the full `test:fast` rerun passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- Harness checks are run during closeout.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first server stop command used PowerShell
  read-only `$PID`; reran with a non-reserved variable and stopped the 4377
  listener.
- Screenshots / artifacts / run ids:
  - `E:\aho-accept\minimal-right-tool-rail-files-v1\collapsed-rail.png`
  - `E:\aho-accept\minimal-right-tool-rail-files-v1\files-tab-preview.png`
  - `E:\aho-accept\minimal-right-tool-rail-files-v1\confirm-tab.png`
- External source/state safety: acceptance source
  `E:\aho-accept\minimal-right-tool-rail-files-v1\src`; runtime home
  `E:\aho-accept\minimal-right-tool-rail-files-v1\home`; file tab was read-only
  and no workflow action/apply/close/scheduler/remote/merge/PR/Harness
  evolution ran.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the direct acceptance
  project was not initialized, so the files tab proved preview/reference button
  behavior but no visible composer chip was present on that uninitialized home.
  DOM/unit coverage verifies composer chip insertion when a composer exists.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: handoff docs will be updated compactly at close.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

