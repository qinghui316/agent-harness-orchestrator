# workbench-provider-product-mode-runtime-boundary-v2

## Purpose

Tighten the provider/runtime boundary introduced by
`workbench-provider-capability-registry-v1`. The change keeps Codex as the only
active provider and Harness as the only active product mode, while making the
Provider / Product Mode / Harness Execution Mode separation explicit in types,
API output, run metadata, and UI wording.

This is a thin boundary pass, not a provider rewrite. Existing Codex diagnostics,
model settings, Skills, attachments, app-server, and exec fallback owners remain
in place; the provider runtime layer reads their readiness summaries and records
stable metadata for Codex runs.

## Scope

In scope:

- Codex-only provider runtime summary/readiness aggregation.
- Explicit Provider, Product Mode, and Harness Execution Mode vocabulary.
- Stable provider metadata for Codex run artifacts/events.
- Settings/UI guardrails that expose only real Codex/Harness capability.
- Tests proving unsupported providers/modes are not runnable and provider
  readiness is not authority.

Out of scope:

- Adding Claude Code, OpenCode, Gemini, or provider switching.
- Implementing normal Agent mode.
- Rewriting Codex runners, Skills, attachments, or model storage owners.
- Changing ToolPolicyGate, confirmation, Scheduler, Goal Loop, validation,
  audit, apply, close, remote, PR, or Harness evolution authority.

## Current Status

Completed.

## Verification

Passed:

- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
- `npm run lint`
- `npm run typecheck`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
