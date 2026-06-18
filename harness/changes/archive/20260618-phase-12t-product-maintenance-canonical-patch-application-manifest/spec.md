# Spec: Phase 12T Product Maintenance Canonical Patch Application Manifest

## Goal

Add a deterministic, non-executing maintenance artifact that evaluates whether an accepted canonical patch proposal can be safely applied later. The artifact must bind a Phase 12S patch application gate to its Phase 12R patch proposal, report concrete target-descriptor readiness, and fail closed when current patch operations do not contain enough information for a writer.

This phase advances the product maintenance rewrite path without introducing source/canonical-document mutation. It creates the missing contract between "human accepted follow-up gate" and any future deterministic patch writer.

## Users

- Main Agent / maintenance reviewer deciding whether canonical maintenance can proceed.
- Future deterministic patch application code that needs target paths, expected hashes, and patch payloads before writing.
- Workbench maintenance readers that need to see readiness status without treating it as an approval action.

## Acceptance Criteria

- AC-001: A typed `MaintenanceCanonicalPatchApplicationManifest` can be generated from an existing patch application gate record and matching patch proposal.
- AC-002: Manifest generation validates lineage: gate record exists, patch proposal exists, `patchProposalId`, `proposalId`, and `decisionId` match, and operation counts match. Missing, stale, or forged lineage fails closed.
- AC-003: The manifest records per-operation target-descriptor readiness and top-level `applicationStatus` as `blocked-needs-concrete-targets` until operations include deterministic target descriptors.
- AC-004: Manifest authority flags remain false/non-executing: no source mutation, no canonical patch application, no execution start, no apply/close/remote/harness-evolution side effect.
- AC-005: Manifest JSON/Markdown artifacts, artifact refs, list/read helpers, and maintenance ledger entry are idempotent and owned outside the existing canonical update/proposal module.
- AC-006: Maintenance candidate generation filters manifest ledger entries so product maintenance evidence does not recursively create new canonical update candidates.
- AC-007: Workbench maintenance projection exposes read-only manifest count/latest readiness status without adding a confirmation queue action or live/server mutation action.
- AC-008: Tests cover lineage failure, blocked readiness, idempotency, no mutation flags, ledger filtering, read-model projection, and module boundary/facade behavior.

## Non-Goals

- No deterministic writer or file mutation.
- No canonical document, stable memory, source root, Harness template, ECL, apply/close, remote landing, or Harness evolution mutation.
- No Workbench approval/action button for applying the manifest.
- No automatic rewrite, stale revalidation bypass, ToolPolicyGate bypass, or human-gate bypass.
- No broad documentation cleanup beyond current active/handoff state needed for this phase.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Existing Phase 12R patch proposals do not yet include concrete target paths, expected hashes, replacement text, or hunks; current manifests must therefore be blocked rather than inferred.
- New behavior must be modular: typed contracts in `src/types`, validation in schemas, application-manifest artifact ownership in a new agent-task module, Workbench only as read-only projection.
- Reference projects are design evidence only; no runtime copying.

## Risks

- If target descriptors are inferred from summaries, a future writer could mutate the wrong canonical surface.
- If manifest evidence enters candidate generation, maintenance evidence could recursively inflate maintenance work.
- If Workbench adds an action too early, users may assume the application gate performs a write when this phase is intentionally non-executing.
