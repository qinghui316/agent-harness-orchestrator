# Project Status

## Current Handoff

- Current date: 2026-06-19.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260619-maintenance-canonical-artifact-reference-reuse/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260619-maintenance-canonical-artifact-reference-reuse/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-maintenance-canonical-chain-evidence/summary.md`.
- Active product phase: none.
- Active Harness evolution phase: none.
- Active close status: none.

This file is the short resume point. There is no active ECL change and no pending Harness evolution. The latest product slice reused a small maintenance-layer helper for canonical artifact references across the canonical update / patch / application / report chain. Earlier product slices reused the maintenance artifact store for canonical update proposals, update decisions, canonical patch proposals, patch application gate records, and canonical patch application manifest/result/report artifacts. The latest Harness evolution reviewed the maintenance canonical chain evidence window, recorded a `keep` result, retained existing current rules as sufficient, and kept detailed phase/source-convergence narratives archive-only.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-maintenance canonical patch target-boundary, lineage, ledger-idempotency, artifact-store reuse, and canonical artifact-reference reuse across the proposal/decision/gate/application/report chain. The pending evolution trigger has been completed as `keep`. Goal Loop controlled-loop state, routing posture, and SchedulerRun terminal handoff evidence remain non-executing evidence only. SchedulerRun terminal Workpad completion and blocked-closeout cards remain read-only evidence and do not authorize loop/full-executor/dispatch/slot/source/apply/close/merge/Harness-evolution behavior.

Product-level maintenance writes candidate lifecycle-resolution evidence, canonical update proposal evidence, human-gated canonical update decision records, canonical patch proposal evidence, human-gated canonical patch application follow-up records, read-only application manifest/readiness evidence, Phase 12U target-descriptor evidence, Phase 12V human-gated canonical docs/stable-memory application result evidence, and Phase 12W read-only observation report evidence while still forbidding automatic canonical rewrites.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

Resume the next structured product slice from `docs/CURRENT-DEVELOPMENT-PLAN.md`. Continue the Architecture Growth Control register before opening another evidence-only or descriptor-only phase; the next source convergence candidate should stay narrow within the maintenance / canonical patch chain after the completed target-boundary, lineage, ledger-idempotency, artifact-store, and artifact-reference samples. Keep `README.md` unrelated and untracked unless the user explicitly asks to include it.

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

- Maintenance Canonical Artifact Reference Reuse: `harness/changes/archive/20260619-maintenance-canonical-artifact-reference-reuse/summary.md`.
- Maintenance Canonical Artifact Store Canonical Updates Adoption: `harness/changes/archive/20260619-maintenance-canonical-artifact-store-canonical-updates-adoption/summary.md`.
- Maintenance Canonical Artifact Store Reuse: `harness/changes/archive/20260619-maintenance-canonical-artifact-store-reuse/summary.md`.
- Maintenance Canonical Ledger Idempotency Reuse: `harness/changes/archive/20260619-maintenance-canonical-ledger-idempotency-reuse/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-maintenance-canonical-chain-evidence/summary.md`.
- Maintenance Canonical Patch Lineage Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-lineage-reuse/summary.md`.
- Maintenance Canonical Patch Target Boundary Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-target-boundary-reuse/summary.md`.
- Architecture Growth Control Core Mechanism Reuse: `harness/changes/archive/20260619-architecture-growth-control-core-mechanism-reuse/summary.md`.
- Phase 12W Product Maintenance Canonical Patch Application Observation Report Evidence: `harness/changes/archive/20260619-phase-12w-product-maintenance-canonical-patch-application-observation-report-evidence/summary.md`.
- Phase 12V Product Maintenance Canonical Patch Application Writer: `harness/changes/archive/20260619-phase-12v-product-maintenance-canonical-patch-application-writer/summary.md`.
- Phase 12U Product Maintenance Canonical Patch Target Descriptors: `harness/changes/archive/20260619-phase-12u-product-maintenance-canonical-patch-target-descriptors/summary.md`.
- Phase 12T Product Maintenance Canonical Patch Application Manifest: `harness/changes/archive/20260618-phase-12t-product-maintenance-canonical-patch-application-manifest/summary.md`.
- Phase 12S Product Maintenance Canonical Patch Application Gate: `harness/changes/archive/20260618-phase-12s-product-maintenance-canonical-patch-application-gate/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-phase-12s-12w-product-maintenance-evidence/summary.md`.
- Phase 12R Product Maintenance Canonical Patch Proposal Evidence: `harness/changes/archive/20260618-phase-12r-product-maintenance-canonical-patch-proposal-evidence/summary.md`.
- Phase 12Q Product Maintenance Canonical Update Decision Gate: `harness/changes/archive/20260618-phase-12q-product-maintenance-canonical-update-decision-gate/summary.md`.
- Phase 12P Product Maintenance Canonical Update Proposal Evidence: `harness/changes/archive/20260618-phase-12p-product-maintenance-canonical-update-proposal-evidence/summary.md`.
- Phase 12O Product Maintenance Candidate Lifecycle Resolution: `harness/changes/archive/20260618-phase-12o-product-maintenance-candidate-lifecycle-resolution/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back into this handoff unless they change current agent decisions.
