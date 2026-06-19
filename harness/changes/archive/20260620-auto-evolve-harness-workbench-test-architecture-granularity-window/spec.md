# Spec: Auto Evolve Harness Workbench Test Architecture Granularity Window

## Goal

Handle the pending Harness evolution generated after the latest five archived product changes. Evaluate whether the maintenance target-kind reuse and Workbench test-architecture split window requires new Harness rules, templates, lint, current-plan guidance, or product runtime changes.

The expected outcome is a narrow Harness evolution record. If existing Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicyGate, and human-gate rules are sufficient, mark the evolution as `keep` and record the practical Workbench test-architecture granularity lesson without expanding product scope.

## Users

- AHO maintainers and future agents who rely on Harness evolution to keep process experience current without bloating active docs.
- Future agents continuing Workbench test-architecture convergence.

## Acceptance Criteria

- AC-001: The five candidate archive summaries in `harness/evolution/pending.md` are reviewed and classified.
- AC-002: A Harness evolution proposal is written under `harness/evolution/proposals/` with a clear keep/change/noop decision.
- AC-003: Independent review confirms whether existing rules are sufficient and whether the Workbench test-architecture granularity lesson is captured.
- AC-004: Harness validation passes and `scripts/harness-evolve.ps1 mark-complete` clears `harness/evolution/pending.md`.
- AC-005: Handoff docs end with no active change, no pending evolution, and a current next resume point.

## Non-Goals

- Product runtime, Workbench, scheduler, Goal Loop, ToolPolicyGate, human gate, IntegrationCheck, apply/close, ECL rule/template, or lint behavior changes.
- Implementing another Workbench test split inside this evolution change.
- Promoting archive ledger detail into current handoff docs.
- Including unrelated `README.md`.

## Constraints

- Treat candidate archives as evolution evidence, not permission for source expansion.
- Keep current docs compact: promote only decision-shaping lessons, leave historical details in archives and `harness/changes/INDEX.json`.
- If no new rule is necessary, prefer `keep` over adding redundant process text.
- Preserve workflow truth and all human gates.

## Risks

- Overreacting to one small phase-size issue by adding duplicate Harness rules.
- Leaving pending evolution uncleared after product change close.
- Handoff drift between active change, pending evolution, and latest archive paths.
