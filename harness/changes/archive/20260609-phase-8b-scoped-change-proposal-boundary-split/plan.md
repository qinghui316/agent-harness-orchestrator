# Plan: Phase 8B Scoped Change Proposal Boundary Split

## Implementation Plan

1. Repair handoff drift first.
   - Update `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, and `docs/BOUNDARIES.md`.
   - Replace Phase 8A active/current wording with Phase 8A archived and Phase 8B active wording.

2. Fix scoped proposal run target resolution.
   - Add optional `changeId` to `ChangeProposalRunOptions`.
   - Pass Workbench selected `changeId` into spec/plan proposal handlers.
   - Resolve the proposal target once in the runner and carry resolved `changeId/changePath` through context, active file reads, target hash reads, and prompt builders.
   - Keep CLI no-`changeId` behavior as legacy single-active fallback.

3. Fix plan acceptance stale guard.
   - Ensure `acceptPlanProposal()` validates `spec.md`, `plan.md`, and `tasks.md` against proposal `targetHashes`.
   - Preserve existing error style and fail-closed behavior.

4. Split proposal modules.
   - Create `src/change/proposals/` modules for schemas, paths/hashes, repository, parser/renderer, prompt-builders, runner, and acceptance.
   - Keep `src/change/proposals.ts` as a compatibility facade exporting the existing public API.
   - Do not migrate CLI/server/Workbench imports away from the facade.

5. Add tests and boundary checks.
   - Extend proposal tests for scoped multi-active runs, stale spec/plan/tasks accept guards, parse compatibility, and facade compatibility.
   - Extend module-boundary tests to forbid reverse dependencies from proposal internals to facade/CLI/server/UI.

6. Run focused, full product, and Harness verification.

## Planning Notes

- `PlanProposal.targetHashes.spec` already exists, so stale spec validation needs no JSON shape change.
- Workbench already resolves selected `changeId` before dispatch; the bug is dropping it when calling proposal APIs.
- External-local Codex read-dir tightening affects several domains and should remain a separate later change.
