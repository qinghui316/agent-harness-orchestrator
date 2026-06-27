# workbench-reference-style-readonly-git-status-diff-panel-v1

## Purpose

Add a reference-style, read-only Git status/diff tool to Workbench. The right
tool rail gains a `Git` tab for branch and changed-file lists, and selecting a
file opens a large read-only `Git Diff` viewer in the center workspace.

This change does not add Git write operations. There is no stage, discard,
commit, push, PR, merge, or remote flow in V1, and the panel is not workflow
truth.

## Scope

In scope:

- Project-scoped readonly Git status API.
- Project-scoped readonly Git diff API.
- Right rail `Git` tab beside `确认` and `文件`.
- Center `Git Diff` readonly viewer.
- Existing composer `@file` reference integration from Git rows.

Out of scope:

- Stage, discard, commit, push, PR, merge, remote, GitHub auth, or history.
- Changes to `confirmationQueue.primary`, apply/close, scheduler, automation,
  Goal Loop, or Harness evolution.

## Current Status

Completed / ready to close.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts`
  - Passed: 88 tests.
- `npm run typecheck`
  - Passed.
- `npm run lint`
  - Passed.
- `npm run test:fast`
  - Passed: 65 files, 620 tests.
- `npm run build`
  - Passed.
- `npm run test:workbench`
  - Passed: 9 files, 138 tests.

Harness checks are run during closeout after handoff alignment.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4372/`.
  - Source: `E:\aho-accept\readonly-git-panel-v1\src`.
  - Runtime home: `E:\aho-accept\readonly-git-panel-v1\home`.
  - Screenshot: `E:\aho-accept\readonly-git-panel-v1\git-panel-diff-acceptance.png`.
  - Wide screenshot: `E:\aho-accept\readonly-git-panel-v1\git-panel-diff-wide-acceptance.png`.
- External source/state safety:
  - Before/after UI acceptance status remained read-only prepared state:
    `M src/pricing.ts`, `A src/staged.ts`, untracked Harness/setup files,
    and `src/untracked.ts`.
  - No stage, discard, commit, push, PR, merge, apply, close, scheduler,
    remote, or Harness evolution action ran.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - Real UI found the initial Git group flex layout allowed following group
    headings to overlap file rows, making rows visible but not clickable.
    Fixed in the Git panel CSS with non-shrinking Git groups and kept a small
    row-click event guard inside the Git panel owner.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: handoff docs need only one compact current
  baseline update that `Git` is now a real read-only right-rail tool.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
