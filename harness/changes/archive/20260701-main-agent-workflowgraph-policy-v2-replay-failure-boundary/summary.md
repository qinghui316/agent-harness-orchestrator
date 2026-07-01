# main-agent-workflowgraph-policy-v2-replay-failure-boundary

## Purpose

Tighten the non-executing WorkflowGraph replay policy after replay consumption has already been centralized. This change makes active-queue policy output read as observation guidance, hardens replay/history/policy derivation failures into bounded evidence gaps, and fixes current roadmap/handoff drift.

## Scope

In scope:

- Rename active queue observation advice from `continue-queue-step-loop` to `observe-active-queue-loop`.
- Preserve `MainAgentWorkflowGraphReplaySummary -> decision policy -> nextObservation` as a read-only chain.
- Keep canonical graph observation write failures fail-closed, while replay/history/policy derivation failures degrade to replay health/gaps.
- Add tests for non-execution, created/unbound WorkflowRun behavior, unsafe gaps, replay fallback, and observation/replay parity.
- Update current docs that still describe replay consumption as remaining work.

Out of scope:

- Workbench UI, transcript, right rail, Agent graph, prompt context, and confirmation card changes.
- Action bridge, Scheduler/WorkerLease/IntegrationCheck, apply/close, remote/merge/PR, Harness evolution, or automation allowlist changes.
- Shared classifier extraction or old seam retirement.
- Archive summary rewrites.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts` passed.
- `npx vitest run tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` passed with close-ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed; no pending evolution.

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

- Documentation entropy check: current handoff docs updated only for active path, replay consumption completed status, Policy V2 next slice, and latest implementation pointer.
- Experience lifecycle result: not applicable; this is not a Harness evolution.
- Roadmap/current-direction stale language check: removed stale replay-consumption remaining language.
- Old experience retained / merged / retired / archive-only: archive summaries unchanged; current docs keep only behavior-changing handoff/roadmap facts.
