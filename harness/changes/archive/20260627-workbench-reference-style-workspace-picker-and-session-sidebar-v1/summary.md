# workbench-reference-style-workspace-picker-and-session-sidebar-v1

## Purpose

Align the Harness-mode Workbench home with the real `desktop-cc-gui`
interaction pattern: a centered create-anything composer with a working
workspace picker, and real project/session history in the left sidebar.

This fixes the remaining product-layer mismatch after the composer mode strip:
the selected project label is static, while the reference home lets users switch
workspace from the central entry. AHO will reuse its existing project registry,
project add/create forms, Workbench topics, and workpad summaries instead of
adding another session store.

## Scope

In scope:

- Add a small workspace picker owner for the project-home composer surface.
- Let the picker search/select registered projects and open add/create project
  flows through the existing forms.
- Keep historical demand conversations in the left project/session sidebar,
  backed by existing `topics` / `workpads` projection data.
- Remove or demote visible fake/noisy controls from the primary Workbench
  surface.

Out of scope:

- Center-page recent conversations; the inspected `desktop-cc-gui` HomeChat
  tests explicitly omit them.
- Normal Agent mode, provider switching, model catalog editing, file refs,
  slash commands, attachments, Skills, file tree, Git panel, terminal, and
  desktop packaging.
- Any change to Harness workflow truth, Workbench action authority, Goal Loop,
  Scheduler, automation, apply/close, remote, PR, merge, or Harness evolution.

## Current Status

Completed / ready to close.

The Workbench Harness-mode home now follows the inspected `desktop-cc-gui`
HomeChat pattern more closely: the center surface stays focused on
`创造任何东西` plus the real composer, the selected project label is a working
workspace picker, and historical demand sessions live in the left project /
session sidebar.

Implementation notes:

- Added `WorkspacePicker` as a small frontend owner and wired it into
  `ProjectReadinessHome`.
- Reused real project registry data, `ProjectAddForm`, `ProjectCreateForm`,
  and the existing `openProject -> refresh` path.
- Kept session history backed by existing `topics` / `workpads` projections.
- Let the sidebar show all registered projects in direct-serve mode so picker
  selections are visible and restorable.
- Removed the noisy active-topic primary `刷新状态` button from the main
  surface.
- Fixed a real acceptance blocker where non-Latin demand titles could collide
  on the fallback `project` Change id by allocating a short-hash suffix and
  preserving the existing human-readable slug behavior for Latin titles.

## Verification

Passed:

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts`
- `npx vitest run tests/unit/change.test.ts tests/unit/web-app.test.tsx --testNamePattern "non-latin|workspace picker|selected project home|creates a demand"`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures:
  - First browser server launch used the wrong default `AHO_HOME`; restarted
    with `AHO_HOME=E:\aho-accept\workspace-picker-session-sidebar-v1\home`.
  - Direct-serve sidebar initially showed only the direct project; fixed by
    showing registered projects while keeping direct project selected.
  - Multiple Chinese demand titles collided on fallback Change id `project`;
    fixed in `src/change/creation.ts`.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4352/`
  - Source root: `E:\aho-accept\workspace-picker-session-sidebar-v1\src`
  - Second registered project: `E:\aho-accept\workspace-picker-session-sidebar-v1\tools`
  - Runtime home: `E:\aho-accept\workspace-picker-session-sidebar-v1\home`
  - Screenshots:
    - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\01-home-composer-picker-collapsed-rail.png`
    - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\02-workspace-picker-open.png`
    - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\03-tools-sidebar-session-history.png`
    - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\04-ui-created-session-sidebar-history.png`
- External source/state safety:
  - Real UI acceptance used E-drive external projects, not the AHO development
    repository as a managed source.
  - The test path only opened / selected projects and created demand records;
    it did not run apply/close/scheduler/remote/merge/PR/Harness evolution.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - PowerShell direct POST with Chinese text produced mojibake due shell
    encoding; the real browser-created demand and Change id allocation path
    are verified separately.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
