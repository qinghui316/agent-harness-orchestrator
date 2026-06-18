# maintenance-canonical-artifact-reference-reuse

## Purpose

Reuse a single maintenance-layer helper for canonical artifact references across the maintenance canonical update / patch / application / report chain.

The change reduces repeated local reference protocols in `canonical-updates.ts`, `canonical-patch-application.ts`, and `canonical-patch-application-report.ts` while preserving existing domain builders, authority flags, lineage checks, ledger event choices, public manager exports, and human-gated behavior.

## Scope

In scope:

- Add a small canonical artifact reference helper near the existing maintenance artifact store owner.
- Replace repeated JSON ref, Markdown ref, and ledger artifactRefs assembly in the maintenance canonical chain.
- Preserve existing exported artifact-ref functions and user-visible / Workbench behavior.
- Cover the ref shape and canonical report candidate-filter behavior with existing unit tests.

Out of scope:

- Scheduler, Goal Loop, Workbench, runtime bridge, and UI behavior.
- New maintenance artifact families, event types, state transitions, human gates, or canonical rewrite behavior.
- Moving authority, lineage, schema validation, candidate filtering, ledger idempotency, or rendering logic into the helper.

## Current Status

Completed.

## Verification

- PASS: `npx vitest run tests\unit\agent-task-boundaries.test.ts`
- PASS: `npm run typecheck`
- PASS: `npm run lint`
- PASS: `npm run test:fast`
- PASS: `npm run build`
- PASS: `npm run test:integration`
- PASS: `npm run test:workbench`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

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

- Documentation entropy check: applicable; `AGENTS.md` and `docs/STATUS.md` were updated only with active change handoff fields and retained their prior line counts.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
