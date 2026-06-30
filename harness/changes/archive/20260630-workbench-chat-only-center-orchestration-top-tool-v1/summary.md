# workbench-chat-only-center-orchestration-top-tool-v1

## Purpose

Make the active Workbench conversation center chat-only by removing the
`对话 / 工作台 / Agent 编排图` center tabs. Move `Agent 编排图` to a
Codex-style top tool button that opens a large read-only overlay.

The `工作台` center tab is removed only as a visible surface. Unique user
capabilities that still live there, especially structured clarification
answers and evidence/detail access, must remain reachable through conversation
or detail surfaces.

## Scope

In scope:

- Active topic center tab removal.
- Top tool button and read-only orchestration overlay.
- URL/deep-link compatibility for old workpad and graph tabs.
- Workpad clarification and detail/action reachability preservation.
- Targeted Workbench UI tests and real browser acceptance.

Out of scope:

- Harness workflow truth, permissions, apply/close, scheduler, remote, PR, or
  Harness evolution behavior changes.
- Moving Agent graph to the right rail or bottom terminal dock.
- Rebuilding Workpad runtime, TaskGraph, confirmation queue, or projections.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx` - passed.
- `npx vitest run tests/unit/workbench-server.test.ts tests/unit/workbench-read-model.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed with the existing Vite large chunk warning.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after active handoff pointers were updated.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - generated `harness/evolution/pending.md`; pending evolution is intentionally out of scope for this change.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: first acceptance request created via PowerShell displayed garbled Chinese due console encoding, so a second ASCII topic was created for clean screenshots.
- Screenshots / artifacts / run ids:
  - `E:\aho-accept\chat-only-center-v1\screenshots\chat-only-center-clean.png`
  - `E:\aho-accept\chat-only-center-v1\screenshots\agent-graph-overlay-clean.png`
- External source/state safety: real UI acceptance used `E:\aho-accept\chat-only-center-v1\src` with `E:\aho-accept\chat-only-center-v1\home`, not the AHO repo.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
