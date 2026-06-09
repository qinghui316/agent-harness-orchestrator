# Plan: Phase 8E Remote Handoff PR Landing Boundary Split

## Implementation Strategy

1. Update handoff docs for Phase 8E active state and Phase 8D archive state.
2. Add or extend module-boundary tests before the implementation split.
3. Split shared remote-domain helpers only where needed to avoid duplication and cycles.
4. Convert each target manager to a compatibility facade:
   - `remote-landing`: schemas, paths/repository, provider state/readiness, merge attempt/result, rendering.
   - `post-merge`: schemas, paths/repository, handoff, local sync readiness/run, branch cleanup readiness/run, rendering.
   - `pr-feedback`: schemas, paths/repository, provider snapshot/classification, rework/update-draft/user-context, rendering.
   - `pr-review`: schemas, paths/repository, readiness/handoff, reply/thread resolution, rendering.
5. Preserve existing exports, artifact paths, JSON shapes, event names, and Workbench/CLI behavior.
6. Run focused tests, full product verification, and Harness verification.

## Boundary Rules

- New internal modules must not import their manager facade.
- New internal modules must not import Workbench, server routes, web UI, or CLI command modules.
- `pr-draft`, `landing`, and `landing-queue` may remain dependencies but are not refactor targets.
- Remote merge and post-merge mutation paths must continue to refresh evidence and fail closed.

## Planning Notes

- The implementation order should prefer smaller high-impact units: shared helpers, `remote-landing`, `post-merge`, `pr-feedback`, then `pr-review`.
- If splitting all four managers becomes too large, stop after preserving behavior for completed domains and record the remaining split as follow-up before closing.
