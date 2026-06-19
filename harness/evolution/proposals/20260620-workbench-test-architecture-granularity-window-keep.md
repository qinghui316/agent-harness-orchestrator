# Workbench Test Architecture Granularity Window

## Candidate Window

Pending source: `harness/evolution/pending.md`.

Candidate archives:

- `harness/changes/archive/20260619-maintenance-canonical-patch-application-target-kind-boundary-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-test-architecture-scheduler-slow-suite-split/summary.md`
- `harness/changes/archive/20260619-workbench-test-architecture-remote-landing-slow-suite-split/summary.md`
- `harness/changes/archive/20260620-workbench-test-architecture-goal-loop-prompt-slow-suite-split/summary.md`
- `harness/changes/archive/20260620-workbench-test-architecture-demand-worker-unit-domain-split/summary.md`

## Recommendation

Result: `keep`.

Evaluation mode: `independent_review`.

Do not add a new Harness rule, review-template field, lint check, product runtime behavior, or ECL workflow authority in this window. The evidence is already covered by existing Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicyGate, and human-gate rules.

## Evidence Review

The maintenance target-kind boundary slice moved writer-local application-writable target-kind policy into the existing canonical patch target-boundary owner. That reinforces the current owner-module and shared-core-mechanism guidance without changing proposal/manifest authority, Workbench behavior, ToolPolicyGate, human gates, IntegrationCheck, apply/close, or runtime behavior.

The scheduler, remote landing, Goal Loop prompt, and DemandWorker Workbench test-architecture slices split overloaded Workbench tests into capability-domain or slow-suite files while preserving product behavior. They reused existing Workbench fixtures, kept slow flows under the explicit Workbench contract, and avoided new local test frameworks.

Together these archives show that the current convergence posture is working: keep moving repeated cross-cutting rules into existing owners and split Workbench tests by meaningful capability boundaries.

## Workbench Granularity Signal

The latest DemandWorker split was correct but too small as a standalone stage once the boundaries were already clear. Future Workbench test-architecture convergence should use a slightly larger work package when risk is low and ownership is clear: one complete capability domain or a small group of adjacent domains, with slow scenarios layered at the same time.

This is practical planning guidance, not a new Harness rule. It belongs in evolution evidence and next-resume guidance, while detailed phase history remains archive-only.

## Experience Retention Scan

- Promote: phase-granularity guidance for future Workbench test convergence when boundaries are already clear.
- Retain: Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicyGate, and human-gate rules remain current.
- Merge: Workbench test split lessons are merged under the existing test-architecture convergence direction.
- Retire: no current rule is retired in this window.
- Archive-only: exact per-suite migration details, transient timeout notes, and command logs remain in archived summaries/reviews.

## Boundary Matrix

| Artifact | Authority | Scope | Executable? |
| --- | --- | --- | --- |
| This proposal | Harness evolution evidence | Pending five-archive window | No |
| `harness/evolution/results.tsv` row | Harness evolution result log | Marks pending window handled | No product execution |
| Handoff next-resume wording | Current agent guidance | Future structured change selection | No |
| Existing ECL rules | Process constraints | Future structured changes | No direct source mutation |

## Validation Plan

- Subagent plan review of the recommendation.
- Harness lint and encoding lint.
- `harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
- Final `harness-evolve.ps1 check` confirms pending evolution is cleared.
