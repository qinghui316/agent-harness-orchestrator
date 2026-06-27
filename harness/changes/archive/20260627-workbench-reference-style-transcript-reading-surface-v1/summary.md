# workbench-reference-style-transcript-reading-surface-v1

## Purpose

Make the Workbench transcript read closer to the `desktop-cc-gui` reference: user prompts are lightweight right-aligned bubbles, assistant output is a clean Markdown reading flow, and runtime/evidence output is a compact expandable activity row.

## Scope

In scope:

- Extracted transcript display components into `TranscriptReadingSurface`.
- Preserved existing transcript paging, virtual list, Pretext measurement, long-message folding, and cell identity.
- Added collapsed/expanded activity-row height estimation.
- Enhanced MarkdownLite for headings, numbered lists, blockquotes, and code fence language labels.
- Added DOM tests for reference-style classes, activity expansion, markdown coverage, forbidden text, and bounded virtual rows.

Out of scope:

- Backend projection, SQLite storage, workflow truth, confirmation gates, permissions, Goal Loop, Scheduler, Automation, apply/close, and Harness evolution.
- Full desktop-cc-gui message runtime, tool grouping, or fake copy/retry/edit/fork controls.

## Current Status

Ready to close.

## Verification

- `npm run typecheck`: passed.
- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run build`: passed.
- `npm run test:workbench`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed after active handoff pointer update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: active tasks complete after this summary update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: real in-app browser visual pass at `http://127.0.0.1:4370/`; screenshot saved to `E:\aho-accept\transcript-reading-surface-v1\transcript-reading-surface.png`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

