# Review: workbench-loop-per-change-boundary-guard-v1

## Status

Ready to close.

## Findings

No blocking findings.

The implementation matches the intended boundary: a long-lived demand may have multiple loop executions over time, but a single loop execution and its scheduler worker/integration evidence are bound to one Change. Cross-Change worktree outputs no longer produce one IntegrationCheck candidate or run.

## Coverage Plan

- IntegrationCheck same-Change coverage: `tests/unit/integration-check-candidates.test.ts` covers selected same-Change grouping, explicit cross-Change rejection, and requested Change mismatch rejection.
- Workbench projection coverage: `tests/unit/workbench-read-model.test.ts` and updated confirmation candidate projection keep IntegrationCheck candidates scoped to the selected Change.
- Scoped automation runtime guard coverage: `tests/unit/automation-runtime.test.ts` covers fail-closed behavior when the current child gate belongs to another Change.
- Goal Loop runtime guard coverage: `tests/unit/goal-loop-runtime.test.ts` covers fail-closed behavior before dispatching a controlled advance for another Change.
- Archived/follow-up boundary coverage: `tests/unit/workbench-conversation-lifecycle.test.ts` confirms archived conversations receive linked follow-up demands instead of mutating the archived Change.
- Maintenance threshold coverage: `tests/unit/agent-task-boundaries.test.ts` remains the evidence for closeout/maintenance boundaries and avoids counting worker/iteration noise as additional terminal Changes.
- Source safety coverage: IntegrationCheck apply behavior was not changed; this slice changes candidate collection, run eligibility, and runtime self-guards before source mutation.
- Runtime bridge boundary coverage: automation and Goal Loop runtime guards reuse current gate evidence and stop before child dispatch on Change mismatch.
- Module boundary coverage: logic stayed in existing owners: integration-check candidate/service, Workbench confirmation projection, automation runtime, Goal Loop runtime, scheduler handoff, and tests.
- Core mechanism reuse coverage: the fix reuses existing Workbench current gate/revalidation flows and IntegrationCheck target collection instead of creating a new permission or workflow layer.

## Complexity Deletion Review

delete: removed the old implicit project-wide IntegrationCheck candidate behavior that could combine ready worktrees from unrelated Changes.
reuse: reused integration-check target collection, Workbench confirmation queue, automation runtime, Goal Loop runtime, scheduler handoff, conversation lifecycle, and maintenance closeout tests.
yagni: avoided child Change framework, new permission system, new memory system, new workflow runtime, new evidence family, and future cross-Change merge shell.
shrink: implemented this as an optional `changeId` filter plus one same-Change assertion instead of a new candidate service or planner layer.
net: small code increase for explicit guards and tests; complexity decreases because cross-Change IntegrationCheck semantics are no longer ambiguous.

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

Residual risk:

- The explicit slow release IntegrationCheck flow remains heavy and is not part of the daily gate. A selected diagnostic run exceeded the normal tool window, so this change relies on targeted candidate/runtime/projection evidence plus the fast Workbench aggregate for closeout.
