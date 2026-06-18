# maintenance-canonical-ledger-event-policy-reuse

## Purpose

Create a small maintenance ledger event-policy owner for canonical maintenance evidence events.

The change moves the canonical evidence event classification out of `candidates.ts` so the maintenance candidate pipeline can reuse a shared ledger policy instead of carrying a feature-local event list. It preserves candidate subtype mapping, ledger IO, idempotency, event schemas, Workbench behavior, and all human-gated canonical update / patch behavior.

## Scope

In scope:

- Add a small ledger event-policy helper that classifies canonical maintenance evidence events as derived evidence.
- Update maintenance candidate extraction to call the shared policy helper instead of a private canonical event list.
- Update unit coverage so proposal, decision, patch proposal, application gate, manifest, result, and report ledger events are all filtered from candidate extraction.

Out of scope:

- New ledger event types, schemas, candidate subtypes, maintenance records, or canonical artifact writers.
- Moving candidate subtype mapping out of `candidates.ts`.
- Workbench, Scheduler, Goal Loop, runtime bridge, ToolPolicyGate, apply/close, remote, or Harness evolution behavior.
- Changing ledger recording, idempotency, artifact refs, or canonical update / patch authority flags.

## Current Status

Ready to close.

## Verification

- PASS: `npx vitest run tests\unit\agent-task-boundaries.test.ts` (19 tests).
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run test:fast` (29 files, 329 tests).
- PASS: `npm run build`.
- PASS: `npm run test:integration` (38 tests).
- PASS: `npm run test:workbench` (111 tests).
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check` (no pending evolution; 4 archived changes since last completion, threshold 5).

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

- Documentation entropy check: applicable for active-handoff updates only; `AGENTS.md` remains 100 lines before/after and `docs/STATUS.md` remains 59 lines before/after.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: `AGENTS.md` and `docs/STATUS.md` currently agree on the active change path, active product phase, and pending evolution state. Final post-close handoff will replace active paths with the archive path.
- Old experience retained / merged / retired / archive-only: no historical phase narrative was promoted; the handoff delta only points to the active change and current source-convergence slice.
