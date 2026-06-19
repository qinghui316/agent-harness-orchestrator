# Workbench Test Architecture Split Window Evolution Proposal

## Candidate Window

- `harness/changes/archive/20260620-workbench-test-architecture-demand-worker-unit-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-test-architecture-apply-integration-slow-suite-split/summary.md`
- `harness/changes/archive/20260620-workbench-test-architecture-maintenance-slow-suite-split/summary.md`
- `harness/changes/archive/20260620-workbench-test-architecture-read-model-unit-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-test-architecture-task-runtime-domain-split/summary.md`

## Decision

Proposed result: `keep`.

No new Harness rule, template, linter, or product runtime change is proposed. The evidence reinforces existing current guidance:

- split overloaded Workbench tests by coherent capability domain;
- reuse existing shared fixture owners instead of creating feature-local fixture frameworks;
- run targeted suites during iteration and reserve full Workbench aggregate runs for close evidence or script-contract changes;
- keep product behavior unchanged during test architecture convergence.

## Evidence Summary

The five candidate changes repeatedly moved Workbench coverage into explicit capability suites while preserving behavior:

- DemandWorker moved to an explicit unit domain suite and remained excluded from `test:fast`.
- Apply/IntegrationCheck/source-refresh moved to an explicit slow suite.
- Maintenance/self-evolution flows moved to an explicit slow suite.
- Read-model/projection coverage moved to an explicit unit domain suite.
- TaskRun/TaskQueue/WorkflowRun/typed-workflow runtime guard coverage moved to an explicit unit domain suite.

The same lesson already exists in current project memory:

- `docs/CURRENT-DEVELOPMENT-PLAN.md` names Workbench test architecture as a convergence target and says to split by capability domain first.
- `docs/STATUS.md` says test-only relocation should run affected capability suites and adjacent risk suites first, not repeat full Workbench aggregate unless shared runtime changed or close evidence has a gap.
- `docs/DEVELOPMENT.md` documents `test:fast`, `test:workbench`, and `test:workbench:slow`.
- `docs/ECL.md` already requires Module Boundary, Core Mechanism Reuse, Documentation Entropy, and Experience Lifecycle coverage where applicable.

## Experience Retention Scan

| Decision | Item | Rationale |
| --- | --- | --- |
| Promote | None. | No new durable rule gap was found; current docs already direct future agents to capability-domain split and targeted verification. |
| Retain | Workbench test architecture convergence guidance in `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/STATUS.md`. | It directly changes current agent behavior and matches repeated archive evidence. |
| Merge | Repeated archive notes about targeted verification and larger coherent test work packages remain represented by one current rule rather than copied into AGENTS/STATUS repeatedly. | Prevents current-doc growth while preserving the lesson. |
| Retire | No current rule retired. | Existing rules are not stale or contradictory. |
| Archive-only | Per-suite timing details, transient import/helper drift, and individual timeout retries. | These are historically useful but should not become permanent Harness rules. |

## Documentation Entropy Assessment

No current-doc expansion is proposed. Adding another ECL rule would duplicate existing Architecture Growth Control and current test-strategy guidance. The useful durable memory is already compact; detailed phase narratives should remain archive-only.

## Validation Plan

- Independent subagent review of this proposal.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete`
