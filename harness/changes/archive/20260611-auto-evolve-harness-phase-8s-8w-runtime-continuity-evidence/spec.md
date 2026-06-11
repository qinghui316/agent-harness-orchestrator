# Spec: Auto Evolve Harness Phase 8S 8W Runtime Continuity Evidence

## Goal

Evaluate the Phase 8S through Phase 8W archive window and determine whether recent SchedulerContract and Runtime Continuity work exposes any gap in Harness rules, templates, lint, or handoff discipline.

If existing coverage is sufficient, record a `noop/subagent_review` result and remove `harness/evolution/pending.md` through `harness-evolve.ps1 mark-complete`.

## Users

- Future AHO implementers who need clear guardrails before building scheduler, worker-session, permission, or external-execution features.
- Maintainers reviewing whether archived product work should harden Harness rules.
- Coding agents that rely on `docs/ECL.md`, `docs/BOUNDARIES.md`, templates, and STATUS handoff to avoid architectural drift.

## Acceptance Criteria

- AC-001: The Phase 8S-8W pending evolution window is reviewed and completed.
- AC-002: The review explicitly evaluates SchedulerContract no-execution, Runtime Continuity auxiliary evidence, ToolPolicyGate authority, reference-project boundaries, and Future Feature owner-module coverage.
- AC-003: A Harness evolution proposal is written under `harness/evolution/proposals/`.
- AC-004: Authorized subagent review is recorded with scope, recommendation, score, and limitations.
- AC-005: If no concrete Harness gap is found, the result is `noop/subagent_review`.
- AC-006: `harness-evolve.ps1 mark-complete` removes `harness/evolution/pending.md` and appends a `results.tsv` row.
- AC-007: Handoff docs end with active change none, pending evolution none, and latest Harness evolution pointing to this archived change.
- AC-008: No product runtime, scheduler, Workbench, CLI, route, UI, artifact-shape, or workflow-truth behavior changes.
- AC-009: Harness verification passes, or any pre-existing failure is clearly recorded.

## Non-Goals

- Do not modify product code.
- Do not add new scheduler, parallel executor, child Change creation, permission engine, Workbench action, route, CLI command, UI, ODWF runtime, or cache/replay behavior.
- Do not add a new Harness rule, template field, or lint check unless the evidence review finds a concrete gap.
- Do not include unrelated untracked `README.md`.

## Constraints

- The pending window is generated evidence and must be handled through the ECL evolution process, not by deleting `pending.md` manually.
- User explicitly authorized subagent review for this pending evolution.
- Reference projects are evidence only; their runtime or permission model must not be copied into AHO product code.
- `SchedulerContract`, `WorkerSession`, `RuntimeWorkspace`, `EventSource`, and `AgentEventEnvelope` remain auxiliary evidence or planning inputs, not workflow truth.

## Risks

- Overfitting one archive window into a permanent Harness rule could create process noise.
- Skipping evolution would leave `pending.md` as stale handoff debt.
- Treating Runtime Continuity or permission evidence as authority would conflict with AHO's workflow-truth and ToolPolicyGate boundaries.
