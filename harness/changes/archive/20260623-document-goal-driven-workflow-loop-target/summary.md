# document-goal-driven-workflow-loop-target

## Purpose

Clarify AHO's future Goal-driven Workflow Loop target so later agents do not
misread the architecture as "every TaskGraph node enters a worktree" or
"Scheduler is the product core." The intended target is a main-Agent loop over
a persistent Goal/Change: observe current evidence, choose the next legal
strategy, run bounded work when allowed, record evidence, and stop at human
gates or blockers.

This is a documentation convergence change only. It records the relationship
between Goal Loop, WorkflowGraph/WorkflowRun, Scheduler/worktree execution, and
ToolPolicy/human gates without adding runtime behavior.

## Scope

In scope:

- Add a concise Goal-driven Workflow Loop target to
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Clarify the positive final user experience in `docs/PRODUCT.md`.
- Add a reference-combination explanation to
  `docs/AGENT-DEVELOPMENT-OS.md`.
- Adjust `docs/WORKBENCH.md` so future loop UX remains conversation-first and
  does not expose raw scheduler/task internals as required user workflow.
- Add a top-level positioning note to
  `docs/design-docs/controlled-scheduler-loop.md`.
- Update handoff docs only as needed for ECL active/close consistency.

Out of scope:

- Product runtime behavior changes.
- Full-auto implementation.
- Scheduler loop runtime, whole-wave dispatch, slot allocation, automatic child
  Change creation, or parallel executor implementation.
- New evidence family, summary layer, or Workbench UI card.
- Reference submodule updates.

## Current Status

Completed.

## Verification

- Drift grep for misleading Scheduler/full-auto/parallel claims: pass; the only
  direct rejected-phrase hit is in this active change summary as an explicit
  anti-goal.
- Active handoff grep: pass; `AGENTS.md` and `docs/STATUS.md` both point to
  `harness/changes/active/document-goal-driven-workflow-loop-target/`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`:
  pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`:
  pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`:
  ran before T-008 was marked complete and reported the expected incomplete-task
  drift with STATUS alignment true.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`:
  pass; no pending evolution.
- `scripts/lint-ecl.ps1`: initial run failed during the expected intermediate
  state while T-008 was still open; rerun required after this close-ready update.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`:
  pass.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`:
  pass.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`:
  pass.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`:
  pass; no active change, STATUS aligned.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`:
  pass; no pending evolution.
- Final handoff: `AGENTS.md` and `docs/STATUS.md` point to this archive as the
  latest product/Harness docs change.

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

- Documentation entropy check: applicable because this change updates current
  roadmap, product, Workbench, and handoff documents.
- Experience lifecycle result: not an auto-evolve change; old scheduler/full
  parallel wording is merged into a shorter current target model rather than
  copied forward as more phase history.
- Roadmap/current-direction stale language check: completed; the current plan
  now names Goal-driven Workflow Loop as future target while current capability
  remains manual-gated real local loop acceptance.
- Old experience retained / merged / retired / archive-only: promoted the target
  loop model, merged reference lessons into one current direction, retained
  human gates/manual baseline, and left phase history archive-only.
