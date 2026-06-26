# workbench-cursor-incremental-transcript-projection-v2

## Purpose

Make the Workbench transcript projection truly cursor-incremental for very long
local conversations. V1 paged the response and virtualized rendering, but the
server still built the full selected-demand transcript before slicing a page.
V2 uses the existing Workbench SQLite message store to read only the requested
page for normal UI requests.

This is a performance and scalability slice for the conversation surface only.
It must not change workflow truth, Goal Loop behavior, scheduler execution,
source apply, landing, close, or Harness evolution behavior.

## Scope

In scope:

- Structured transcript paging over the existing Workbench `messages` table.
- Opaque cursor support for latest and earlier transcript pages.
- Incremental transcript projection path for paged transcript API calls.
- Snapshot shell behavior that avoids constructing a full transcript by default.
- Targeted and one-time synthetic pressure evidence for 100k / 500k messages.

Out of scope:

- New central workflow database or durable UI state.
- Any change to Change, run, validation, audit, worktree, apply, landing, close,
  scheduler, automation, or Goal Loop authority.
- A second markdown renderer or replacing `@chenglou/pretext`.
- Conversation compaction, summarization, or million-message archive policy.

## Current Status

Completed. Ready to close.

## Verification

- `npx vitest run tests/unit/transcript-incremental-projection.test.ts tests/unit/parent-agent-transcript.test.ts tests/unit/transcript-virtual-list.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- One-time synthetic pressure acceptance used `E:\aho-accept\transcript-v2-pressure\temp`, then deleted it:
  - 100k messages: latest page 28.62 ms, earlier page 19.21 ms, payload about 37 KB, virtual rows 17.
  - 500k messages: latest page 93.28 ms, earlier page 87.05 ms, payload about 37.5 KB, virtual rows 17.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: pressure data was generated only under
  `E:\aho-accept\transcript-v2-pressure\temp`; the directory was deleted after
  recording results and no large fixtures were added to the repository.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
