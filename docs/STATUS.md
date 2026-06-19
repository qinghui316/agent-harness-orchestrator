# Project Status

## Current Handoff

- Current date: 2026-06-19.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260619-maintenance-canonical-update-patch-proposal-authority-profile-reuse/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260619-maintenance-canonical-update-patch-proposal-authority-profile-reuse/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-helper-latest-guard-reuse-window/summary.md`.
- Active product phase: none.
- Active Harness evolution phase: none.
- Active close status: none.

This file is the short resume point. There is no active ECL change and no pending Harness evolution. The latest archived product slice is Maintenance Canonical Update/Patch Proposal Authority Profile Reuse: canonical update proposal, canonical update decision, and canonical patch proposal non-executing authority profiles now live in the current AgentTask canonical authority-profile owner while preserving evidence-only proposal/decision behavior. The latest completed Harness evolution is Auto-evolve Harness Helper Latest Guard Reuse Window: `mark-complete` recorded `keep / independent_review`, retained existing Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicyGate, and human-gate rules, and made no new Harness rule/template/lint/product runtime change.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-maintenance canonical patch target-boundary, lineage, operation lineage helper reuse, target-kind helper reuse, target-descriptor render helper reuse, markdown list helper reuse, markdown evidence-list renderer reuse, simple markdown list helper reuse, application-authority helper reuse, application-authority profile reuse, proposal-authority profile reuse, ledger-idempotency, artifact-store reuse, artifact-reference reuse, ledger event-policy reuse, maintenance candidate source-policy reuse, closeout review identity helper reuse, maintenance artifact ledger-entry helper reuse, canonical updates ledger helper adoption, maintenance store-backed artifact ref-list helper reuse, maintenance store-backed artifact lookup helper reuse, Workbench action active-target revalidation reuse, Workbench action target revalidation helper reuse, Workbench SchedulerRun prepared-target helper reuse, Workbench scheduler planning latest-target helper reuse, workflow-scheduler latest artifact guard reuse, scheduler-runtime claim-reservation latest guard reuse, Workbench read-model projection summary helper reuse, Workbench maintenance confirmation projection summary helper reuse, and Workbench read-model timestamp summary helper reuse. The latest Harness evolution completed `mark-complete` with result `keep` after reviewing the helper/latest-guard reuse window; no product runtime or broad ECL/template change was made. Goal Loop controlled-loop state, routing posture, and SchedulerRun terminal handoff evidence remain non-executing evidence only. SchedulerRun terminal Workpad completion and blocked-closeout cards remain read-only evidence and do not authorize loop/full-executor/dispatch/slot/source/apply/close/merge/Harness-evolution behavior.

Product-level maintenance writes candidate lifecycle-resolution evidence, canonical update proposal evidence, human-gated canonical update decision records, canonical patch proposal evidence, human-gated canonical patch application follow-up records, read-only application manifest/readiness evidence, Phase 12U target-descriptor evidence, Phase 12V human-gated canonical docs/stable-memory application result evidence, and Phase 12W read-only observation report evidence while still forbidding automatic canonical rewrites.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

Resume from the Architecture Growth Control register in `docs/CURRENT-DEVELOPMENT-PLAN.md`, preferably another narrow convergence slice only if it reuses or strengthens an existing core mechanism. Keep `README.md` unrelated and untracked unless the user explicitly asks to include it.

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

- Latest Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-helper-latest-guard-reuse-window/summary.md`.
- Latest product change: `harness/changes/archive/20260619-maintenance-canonical-update-patch-proposal-authority-profile-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260619-maintenance-canonical-patch-application-authority-profile-reuse/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-helper-reuse-window/summary.md`.
- Maintenance Candidate Source Policy Reuse: `harness/changes/archive/20260619-maintenance-candidate-source-policy-reuse/summary.md`.
- Scheduler Runtime Claim Reservation Latest Guard Reuse: `harness/changes/archive/20260619-scheduler-runtime-claim-reservation-latest-guard-reuse/summary.md`.
- Workflow Scheduler Latest Artifact Guard Reuse: `harness/changes/archive/20260619-workflow-scheduler-latest-artifact-guard-reuse/summary.md`.
- Workbench Scheduler Planning Latest Target Helper Adoption: `harness/changes/archive/20260619-workbench-scheduler-planning-latest-target-helper-adoption/summary.md`.
- Workbench SchedulerRun Prepared Target Helper Reuse: `harness/changes/archive/20260619-workbench-schedulerrun-prepared-target-helper-reuse/summary.md`.
- Maintenance Simple Markdown List Helper Reuse: `harness/changes/archive/20260619-maintenance-simple-markdown-list-helper-reuse/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-maintenance-helper-reuse-window/summary.md`.
- Maintenance Markdown Evidence List Renderer Reuse: `harness/changes/archive/20260619-maintenance-markdown-evidence-list-renderer-reuse/summary.md`.
- Maintenance Markdown List Helper Reuse: `harness/changes/archive/20260619-maintenance-markdown-list-helper-reuse/summary.md`.
- Maintenance Canonical Patch Target Descriptor Render Helper Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-target-descriptor-render-helper-reuse/summary.md`.
- Maintenance Store-backed Artifact Lookup Helper Reuse: `harness/changes/archive/20260619-maintenance-store-backed-artifact-lookup-helper-reuse/summary.md`.
- Maintenance Canonical Patch Application Authority Helper Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-application-authority-helper-reuse/summary.md`.
- Maintenance Canonical Patch Target Kinds Helper Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-target-kinds-helper-reuse/summary.md`.
- Maintenance Canonical Patch Proposal Operation Id Helper Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-proposal-operation-id-helper-reuse/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-workbench-reuse-window/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-review-template-handoff-coverage-defaults/summary.md`.
- Maintenance Canonical Patch Operation Lineage Helper Reuse: `harness/changes/archive/20260619-maintenance-canonical-patch-operation-lineage-helper-reuse/summary.md`.
- Maintenance Store-backed Artifact Ref List Helper Reuse: `harness/changes/archive/20260619-maintenance-store-backed-artifact-ref-list-helper-reuse/summary.md`.
- Maintenance Canonical Updates Ledger Helper Adoption: `harness/changes/archive/20260619-maintenance-canonical-updates-ledger-helper-adoption/summary.md`.
- Maintenance Artifact Ledger Entry Helper Reuse: `harness/changes/archive/20260619-maintenance-artifact-ledger-entry-helper-reuse/summary.md`.
- Workbench Action Target Revalidation Helper Reuse: `harness/changes/archive/20260619-workbench-action-target-revalidation-helper-reuse/summary.md`.
- Workbench Read Model Timestamp Summary Helper Reuse: `harness/changes/archive/20260619-workbench-read-model-timestamp-summary-helper-reuse/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-source-convergence-architecture-growth-control/summary.md`.
- Workbench Maintenance Confirmation Projection Summary Reuse: `harness/changes/archive/20260619-workbench-maintenance-confirmation-projection-summary-reuse/summary.md`.
- Workbench Projection Summary Helper Reuse: `harness/changes/archive/20260619-workbench-projection-summary-helper-reuse/summary.md`.
- Workbench Action Active Target Revalidation Reuse: `harness/changes/archive/20260619-workbench-action-active-target-revalidation-reuse/summary.md`.
- Maintenance Canonical Ledger Event Policy Reuse: `harness/changes/archive/20260619-maintenance-canonical-ledger-event-policy-reuse/summary.md`.
- Maintenance Canonical Artifact Reference Reuse: `harness/changes/archive/20260619-maintenance-canonical-artifact-reference-reuse/summary.md`.
- Maintenance Canonical Artifact Store Canonical Updates Adoption: `harness/changes/archive/20260619-maintenance-canonical-artifact-store-canonical-updates-adoption/summary.md`.
- Maintenance Canonical Artifact Store Reuse: `harness/changes/archive/20260619-maintenance-canonical-artifact-store-reuse/summary.md`.
- Maintenance Canonical Ledger Idempotency Reuse: `harness/changes/archive/20260619-maintenance-canonical-ledger-idempotency-reuse/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-maintenance-canonical-chain-evidence/summary.md`.
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
