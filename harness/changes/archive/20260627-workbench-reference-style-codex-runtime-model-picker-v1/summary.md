# workbench-reference-style-codex-runtime-model-picker-v1

## Purpose

Bring the Codex model picker back to reference-style runtime semantics. Models
must come from Codex runtime candidates, Codex `config.toml`, or the Codex
default; AHO must not offer arbitrary custom model ids before a real provider
capability/API mapping exists.

This also fixes two real UI smoke gaps from the previous model-selection
change: refresh should restore the last valid selected project, and a failed
Codex `model/list` probe should show a concise user-facing degraded state
instead of raw app-server stderr/JSON in the main picker.

## Scope

In scope:

- Remove custom model add/remove UI and ignore stale custom-model settings.
- Make runtime `model/list` use the selected project context, not the AHO
  development checkout.
- Sanitize model-list degraded diagnostics in ordinary UI while retaining
  detailed diagnostics for advanced/debug surfaces.
- Restore the last selected project after browser refresh after validating it
  still exists.

Out of scope:

- Non-Codex providers, provider capability matrix, API-provider model mapping,
  and fake provider/model dropdowns.
- Any change to Harness workflow truth, confirmation gates, automation,
  scheduler, apply/close, remote, PR, merge, or Harness evolution behavior.

## Current Status

Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/codex.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx --testNamePattern "Codex model|selected project"`
- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Harness checks passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: PowerShell one-line here-string and `$HOME`
  variable-name mistakes while preparing the external sandbox; no repository
  source files were changed by those attempts.
- Screenshots / artifacts / run ids:
  - `E:\aho-accept\codex-runtime-model-picker-v1\model-picker-viewport.png`
  - `E:\aho-accept\codex-runtime-model-picker-v1\restored-project-model-picker.png`
- External source/state safety: real UI acceptance used
  `E:\aho-accept\codex-runtime-model-picker-v1\src` with
  `E:\aho-accept\codex-runtime-model-picker-v1\home`. UI initialization wrote
  external Harness files (`.agent-harness/`, `AGENTS.md`) only in the sandbox.
  No workflow action, source apply, close, scheduler, remote, merge, PR, or
  Harness evolution ran.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
