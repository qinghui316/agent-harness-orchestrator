# workbench-reference-style-codex-model-selection-v1

## Purpose

按 `desktop-cc-gui` 的真实模型选择逻辑补齐 AHO Codex 模型闭环：读取
Codex `config.toml` 的顶层 `model`，尽量读取 Codex runtime 的
`model_list`，允许用户在 composer/settings 中选择或添加模型，并让所有
Workbench Codex run 使用同一个 effective model resolver。

## Scope

In scope:

- Codex-only model settings and diagnostics.
- Composer model picker backed by real model sources.
- Runtime wiring for Codex exec and app-server paths.
- Tests for parsing, settings, UI, and runtime argv/request model propagation.

Out of scope:

- Claude Code / OpenCode / Gemini provider support.
- Provider capability matrix.
- Automatic edits to Codex `config.toml` model.
- Harness permission, confirmation, scheduler, apply/close, or evolution changes.

## Current Status

Ready to close.

Implemented Codex-only model selection aligned with `desktop-cc-gui` interaction
semantics: AHO now reads Codex `config.toml` through TOML parsing, exposes a
degrading `model_list`/candidate settings API, persists AHO runtime model
preference, shows a real composer/settings model picker, and routes all Codex
exec/app-server paths through one effective-model resolver. Provider remains
fixed to Codex; no fake Claude/OpenCode/Gemini controls are shown.

## Verification

- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` passed (`Close ready: True`).
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed (`No pending evolution`; 3 archived changes since last completion).

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

