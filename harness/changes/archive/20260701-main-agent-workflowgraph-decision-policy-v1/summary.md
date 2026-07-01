# main-agent-workflowgraph-decision-policy-v1

## Purpose

Add a non-executing WorkflowGraph decision policy owner for main-agent orchestration. The policy consumes replay-summary core state and produces a bounded recommendation for what the main agent should observe, wait for, or continue next.

This is an architecture migration slice only. It does not add UI, execute workflow actions, start scheduler/worker/integration paths, or change Harness authority.

## Scope

In scope:

- Add `src/main-agent-orchestration/decision-policy.ts`.
- Refactor WorkflowGraph replay so `nextObservation` is derived from the new policy after summary core construction.
- Remove replay's direct dependency on the graph observation classifier.
- Stop public re-export of `decideMainAgentWorkflowGraph` from the main-agent orchestration barrel while keeping graph observation evidence behavior.
- Add unit and module-boundary coverage for policy behavior and non-execution boundaries.

Out of scope:

- Workbench UI changes.
- Confirmation queue, action bridge, action registry, revalidation, or automation allowlist changes.
- Scheduler, WorkerLease, IntegrationCheck, apply, close, remote, PR, merge, or Harness evolution execution.
- Free LLM decision policy.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-task-runtime.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

`npm run build` passed with the existing Vite chunk-size warning.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Arendt reviewed the plan and required two fixes before implementation: avoid policy/replay circular input, and stop replay from using `decideMainAgentWorkflowGraph` to derive current state.
- Retries or environment failures: one Workbench orchestration-map unit test failed once inside the first `npm run test:fast` aggregate run, then passed in targeted rerun and the full `npm run test:fast` rerun.
- Screenshots / artifacts / run ids: not applicable; no UI change.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: current handoff pointers in `AGENTS.md` and `docs/STATUS.md` updated for the active change.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: no roadmap wording changed; this change is an internal architecture slice.
- Old experience retained / merged / retired / archive-only: not applicable.
