# maintenance-canonical-patch-target-kinds-helper-reuse

## Purpose

Reuse one canonical patch lineage helper for target-kind set merging in the maintenance canonical patch chain. Proposal and manifest builders currently hand-roll sorted/deduped `targetKinds` aggregation with local casts; this change moves that cross-cutting target-kind merge into `src/agent-task/canonical-patch-lineage.ts`.

This is an Architecture Growth Control slice. It does not add a new artifact family, state transition, gate, Workbench behavior, scheduler behavior, Goal Loop behavior, or canonical mutation path.

## Scope

In scope:

- Add a pure typed canonical patch target-kind merge helper under `src/agent-task/canonical-patch-lineage.ts`.
- Reuse the helper from canonical patch proposal and application manifest builders.
- Add targeted unit coverage for mixed, duplicated, out-of-order target-kind inputs.
- Record module-boundary and core-mechanism reuse evidence.

Out of scope:

- Artifact shape, generated ids, markdown authority wording, schema, ledger semantics, ToolPolicyGate, human gates, Workbench behavior, scheduler behavior, Goal Loop behavior, reference-project changes, and broader target-kind modeling.

## Current Status

Closed. Implementation, verification, independent close-ready review, and Harness close are complete.

## Verification

Completed:

- `npm run test:fast -- --run tests/unit/agent-task-boundaries.test.ts` passed.
- Forbidden import scan on changed canonical patch modules found only existing `workbench-human-gate` authority strings in `canonical-patch-application.ts`; no Workbench, manager, bridge, frontend, scheduler, or Goal Loop imports were added.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:integration` passed.
- `npm run test:workbench` timed out with no output after 184 seconds and again after 364 seconds; this change does not touch Workbench code, and the timeout is recorded as an environment limitation rather than product acceptance evidence.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after ECL evidence update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported close-ready before close and no active change after close.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` reported no pending evolution and 4 archived changes since last completion after close.
- Subagent close-ready review found no code correctness issues, confirmed helper extraction preserved `uniqueSorted` behavior and target-kind tests, and required stale close/handoff wording cleanup before close; the stale wording was corrected.

Preflight and plan review:

- Active-change preflight before opening this change: pass; no active change existed.
- Subagent plan review: PASS with required tightening.
- Required tightening included: explicit Module Boundary/Core Mechanism Reuse records, mixed duplicate/out-of-order target-kind tests, pure typed helper signature, and explicit not-applicable coverage for Workbench/runtime/Goal Loop/scheduler/source-apply/reference-project surfaces.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent plan review required stronger mixed target-kind test acceptance.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to temporary active handoff updates in `AGENTS.md` and `docs/STATUS.md`; close pass must return them to no-active/latest-archive state.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active handoff remains aligned with `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
