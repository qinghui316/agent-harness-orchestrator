# Plan: main-agent-old-seam-retirement-v3-action-alias-compatibility-bridge

## Approach

Reuse the V2 `src/workflow-actions/main-agent-execution.ts` owner and extend it
from a legacy-only classifier into a canonical/legacy alias normalizer. Then
register canonical ids beside legacy ids and replace scattered label/summary
checks with the shared helper. The Workbench handler map will register both id
families to the same private handler functions so execution behavior cannot
split.

## Steps

1. Fill structured change files and correction evidence.
2. Extend `main-agent-execution.ts` with canonical ids, legacy ids,
   normalization, legacy conversion, and stop detection.
3. Add canonical ids to workflow action and live action registries while
   leaving legacy ids present.
4. Refactor Workbench handler registration to map canonical and legacy ids to
   the same private handler functions.
5. Normalize backend labels, action result summaries, frontend labels, and
   thread stream labels through the helper.
6. Update unit and boundary tests for alias compatibility and no-permission
   expansion.
7. Update current docs and V2 archived review correction note.
8. Run targeted and aggregate verification, then close/archive.

## Decisions

- Canonical action ids are public registry ids in V3, but legacy ids remain
  routable.
- UI default payload switching is optional and not required for V3; this change
  proves compatibility first.
- `rolePipeline` and `MainAgentLoopProjection` are live seams and must not be
  removed here.

## Minimality Gate Plan

- Can this be a no-op: no; canonical public ids cannot work until registry,
  routing, and labels recognize them.
- Reuse: extend the existing V2 `main-agent-execution.ts` helper instead of
  adding a new action-family framework.
- Shared root fix: centralize aliases in the helper, then update registry,
  handler, labels, summaries, and tests to use it.
- Avoided: no new action handler owner, no UI feature, no new gate, no
  automation path.
- Smallest coherent change: alias metadata plus registration and helper-based
  surface normalization.

## Module Boundary Plan

- Owner module: `src/workflow-actions/main-agent-execution.ts`.
- New / moved responsibilities: canonical/legacy main-agent execution alias
  normalization.
- Facade touch points: workflow registry, Workbench handler map, backend action
  result labels, frontend action labels, thread stream labels.
- Forbidden write-back locations: confirmation queue, action revalidation
  semantics, automation allowlist, Goal Loop recommendation paths, Scheduler,
  IntegrationCheck, apply/close, remote/merge/PR, Harness evolution.
- Compatibility surface: `role.pipeline.*` remains public and routable.
- Boundary tests: registry/live set membership, allowlist exclusion, handler
  sharing, stop bypass, old sequence names absent.
- Follow-up split candidates: V4 may switch new UI payloads to canonical ids;
  V5 may retire legacy ids/seams after compatibility evidence.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: workflow action registry,
  Workbench handler map, action result labels, thread stream projection, V2
  main-agent execution helper.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: main-agent execution alias knowledge stays in
  the workflow action helper.
- Shared cross-cutting logic location: all callers normalize through the helper
  rather than direct string prefixes.
- Local framework / state machine / projection / validation / gate avoided:
  this adds no new state machine, projection, validation gate, or UI control.
- Future-cost reduction for similar features: V4/V5 can change payload defaults
  or retire legacy ids by editing one alias owner.

## Planning-Discovered Gaps

None.
