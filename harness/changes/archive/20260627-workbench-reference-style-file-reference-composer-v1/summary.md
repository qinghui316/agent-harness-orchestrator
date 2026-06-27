# workbench-reference-style-file-reference-composer-v1

## Purpose

Implement reference-style `@file` composer references for Workbench Harness
mode. Users can search and select files from the current project in the home
and conversation composer, then send those references as scoped Codex runtime
context for the demand/message.

## Scope

In scope:

- Current-project file search API with path safety, ignore rules, limits, and
  stable ordering.
- Shared composer `@file` picker/parser/chip support for home and topic
  composers.
- Draft file-reference migration into the first topic message and per-message
  file references for existing topics.
- Codex chat/planning prompt context listing referenced project files without
  injecting full file contents.

Out of scope:

- Central file index database, file tree panel, attachments, uploads, full slash
  command framework, provider/model settings, workflow runtime changes, or any
  apply/close/scheduler/Harness evolution behavior.

## Current Status

Completed / ready to close.

Implemented reference-style `@file` composer references without changing
Harness workflow truth. File references are scoped runtime context: they bind to
the first user message for a new demand or to the current message for an
existing topic, and Codex context receives relative paths/kinds only, not full
file contents.

## Verification

- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/unit/file-references.test.ts tests/unit/workbench-server.test.ts tests/unit/codex.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial DOM tests clicked the `@file` menu
  before the debounced search returned; tests were corrected to wait for real
  results. A lint retry fixed an unused mock parameter.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
