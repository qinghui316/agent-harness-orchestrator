# workbench-provider-capability-registry-v1

## Purpose

Add a reference-style Provider Capability Registry for AHO's current Codex
runtime. The registry summarizes what the selected provider theoretically
supports and what is currently ready/degraded/unavailable, so Workbench
settings and runtime metadata can use one stable source instead of feature-local
provider checks.

V1 is Harness-first and Codex-only. It prepares the shape for future normal
Agent mode and future Claude Code / OpenCode / Gemini adapters without exposing
fake provider switching or changing Harness workflow authority.

## Scope

In scope:

- Codex provider capability snapshot owner and project-scoped API.
- Capability matrix display in Settings / Codex.
- Runtime metadata enrichment for Codex runs with provider/product-mode and
  capability snapshot identity.
- Targeted tests for backend aggregation, Workbench UI honesty, and runtime
  metadata.

Out of scope:

- Claude Code / OpenCode / Gemini execution or selectable UI.
- Normal Agent mode.
- New workflow engine, permission system, or Harness gate behavior.
- Rewriting Codex diagnostics, model settings, Skills, attachments, or
  app-server owners.

## Current Status

Completed.

Implemented Codex-only provider capability snapshots, project-scoped API
surface, Settings capability matrix, and Codex run provider metadata. No
provider switcher, normal Agent mode, workflow authority, or permission behavior
was added.

## Verification

- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- Harness checks passed: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-change status`, `harness-evolve check`.

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
