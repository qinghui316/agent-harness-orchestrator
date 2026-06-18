# Project Status

## Current Handoff

- Current date: 2026-06-18.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260619-phase-12u-product-maintenance-canonical-patch-target-descriptors/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260619-phase-12u-product-maintenance-canonical-patch-target-descriptors/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12o-12s-product-maintenance-evidence/summary.md`.
- Active product phase: none.
- Active Harness evolution phase: none.
- Active close status: none.

This file is the short resume point. Phase 12U is archived after adding optional, safe canonical patch target descriptors when maintenance evidence supplies explicit target paths and concrete patch payloads. It remains read-only evidence: no writer, no automatic canonical docs or stable-memory rewrite, no Workbench apply action, and no human-gate bypass.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-Phase-12U with no active change and no pending Harness evolution. Goal Loop controlled-loop state, routing posture, and SchedulerRun terminal handoff evidence remain non-executing evidence only. SchedulerRun terminal Workpad completion and blocked-closeout cards remain read-only evidence and do not authorize loop/full-executor/dispatch/slot/source/apply/close/merge/Harness-evolution behavior.

Product-level maintenance writes candidate lifecycle-resolution evidence, canonical update proposal evidence, human-gated canonical update decision records, canonical patch proposal evidence, human-gated canonical patch application follow-up records, read-only application manifest/readiness evidence, and Phase 12U target-descriptor evidence after candidate score/review while still forbidding automatic canonical rewrites.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

Resume the next structured product slice from `docs/CURRENT-DEVELOPMENT-PLAN.md`. The likely next product-maintenance step is a human-gated deterministic canonical patch application writer that consumes Phase 12U descriptors, revalidates target hashes, and still does not bypass ToolPolicyGate, Validation, Audit, IntegrationCheck, or human gates. Keep `README.md` unrelated and untracked unless the user explicitly asks to include it.

## Verification Commands

Harness/documentation verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification when product code changes:

```powershell
npm run typecheck
npm run lint
npm run test:fast
npm run build
npm run test:integration
npm run test:workbench
```

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with archived `summary.md` files; open specs, plans, reviews, or source only when the current task needs that evidence.

Recent key archive summaries:

- Phase 12U Product Maintenance Canonical Patch Target Descriptors: `harness/changes/archive/20260619-phase-12u-product-maintenance-canonical-patch-target-descriptors/summary.md`.
- Phase 12T Product Maintenance Canonical Patch Application Manifest: `harness/changes/archive/20260618-phase-12t-product-maintenance-canonical-patch-application-manifest/summary.md`.
- Phase 12S Product Maintenance Canonical Patch Application Gate: `harness/changes/archive/20260618-phase-12s-product-maintenance-canonical-patch-application-gate/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12o-12s-product-maintenance-evidence/summary.md`.
- Phase 12R Product Maintenance Canonical Patch Proposal Evidence: `harness/changes/archive/20260618-phase-12r-product-maintenance-canonical-patch-proposal-evidence/summary.md`.
- Phase 12Q Product Maintenance Canonical Update Decision Gate: `harness/changes/archive/20260618-phase-12q-product-maintenance-canonical-update-decision-gate/summary.md`.
- Phase 12P Product Maintenance Canonical Update Proposal Evidence: `harness/changes/archive/20260618-phase-12p-product-maintenance-canonical-update-proposal-evidence/summary.md`.
- Phase 12O Product Maintenance Candidate Lifecycle Resolution: `harness/changes/archive/20260618-phase-12o-product-maintenance-candidate-lifecycle-resolution/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back into this handoff unless they change current agent decisions.
