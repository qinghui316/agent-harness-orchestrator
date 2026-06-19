# Project Status

## Current Handoff

- Current date: 2026-06-20.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260620-maintenance-canonical-artifact-lifecycle-reuse/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260620-maintenance-canonical-artifact-lifecycle-reuse/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260620-auto-evolve-harness-workbench-feedback-conversation-split-window/summary.md`.
- Active product phase: none.
- Active Harness evolution phase: none.
- Active close status: not applicable.

This file is the short resume point. There is no active ECL change and no pending Harness evolution. The latest product/docs change converged the maintenance canonical update / canonical patch chain around one shared artifact lifecycle helper for policy-ledger-backed maintenance artifact writes. The latest Harness evolution reviewed the five-change Workbench feedback/conversation split window and recorded `keep` with no new rule/template/lint/product runtime change.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-maintenance canonical patch target-boundary, lineage, operation lineage helper reuse, operation lineage builder reuse, operation Markdown detail renderer reuse, operation target/hash detail renderer reuse, application target-kind boundary reuse, target-kind helper reuse, target-descriptor render helper reuse, markdown list helper reuse, markdown evidence-list renderer reuse, simple markdown list helper reuse, markdown detail-item helper reuse, application-authority helper reuse, application-authority profile reuse, proposal-authority profile reuse, artifact-store write validation reuse, canonical ledger summary policy reuse, application artifact-ref helper reuse, ledger-idempotency, artifact-store reuse, artifact-reference reuse, store-descriptor reuse, ledger event-policy reuse, maintenance candidate source-policy reuse, closeout review identity helper reuse, maintenance artifact ledger-entry helper reuse, canonical updates ledger helper adoption, maintenance store-backed artifact ref-list helper reuse, maintenance store-backed artifact lookup helper reuse, maintenance canonical artifact lifecycle reuse, Workbench action active-target revalidation reuse, Workbench action target revalidation helper reuse, Workbench SchedulerRun prepared-target helper reuse, Workbench scheduler planning latest-target helper reuse, Workbench scheduler terminal latest-target helper reuse, workflow-scheduler latest artifact guard reuse, scheduler-runtime claim-reservation latest guard reuse, scheduler-runtime worker event-policy helper reuse, Workbench read-model projection summary helper reuse, Workbench maintenance confirmation projection summary helper reuse, Workbench read-model timestamp summary helper reuse, and Workbench test architecture scheduler/remote/Goal Loop prompt/DemandWorker/apply-integration/maintenance/read-model/task-runtime/Goal Loop surface/planning-scheduler-prep/scheduler-residual/AgentTask residual domain splits. The latest Harness evolution completed `mark-complete` with result `keep` after reviewing the Workbench test-architecture split window; no product runtime or broad ECL/template change was made. Goal Loop controlled-loop state, routing posture, and SchedulerRun terminal handoff evidence remain non-executing evidence only. SchedulerRun terminal Workpad completion and blocked-closeout cards remain read-only evidence and do not authorize loop/full-executor/dispatch/slot/source/apply/close/merge/Harness-evolution behavior.

Product-level maintenance writes candidate lifecycle-resolution evidence, canonical update proposal evidence, human-gated canonical update decision records, canonical patch proposal evidence, human-gated canonical patch application follow-up records, read-only application manifest/readiness evidence, Phase 12U target-descriptor evidence, Phase 12V human-gated canonical docs/stable-memory application result evidence, and Phase 12W read-only observation report evidence while still forbidding automatic canonical rewrites.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

Continue Architecture Growth Control from `docs/CURRENT-DEVELOPMENT-PLAN.md`; the next maintenance/canonical patch convergence step should reuse the shared artifact lifecycle helper rather than adding local write+ledger glue. Keep `README.md` unrelated and untracked unless the user explicitly asks to include it.

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

For test-only relocation, run the affected capability suite, adjacent risk suites, product checks, and the relevant aggregate contract first. Do not repeat the full Workbench aggregate unless shared runtime changed or close evidence has a clear gap.

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with archived `summary.md` files; open specs, plans, reviews, or source only when the current task needs that evidence.

Recent key archive summaries:

- Latest product change: `harness/changes/archive/20260620-maintenance-canonical-artifact-lifecycle-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-agenttask-residual-test-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-feedback-conversation-test-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-conversation-lifecycle-test-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-scheduler-residual-test-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-planning-scheduler-prep-test-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-goal-loop-surface-test-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-test-architecture-task-runtime-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-test-architecture-read-model-unit-domain-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-test-architecture-maintenance-slow-suite-split/summary.md`.
- Previous product change: `harness/changes/archive/20260620-workbench-test-architecture-apply-integration-slow-suite-split/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260620-auto-evolve-harness-workbench-test-architecture-split-window/summary.md`.
- Previous product change: `harness/changes/archive/20260619-scheduler-runtime-event-policy-helper-reuse/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-maintenance-canonical-patch-operation-reuse-window/summary.md`.
- Previous product change: `harness/changes/archive/20260619-workbench-scheduler-terminal-latest-target-helper-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260619-maintenance-canonical-patch-operation-target-detail-renderer-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260619-maintenance-canonical-patch-operation-markdown-detail-renderer-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260619-maintenance-canonical-patch-operation-lineage-builder-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260619-maintenance-canonical-patch-application-artifact-ref-reuse/summary.md`.
- Previous product change: `harness/changes/archive/20260619-maintenance-artifact-store-write-validation-reuse/summary.md`.
- Previous Harness evolution: `harness/changes/archive/20260619-auto-evolve-harness-helper-latest-guard-reuse-window/summary.md`.
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
