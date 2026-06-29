# workbench-codex-style-top-tool-alignment-right-launcher-terminal-squeeze-v1

## Purpose

Align the Workbench shell with the Codex-style top tool layout: terminal toggle
and right rail toggle now share one visual contract, the right rail opens to a
centered tool launcher before drilling into a tool panel, and the terminal dock
compresses the workspace content instead of covering the composer or transcript.

## Scope

In scope:

- Shared `top-tool-button` styling for terminal toggle, collapsed rail toggle,
  right panel back, and collapse controls.
- Right rail launcher for `确认`, `文件`, `Git`, and `诊断`.
- Panel drill-in/back behavior for right rail tools.
- Terminal squeeze layout by keeping the dock as a bottom flex item and removing
  sticky overlay behavior from the active topic composer.

Out of scope:

- Terminal backend/runtime changes.
- Rust/Tauri native host work.
- New Browser, side chat, remote, PR, merge, or other unimplemented tools.
- Workflow action, confirmation authority, Goal Loop, Scheduler, apply/close, or
  Harness evolution changes.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/workbench-server.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

All passed. `npm run build` reports the existing Vite chunk-size warning.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  - `.tmp/ui-acceptance/top-tool-alignment-collapsed.png`
  - `.tmp/ui-acceptance/right-launcher-expanded.png`
  - `.tmp/ui-acceptance/files-panel-with-back.png`
  - `.tmp/ui-acceptance/home-terminal-squeeze-cwd.png`
  - Workbench URL: `http://127.0.0.1:4428/?project=aho-self`
  - Terminal cwd verified with manual `cd`: `E:\个人项目\agent-harness-orchestrator`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the current stable app data
  for `aho-self` has no existing topic, so conversation-specific real screenshot
  was not captured to avoid creating a new demand/Change just for visual
  evidence. The conversation squeeze path is covered by DOM tests; homepage
  terminal squeeze was verified in the browser.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff pointers were updated for the
  active change and should be closed back to archive on close.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
