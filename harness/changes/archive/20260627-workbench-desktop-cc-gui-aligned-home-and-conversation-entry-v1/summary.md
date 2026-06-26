# workbench-desktop-cc-gui-aligned-home-and-conversation-entry-v1

## Purpose

Correct the Phase 1 Workbench product entry so it matches the
`desktop-cc-gui` reference interaction: a workspace/session sidebar plus a
centered "create anything" composer for starting demand conversations.

The previous project-readiness home exposed Harness/Codex diagnostics as the
main surface. This change demotes diagnostics into settings / advanced detail
and makes the primary home experience a real conversation entry point.

## Scope

In scope:

- Replace the selected-project no-topic home with a desktop-cc-gui-style
  home chat surface.
- Reuse the existing demand topic creation API from the home composer and
  navigate to the created conversation.
- Move Codex diagnostics out of the main home into settings / advanced detail.
- Make the `请求批准` / `完全访问权限` permission mode a real composer-level
  toggle, like Codex's permission mode, not a fake one-off plan-card choice.
- Remove unsupported home toolbar / dropdown / recent-session affordances until
  their real behavior exists.
- Update DOM tests and real UI acceptance for the corrected home flow.

Out of scope:

- No normal Agent mode.
- No full desktop packaging, Tauri, Claude Code / OpenCode / Gemini provider
  implementation, file tree, Git panel, terminal panel, Skills, or attachments.
- No change to Harness workflow truth, validation/audit, apply/close,
  scheduler, automation, remote, merge, PR, or Harness evolution behavior.

## Current Status

Ready to close.

The selected-project home now follows the reference shape: a sparse sidebar,
centered `创造任何东西` composer, real topic creation, and a persistent
permission-mode toggle. Diagnostics remain available through settings /
advanced detail, but the home no longer presents them as the primary surface.
Unsupported reference-like controls were removed instead of being displayed as
non-clickable UI.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first UI restart inherited the wrong
  `AHO_HOME` and showed missing memory for `C:\Users\qinghui\projects\src`;
  server was restarted with `AHO_HOME=E:\aho-accept\desktop-home-ui-v1\home`.
- Screenshots / artifacts / run ids:
  `E:\aho-accept\desktop-home-ui-v1\screenshots\final-home-mode-toggle-clean.png`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

