# Plan: workbench-usable-manual-closed-loop

## Approach

Start from existing Workbench demand/result/apply/close paths and build one
bounded acceptance path around implemented behavior. Fix only gaps that prevent
the manual-gated loop from being visible, scoped, and safe. Treat documentation
drift as close/handoff work for this product change, not as a standalone docs
cleanup phase.

## Steps

1. Run active-change preflight and inspect existing Workbench demand/result/apply/close tests and action paths.
2. Identify the smallest existing Workbench loop that can represent demand -> result -> validation/audit -> apply -> close.
3. Add or repair bounded acceptance coverage for the chosen loop before product edits where practical.
4. Repair minimal Workbench projection/action/server/runtime gaps needed by that acceptance.
5. Update handoff/current-direction docs to make Workbench manual-gated usability the immediate product direction and move full-auto to later-roadmap status.
6. Record review coverage, source apply safety evidence, documentation entropy decisions, and verification.
7. Close/archive the change only after STATUS points at the final archive path and no active-path drift remains.

## Decisions

- Workbench main UI is the acceptance surface; CLI flows are supporting evidence only.
- Human gates remain required for source apply and close/archive.
- Controlled Scheduler may be reused only as an existing gate path and is not the product objective of this change.
- Full-auto task mode is explicitly deferred.
- Slow scheduler aggregate timeout is treated as existing test stability debt unless this change directly touches that suite.

## Module Boundary Plan

- Owner module: existing Workbench action/projection/server owners for any changed behavior.
- New / moved responsibilities: no new owner planned; if a gap requires product code, place action execution in the existing Workbench action handler owner, projection shaping in the read-model/projection owner, and source safety in the existing apply/source owner.
- Facade touch points: compatibility facades may receive thin exports or route wiring only.
- Forbidden write-back locations: do not place new main implementation logic in broad compatibility facades when a focused Workbench action, projection, server route, or runtime module exists.
- Compatibility surface: existing public action ids and payload shapes remain compatible unless a missing required target id must be added for safety.
- Boundary tests: targeted Workbench action/projection/server tests for any touched owner.
- Follow-up split candidates: none yet.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench action registry, target revalidation helpers, ToolPolicyGate/human confirmation, artifact refs, validation/audit artifacts, apply readiness/source safety, close/archive handoff.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is planned; any proposal must be justified in review.
- Domain-specific logic location: Workbench-specific UI/projection logic stays in Workbench-owned modules.
- Shared cross-cutting logic location: target validation, source safety, artifact references, and authority checks stay in existing shared owners.
- Local framework / state machine / projection / validation / gate avoided: no new local workflow state machine, evidence layer, or gate system.
- Future-cost reduction for similar features: proving the existing manual loop lowers the cost of later automation by identifying real path gaps before adding authorization.

## Planning-Discovered Gaps

- The current handoff docs still point the immediate next product direction to full-auto task mode even though the usable manual Workbench loop is not proven.
- The existing STATUS handoff contains repeated controlled Scheduler history that obscures the actual next product decision.
