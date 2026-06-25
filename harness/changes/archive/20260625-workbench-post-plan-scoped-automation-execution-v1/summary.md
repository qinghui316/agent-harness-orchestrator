# workbench-post-plan-scoped-automation-execution-v1

## Purpose

Tighten Workbench scoped `完全访问权限` so it only applies after the user has
manually confirmed the plan. The current implementation still exposes scoped
automation for `planning.confirm-execution`; this conflicts with the product
boundary that planning generation and plan confirmation remain human decisions.

This change reuses the existing automation runtime, current-gate revalidation,
Workbench confirmation queue, and DecisionPanels surface. It does not add a new
loop engine, scheduler executor, permission system, evidence family, or source
apply path.

## Scope

In scope:

- Remove `planning.confirm-execution` from scoped automation eligibility.
- Require post-plan automation to start only from existing execution-stage gates.
- Keep `planning.decomposition.confirm` automatic only when the current gate is
  already eligible and target-scoped; scope expansion remains a stop/user gate.
- Add targeted runtime, revalidation, read-model, and DOM coverage.

Out of scope:

- Automatic planning generation or plan confirmation.
- Automatic source apply, close/archive, integration apply/discard, merge,
  remote landing, Harness evolution, raw scheduler actions, or full parallel
  execution.
- A second automation runtime/state machine or new evidence/projection family.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx tests/unit/workflow-actions.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.

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

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
