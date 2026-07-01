# Plan: main-agent-bridge-integration-acceptance-closeout-v1

## Approach

Use the existing bridge implementation as-is and add acceptance coverage around
its production entry points. Do not introduce a shared server guard helper in
this closeout; the route-specific visible-gate extraction is small, already
implemented, and easier to audit in place.

## Steps

1. Add workflow revalidation tests for no-id passthrough, partial-id failure,
   and unsupported explicit bridge assessment.
2. Add server approval action tests proving explicit ids invoke the bridge,
   non-ready assessments fail closed, partial ids fail closed, and no ids keep
   existing approval behavior.
3. Add core bridge negative coverage for unsupported scheduler/integration-like
   gates and stale/incomplete result-handoff evidence.
4. Update current handoff docs to mark bridge practical integration complete
   and make Recovery/resume the next main-agent migration slice.
5. Run targeted tests and standard Harness verification.

## Decisions

- Do not extract a new server-side guard helper in this change.
- Do not delete `MainAgentLoopProjection`, `rolePipeline`, or
  `role.pipeline.*`; they belong to later old-seam retirement.
- Treat this as acceptance/docs closeout, not a new architecture layer.

## Minimality Gate Plan

- Can this be a no-op: no; roadmap drift and missing acceptance coverage would
  leave later agents with an incorrect next step.
- Reuse: existing `assessMainAgentActionBridge`, action revalidation, and
  approval route bridge checks are reused.
- Shared root fix: route owners were checked; the missing work is tests and
  current-doc alignment, not a new runtime abstraction.
- Avoided: no new bridge owner, guard framework, UI, or action type.
- Smallest coherent change: tests plus handoff docs.

## Module Boundary Plan

- Owner module: existing `src/main-agent-orchestration/action-bridge.ts`.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: Workbench UI, confirmation queue, action
  registry, automation allowlist, scheduler/runtime/apply/close owners.
- Compatibility surface: existing request fields
  `mainAgentLoopRunId/mainAgentNextStepEvidenceId` remain optional.
- Boundary tests: prove old sequence wrappers remain absent and bridge does not
  expand supported gate families.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: bridge assessment, current action
  revalidation, approval route validation, and module-boundary tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: not
  applicable; no new mechanism is proposed.
- Domain-specific logic location: existing route-local visible-gate extraction.
- Shared cross-cutting logic location: existing bridge assessment owner.
- Local framework / state machine / projection / validation / gate avoided:
  server-side guard helper and UI projection.
- Future-cost reduction for similar features: accurate docs and tests prevent
  repeated bridge work and clear the path to Recovery/resume.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

