# Spec: Auto Evolve Harness Post Real UI Scheduler Window

## Goal

Handle `harness/evolution/pending.md` for the latest five-archive window and
keep only the smallest evidence-backed Harness delta.

## Users

- Future AHO agents implementing or reviewing Workbench decision-surface
  changes.
- Maintainers relying on ECL and review templates to keep user-visible gates
  honest.

## Acceptance Criteria

- AC-001: A Harness evolution proposal exists and classifies candidate lessons
  with Promote / Retain / Merge / Retire / Archive-only decisions.
- AC-002: An independent subagent review records recommendation, score, scope,
  and limitations.
- AC-003: Any promoted rule is grounded in archived evidence, is compact, and
  updates existing ECL/template sections instead of adding a new process layer.
- AC-004: Existing real Codex, Goal Loop, Scheduler, source-safety, and
  aggregate-timeout rules are retained rather than duplicated.
- AC-005: `harness/evolution/results.tsv`, `harness/evolution/state.json`, and
  `pending.md` are updated through `scripts/harness-evolve.ps1 mark-complete`.
- AC-006: Handoff docs and `harness/changes/INDEX.json` are consistent after
  close.

## Non-Goals

- Product runtime behavior changes.
- Workbench UI implementation changes.
- Full-auto, Scheduler loop, parallel executor, child Change creation, or
  remote landing behavior.
- New Harness scripts, lint rules, evidence families, or broad process docs.

## Constraints

- `pending.md` is a reminder, not workflow truth; applying evolution still
  requires proposal, independent review, validation, results row, and
  mark-complete.
- Subagent review is read-only and does not replace the ECL lifecycle.
- Do not hand-edit `harness/changes/INDEX.json`.
- Keep `AGENTS.md` and `docs/STATUS.md` compact; detailed chronology remains
  archive-only.

## Risks

- Over-promoting one-off Workbench bugs into broad Harness rules.
- Duplicating rules already promoted by the previous real-Codex acceptance
  evolution window.
- Letting current handoff docs accumulate archive ledger detail.
