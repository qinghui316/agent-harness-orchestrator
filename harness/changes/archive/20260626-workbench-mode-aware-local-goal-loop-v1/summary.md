# workbench-mode-aware-local-goal-loop-v1

## Purpose

Implement the first mode-aware local Goal Loop coordinator for Workbench.
`请求批准` and `完全访问权限` should share the same observe / decide /
reconcile loop; only the act phase differs. Request-approval mode leaves the
current real gate for the user. Full-access mode may consume allowed local gates
inside the current Change after the user manually confirms the plan.

## Scope

In scope:

- A thin coordinator in the existing `src/goal-loop-runtime/` owner.
- Reusing the existing Workbench confirmation queue, current-gate
  revalidation, scoped automation runtime, and controlled scheduler wrapper.
- Workbench UI copy that presents the two choices as post-plan execution modes.
- Targeted coverage for request-approval and full-access loop behavior.

Out of scope:

- New workflow engine, permission system, projection framework, or evidence
  family.
- Automatic plan confirmation.
- Raw `planning.scheduler.*` automation.
- Integration apply/discard automation.
- PR, remote, merge, push, or Harness evolution automation.
- Full parallel executor, slot allocator, or child Change creation.

## Current Status

Completed / ready to close.

## Verification

- `npx vitest run tests/unit/goal-loop-runtime.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx tests/unit/workflow-actions.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; close-ready with only closeout task pending before this update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution and 4 archives since last completion.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: in-app browser connection failed before navigation with `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`. This is the same local browser connector class seen in previous acceptances and was not treated as Workbench UI success.
- Screenshots / artifacts / run ids: no browser screenshot; DOM/unit and Workbench aggregate evidence listed above.
- External source/state safety: no external source-root mutation occurred in this change. Real browser E-drive acceptance remains not claimed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: compact handoff update only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: update handoff docs to make mode-aware local Goal Loop the latest product change and record the browser acceptance limitation.
- Old experience retained / merged / retired / archive-only: not applicable.
