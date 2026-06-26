# Post Desktop Product Entry Window Evolution Proposal

## Decision

`ecl_update`.

## Evidence Window

- `harness/changes/archive/20260626-auto-evolve-post-orchestration-map-window/summary.md`
- `harness/changes/archive/20260626-document-desktop-cc-gui-reference-map-and-product-layer-roadmap/summary.md`
- `harness/changes/archive/20260626-desktop-cc-gui-local-only-reference-correction/summary.md`
- `harness/changes/archive/20260627-workbench-project-home-codex-diagnostics-v1/summary.md`
- `harness/changes/archive/20260627-workbench-desktop-cc-gui-aligned-home-and-conversation-entry-v1/summary.md`

## Finding

The reviewed window shows a narrow but durable process gap. Existing
Workbench user-surface honesty rules already say not to expose fake actions,
and current reference policy already says reference clones are local-only.
However, the desktop product-entry correction showed a more specific failure:
conceptual or screenshot-level reference alignment can still produce wrong UI
when interaction-level reference source has not been inspected.

The minimal durable fix is a semantic ECL/review-template rule requiring
reference-driven product/UI changes to record the reference map section,
interaction source files or inspected commit, and a fake-control check.

## Independent Review

Subagent `Huygens` recommended `ecl_update`, score `84/100`.

Key points:

- Promote a durable reference-driven UI rule.
- Retain existing Workbench user-surface honesty and local-only reference
  policy.
- Merge the reference-index instruction to inspect relevant source into ECL
  review coverage.
- Retire stale lower `docs/STATUS.md` pending/latest wording.
- Keep screenshot paths, E-drive acceptance paths, ports, DOM notes, and
  submodule workaround detail archive-only.

## Experience Retention Scan

- Promote: add compact ECL and review-template coverage for reference-driven
  product/UI source evidence and fake-control checks.
- Retain: current Workbench user-surface honesty, reference local-only policy,
  and Harness workflow-truth boundaries.
- Merge: `docs/references/index.md` guidance that agents must inspect relevant
  source for specific mechanisms is now visible in ECL for structured UI work.
- Retire: stale lower `docs/STATUS.md` next-resume wording that said pending
  evolution was none and pointed latest product work at the previous project
  diagnostics slice.
- Archive-only: screenshots, ports, E-drive paths, source excerpts, DOM
  details, submodule workaround history, and phase-by-phase narrative.

## Applied Delta

- `docs/ECL.md`: added `Reference-Driven UI / Product Source Evidence
  Coverage`.
- `harness/templates/change/reviews/review.md`: added a matching review
  section.
- Current handoff docs: aligned pending/latest state and next product
  direction during closeout.

## Non-Changes

- No Workbench runtime or UI code.
- No lint rule.
- No provider/model implementation.
- No reference source tracking or vendoring.
- No product permission, scheduler, apply, close, remote, PR, or Harness
  evolution automation change.

## Validation Plan

- `scripts/lint-ecl.ps1`
- `scripts/lint-encoding.ps1`
- `scripts/harness-change.ps1 reindex`
- `scripts/harness-change.ps1 status`
- `scripts/harness-evolve.ps1 check`
