# Plan: workbench-local-scheduler-terminal-path-real-ui-scout-v1

## Approach

Run the composed local scheduler terminal path through real Workbench UI first.
When the run exposes a blocker, fix only the existing owner that owns that
boundary and keep the evidence archive-local.

## Steps

1. Preflight the main repo and build the Workbench product.
2. Prepare `E:\aho-accept\local-scheduler-terminal-v1\src` and
   `E:\aho-accept\local-scheduler-terminal-v1\home`.
3. Use real Workbench UI for ordinary demand, Codex Plan Mode planning, human
   plan confirmation with `完全访问权限`, controlled scheduler workers, manual
   IntegrationCheck, manual integration apply, local landing, and terminal
   close/blocker.
4. If the UI reveals a product blocker, fix the smallest existing owner and add
   deterministic coverage.
5. Record the real UI evidence, run verification, close the change, and git
   settle.

## Decisions

- Keep Workbench SQLite as interaction/projection storage only. Workflow truth
  remains Change artifacts, run artifacts, validation/audit, worktrees,
  IntegrationCheck, landing, and close evidence.
- Do not add a central workflow DB or new loop runtime for this scout.
- Do not add raw `planning.scheduler.*` to the full-access allowlist.
- Treat `Review status is pending` after ready local landing as an explicit
  local close blocker, not a PR/remote blocker.

## Minimality Gate Plan

- Can this be a no-op: no; real UI found stale scheduler/audit projection
  overriding the local landing path.
- Reuse: Workbench confirmation queue, decision inspector, landing targets, and
  existing IntegrationCheck/landing/action handlers.
- Shared root fix: fixed projection priority in the confirmation queue and
  normalized integration patch attribution in the landing target owner.
- Avoided: central DB, new workflow engine, new permission system, new
  projection framework, raw scheduler allowlist, PR/remote/merge path.
- Smallest coherent change: promote selected local landing terminal gates above
  stale scheduler context, align decision inspector, and compute a
  source-comparable IntegrationCheck patch hash for landing attribution.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/confirmation-queue.ts`,
  `src/workbench/projections/read-model/decision-inspector.ts`, and
  `src/landing/targets.ts`.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: broad Workbench/server/frontend facades.
- Compatibility surface: unchanged; only projection priority and landing
  attribution internals changed.
- Boundary tests: `workbench-read-model.test.ts` and
  `landing-source-diff.test.ts`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled scheduler wrapper,
  IntegrationCheck, landing review, close gate, confirmation queue,
  current-gate revalidation, and source safety.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism was needed.
- Domain-specific logic location: landing attribution remains in
  `src/landing`; Workbench gate priority remains in read-model projection.
- Shared cross-cutting logic location: unchanged.
- Local framework / state machine / projection / validation / gate avoided: no
  new local framework.
- Future-cost reduction for similar features: integration apply now reliably
  routes to local landing/blocker instead of stale scheduler guidance.

## Planning-Discovered Gaps

- Real UI showed that integration apply succeeded, but stale scheduler outcome
  guidance and stale audit context could remain primary over local landing.
- Real UI also showed that landing attribution compared source diff hashes
  against raw IntegrationCheck patch hashes, causing equivalent applied patches
  to be misclassified as unattributed dirty source.
- After those fixes, the composed path reaches an explicit local close blocker:
  `Review status is pending`. This is a valid terminal blocker for this scout;
  PR/remote/merge remain out of scope.
