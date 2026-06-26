# workbench-paged-virtual-transcript-with-pretext-v1

## Purpose

Make the default Workbench conversation tab usable for long histories and very
large Codex messages. The current UI receives and renders the full parent-agent
transcript in one pass; large transcripts can create large JSON payloads, parse
cost, DOM cost, markdown splitting cost, and browser layout/reflow pressure.

This change adds paged transcript loading, frontend transcript virtualization,
long-message folding, and a narrow `@chenglou/pretext` text-height estimation
helper. `pretext` is used only as a measurement dependency, not as a rendering
framework or workflow source of truth.

## Scope

In scope:

- Paged transcript projection for Workbench UI reads.
- Frontend virtual transcript rendering for the conversation tab.
- Long user/assistant message folding with explicit expansion.
- `@chenglou/pretext` as an optional text-height measurement helper with
  fallback estimation.
- Deterministic DOM/projection tests proving bounded rendered rows and
  transcript source-boundary preservation.

Out of scope:

- Central workflow database, durable UI scroll state, backend cursor-aware
  incremental transcript builder, new markdown renderer, and any workflow
  authority changes.
- Agent run graph, raw log replay, evidence drawer, validation/audit,
  apply/close, scheduler, remote, PR, or Harness evolution behavior changes.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/parent-agent-transcript.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:workbench` - passed.

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed, close-ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: V2 may add cursor-aware
  incremental transcript construction if full canonical transcript building
  becomes the next bottleneck. V1 intentionally solves payload, DOM, markdown,
  and layout cost first.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

