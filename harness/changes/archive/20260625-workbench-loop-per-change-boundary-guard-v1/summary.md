# workbench-loop-per-change-boundary-guard-v1

## Purpose

Bind loop execution and scheduler integration to the correct Change boundary. A long-lived demand/goal conversation may run multiple execution loops over time, but each loop execution is represented by one parent Change. The next loop is a new Change. Within a Change, multiple worktrees are allowed as TaskGraph/worker evidence and may feed one IntegrationCheck; worktrees from different Changes must not be merged by the same IntegrationCheck.

This closes an old projection/runtime gap where project-wide ready worktrees could be combined across unrelated demands. The fix strengthens existing owners instead of adding a workflow runtime, child-Change framework, memory system, permission system, or evidence family.

## Scope

In scope:

- IntegrationCheck same-Change target collection and candidate projection.
- Workbench confirmation projection for selected-Change integration candidates.
- Scoped automation and Goal Loop controlled continuation runtime self-guards.
- Tests proving same-Change multi-worktree integration remains valid and cross-Change integration fails closed.
- Existing archived/follow-up conversation and maintenance closeout boundary evidence.

Out of scope:

- Full parallel executor, slot allocator, child Change creation, or cross-Change merge/landing design.
- Automatic remote push/merge/PR, integration apply/discard, or Harness evolution.
- New permission, workflow, memory, evidence, or projection framework.
- Real UI acceptance unless product-visible behavior needs manual browser confirmation beyond projection tests.

## Current Status

Completed and archived.

## Verification

Passed:

- `npx vitest run tests/unit/integration-check-candidates.test.ts tests/unit/automation-runtime.test.ts tests/unit/goal-loop-runtime.test.ts --reporter=dot`
- `npx vitest run tests/unit/workbench-conversation-lifecycle.test.ts tests/unit/agent-task-boundaries.test.ts --reporter=dot`
- `npx vitest run tests/unit/workbench-read-model.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Notes:

- The first aggregate `npm run test:fast` hit the known aggregate-only DOM run-graph flake in `tests/unit/web-app.test.tsx`. The single test, the full `web-app.test.tsx`, and the final `npm run test:fast` rerun all passed.
- A selected slow `workbench-apply-integration-flow` run exceeded the normal tool window during diagnostic work. The product guard is covered by new IntegrationCheck candidate unit tests, Workbench read-model projection tests, runtime guard tests, and the fast Workbench aggregate. The slow release path remains explicit deep coverage.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no product workaround; cross-Change IntegrationCheck is now fail-closed at target collection, candidate projection, and explicit run requests.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: current handoff docs will be updated with a compact boundary statement only.
- Experience lifecycle result: retain as product boundary; detailed test and diagnostic history remains archive-only.
- Roadmap/current-direction stale language check: remove the active pointer on close and route to the archived summary.
- Old experience retained / merged / retired / archive-only: merge the Change-per-loop boundary into current baseline; keep cross-Change diagnostic details archive-only.
