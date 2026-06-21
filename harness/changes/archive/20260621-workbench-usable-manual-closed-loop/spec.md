# Spec: workbench-usable-manual-closed-loop

## Goal

Make the next product step a real Workbench usability convergence slice. A user
should be able to complete one bounded local demand through the Workbench main
surface under existing human gates, with evidence for result, validation, audit,
apply readiness, and close/archive handoff.

## Users

- Product user asking AHO to make a local project change from Workbench.
- Agent/operator resuming AHO from repository handoff docs.
- Reviewer checking whether Workbench shows implemented actions honestly.

## Acceptance Criteria

- AC-001: A user can start from the Workbench main conversation and understand the requested demand without needing raw ECL, Scheduler, Goal Loop, Workpad, or internal runtime terms as required workflow knowledge.
- AC-002: The main Workbench surface can express current understanding, current state, and the next safe decision for the chosen manual-gated loop.
- AC-003: The right confirmation queue exposes only the current real primary gate for each sampled stage, and that gate carries the explicit target ids required by the server action contract.
- AC-004: Role result, validation, audit, apply readiness, and close readiness are traceable to existing artifact or evidence references in the chosen loop.
- AC-005: The source root is not mutated before explicit apply confirmation, and after apply the acceptance record includes before/after source-state evidence.
- AC-006: The loop reaches close/archive handoff, and current handoff docs no longer direct the immediate next product step to full-auto task mode before the usable manual loop is proven.

## Non-Goals

- Implementing full-auto task mode, automation authorization, or no-human-confirm execution.
- Implementing remote PR/push/merge/ready-for-review behavior.
- Promoting Goal Loop, preflight, readiness, summary, decision, handoff, or prompt-context evidence into workflow authority.
- Implementing a scheduler loop, full executor, slot allocator, child Change creation, or automatic apply/close.
- Creating new evidence families unless the existing artifact path cannot represent the acceptance result.

## Constraints

- Reuse existing Workbench action registry, scoped target revalidation, ToolPolicyGate, artifact store, validation/audit, apply, and close mechanisms wherever possible.
- Server actions must fail closed for missing, stale, forged, or cross-change targets.
- Workbench visible primary UI must not advertise future-only capabilities.
- Documentation updates must stay compact and route history to archived summaries and `harness/changes/INDEX.json`.
- `README.md` remains unrelated and untracked unless explicitly requested otherwise.

## Risks

- The existing Workbench fixtures may prove CLI paths rather than a true main-surface loop.
- Slow Workbench aggregate tests may remain too broad or flaky to use as the primary signal.
- Handoff docs already contain repeated controlled Scheduler history; over-cleaning them could obscure useful current boundaries.
