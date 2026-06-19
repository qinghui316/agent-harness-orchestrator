# maintenance-artifact-store-write-validation-reuse

## Purpose

Strengthen the shared maintenance artifact-store owner so JSON/Markdown maintenance artifact writes validate through the store schema at the persistence boundary. This removes repeated feature-local write-time `schema.parse(...)` calls from the canonical maintenance chain while preserving artifact shapes, ids, Markdown rendering, ledger entries, and human-gated behavior.

This is an Architecture Growth Control / Core Mechanism Reuse slice. It does not add a new artifact family, gate, scheduler behavior, Goal Loop behavior, Workbench action, or canonical write authority.

## Scope

In scope:

- Update `src/agent-task/maintenance-artifact-store.ts` so `writeMaintenanceJsonMarkdownArtifact()` validates with `store.schema.parse(value)` before any JSON or Markdown write.
- Remove only the seven immediate pre-write canonical maintenance `schema.parse(...)` calls that become duplicate local validation.
- Add focused boundary coverage proving the shared writer rejects invalid artifacts through the store schema and does not write JSON or Markdown on rejection.

Out of scope:

- Changing schemas, ids, artifact JSON/Markdown output, ledger event behavior, maintenance candidate policy, target-boundary checks, lineage checks, ToolPolicyGate, human gates, Workbench behavior, scheduler behavior, or Goal Loop behavior.
- Converting other maintenance writers that do not use `MaintenanceArtifactStore`.
- Broad refactors of `canonical-updates.ts`, `canonical-patch-application.ts`, or manager facades.

## Current Status

Ready to close.

Implementation, product verification, and independent close-ready review are complete. Final close/archive and git commit remain outside the active change content and will be performed after close-ready Harness checks.

## Verification

- PASS: `npx vitest run tests/unit/agent-task-boundaries.test.ts` (30 tests).
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run test:fast` (29 files, 343 tests).
- PASS: `npm run build`.
- PASS: `npm run test:integration` (38 tests).
- PASS: static grep found no remaining canonical maintenance immediate pre-write `*Schema.parse(...)` calls under `src/agent-task`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` (no pending evolution before close).
- PASS: final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported `State: close-ready`, `STATUS aligned: True`, and `Close ready: True`.

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

- Documentation entropy check: active handoff fields only; no process-rule or roadmap expansion intended.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

