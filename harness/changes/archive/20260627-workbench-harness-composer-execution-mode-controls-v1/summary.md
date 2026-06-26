# workbench-harness-composer-execution-mode-controls-v1

## Purpose

Align the Harness-mode Workbench composer controls with the `desktop-cc-gui`
interaction pattern: `Codex / current model / execution mode`. The visible
mode names become user-facing Harness concepts, `逐步确认` and `自动推进`, while
the internal values continue to use the existing `request-approval` and
`full-access` contracts.

This change fixes a product-layer mismatch: the prior UI exposed mode controls
in multiple places and static provider/model text, but did not model the
selection as a persistent composer/session preference. The mode remains an AHO
Harness execution strategy; it does not change the underlying Codex runtime
permission profile.

## Scope

In scope:

- Persist frontend-only composer execution mode per project/topic, with draft
  mode migration to the next created demand.
- Show the same Codex/model/execution-mode control strip on the project home
  composer and active topic composer.
- Use real Codex config/diagnostic model data for display, with a non-clickable
  fallback when no real model catalog exists.
- Remove the separate execution-mode selector from the right confirmation card.

Out of scope:

- Normal Agent mode.
- Claude Code / OpenCode / Gemini provider support.
- Editable model catalog or model switching.
- Changing Codex runtime sandbox/approval permissions.
- Changing Harness gate authority, apply/close, remote, PR, merge, scheduler,
  IntegrationCheck, or Harness evolution behavior.

## Current Status

Completed; ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts tests/unit/codex.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Harness checks passed except the active-change pointer lint is rerun after this
summary / handoff update.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4349`
  - External source: `E:\aho-accept\harness-composer-mode-v1\src`
  - Runtime home: `E:\aho-accept\harness-composer-mode-v1\home`
  - Screenshots:
    `E:\aho-accept\harness-composer-mode-v1\screenshots\home-composer-step-mode.png`
    `E:\aho-accept\harness-composer-mode-v1\screenshots\home-composer-auto-mode.png`
    `E:\aho-accept\harness-composer-mode-v1\screenshots\home-composer-auto-mode-after-reload.png`
    `E:\aho-accept\harness-composer-mode-v1\screenshots\active-topic-composer-auto-mode.png`
    `E:\aho-accept\harness-composer-mode-v1\screenshots\active-topic-confirmation-expanded.png`
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Real UI Acceptance

- Project-home composer showed `Codex / gpt-5.5 / 逐步确认|自动推进`.
- `自动推进` remained selected after browser reload.
- Creating a demand migrated the selected draft mode into the active topic
  composer.
- Expanding the right confirmation rail showed only the current real gate
  (`生成方案草案`); no independent mode selector was present in the confirmation
  card.
- Unsupported toolbar, recent-session, fake provider/model dropdown, and
  unimplemented attachment controls were not visible on the verified surface.
- No source apply, close, scheduler, remote, merge, PR, or Harness evolution
  action was executed during UI acceptance.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
