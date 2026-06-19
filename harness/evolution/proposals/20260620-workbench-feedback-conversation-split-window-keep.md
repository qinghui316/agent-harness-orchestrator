# Workbench Feedback Conversation Split Window Evolution Proposal

## Candidate Window

- `harness/changes/archive/20260620-workbench-test-architecture-task-runtime-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-goal-loop-surface-test-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-planning-scheduler-prep-test-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-residual-test-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-feedback-conversation-test-domain-split/summary.md`

## Decision

Proposed result: `keep`.

No new Harness rule, template, linter, or product runtime change is proposed. The evidence reinforces current guidance that is already present:

- split overloaded Workbench tests by coherent capability domain;
- reuse existing shared fixture owners instead of creating feature-local fixture frameworks;
- keep package script membership explicit when moving Workbench suites;
- run targeted suites during iteration and reserve full Workbench aggregate runs for shared-runtime changes, script-contract changes, or close evidence gaps;
- keep product behavior unchanged during test architecture convergence.

## Evidence Summary

The five candidate changes repeatedly moved Workbench coverage into explicit capability suites while preserving behavior:

- TaskRun / TaskQueue / WorkflowRun / typed-workflow runtime guard coverage moved into `tests/unit/workbench-task-runtime.test.ts`.
- Goal Loop Workbench surface coverage moved into `tests/unit/workbench-goal-loop-surface.test.ts`.
- Planning, decomposition, readiness, TaskQueueProposal, WorkflowGraph, and scheduler-preparation coverage moved into `tests/unit/workbench-planning-scheduler-prep.test.ts`.
- Scheduler residual coverage split into `tests/unit/workbench-scheduler-runtime-surface.test.ts` and `tests/slow/workbench-scheduler-worker-runtime.test.ts`.
- Proposal-feedback and conversation-lifecycle coverage moved into `tests/unit/workbench-feedback-surface.test.ts` and `tests/unit/workbench-conversation-lifecycle.test.ts`.

The durable lesson already exists in current project memory:

- `docs/ECL.md` requires Core Mechanism Reuse / Architecture Growth Control, Documentation Entropy, Experience Lifecycle, module boundary, and handoff drift coverage where applicable.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` names Workbench test architecture as a convergence target and says to split by capability domain first.
- `docs/STATUS.md` says test-only relocation should run affected capability suites, adjacent risk suites, product checks, and the relevant aggregate contract first, without repeating the full Workbench aggregate unless shared runtime changed or close evidence has a gap.
- `docs/DEVELOPMENT.md` documents `test:fast`, `test:workbench`, and `test:workbench:slow`.

## Experience Retention Scan

| Decision | Item | Rationale |
| --- | --- | --- |
| Promote | None. | No new durable rule gap was found; current docs already direct future agents to capability-domain split, shared fixture reuse, explicit package script membership, and targeted verification. |
| Retain | Architecture Growth Control / Core Mechanism Reuse and Workbench test architecture convergence guidance. | It directly changes current agent behavior and matches repeated archive evidence. |
| Merge | Repeated archive notes about targeted verification and coherent test work packages remain represented by existing current-plan and STATUS guidance. | Prevents current-doc growth while preserving the lesson. |
| Retire | None. | Existing rules are not stale or contradictory. |
| Archive-only | Per-suite timing details, transient import/helper cleanup details, individual suite names after they become historical, and exact one-off command runtimes. | These are historically useful but should not become permanent Harness rules. |

## Independent Review

Subagent `019ee1cf-63ec-7523-ad86-14736dd5abdd` returned PASS before implementation. It found no evidence-backed durable Harness rule/template/lint/product-runtime change required instead of `keep` and required this proposal to evaluate the exact current pending candidate window, including `20260620-workbench-feedback-conversation-test-domain-split`.

## Documentation Entropy Assessment

No current-doc expansion is proposed beyond handoff state updates. Adding another ECL rule would duplicate existing Architecture Growth Control, Experience Lifecycle, and test-strategy guidance. Detailed phase narratives remain archive-only.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review ...`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
