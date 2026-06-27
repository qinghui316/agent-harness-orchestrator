# Spec: auto-evolve-post-codex-model-picker-window

## Goal

Handle the pending Harness evolution window generated after the Codex
runtime-model-picker product change. Decide whether the five candidate
archives justify new Harness rules, template changes, documentation merges, or
a no-op result.

## Users

- Future AHO agents that rely on compact current handoff docs.
- Future reviewers of reference-driven Workbench UI/product changes.

## Acceptance Criteria

- AC-001: Candidate archive evidence is reviewed and an independent subagent
  score/recommendation is recorded.
- AC-002: An evolution proposal records decision, evidence, applied delta,
  non-changes, and Experience Retention Scan.
- AC-003: Only evidence-backed minimal Harness/docs changes are applied; no
  product runtime or fake process layers are added.
- AC-004: `harness/evolution/results.tsv`, `state.json`, and `pending.md`
  reflect completed pending evolution through `harness-evolve mark-complete`.
- AC-005: Handoff docs and `harness/changes/INDEX.json` are aligned before
  close.

## Non-Goals

- Changing Workbench product runtime, UI behavior, Codex model selection,
  Skills, file references, scheduler, automation, apply/close, PR, remote,
  merge, or Harness evolution product behavior.
- Adding a new ECL rule or lint rule unless archive evidence proves an
  uncovered repeated gap.
- Promoting screenshots, E-drive paths, run ids, ports, stderr, or detailed
  archive narratives into current docs.

## Constraints

- Use existing ECL/Harness evolution process.
- Keep current docs compact; archive owns detailed history.
- Do not track or vendor reference source.
- Do not stage unrelated `package.json`, `package-lock.json`, `README.md`, or
  `reference-projects/` changes.

## Risks

- Over-promoting one product UI mistake into permanent Harness bloat.
- Leaving stale current-state handoff text that conflicts with archive and
  pending state.
- Treating product-visible controls as not applicable to user-surface honesty
  just because they do not mutate the primary action surface.
