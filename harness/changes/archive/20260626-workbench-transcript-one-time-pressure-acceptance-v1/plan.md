# Plan: workbench-transcript-one-time-pressure-acceptance-v1

## Approach

Use existing transcript owners and add only small regression coverage. Run the
large synthetic pressure scenario once with in-memory data, record the numbers,
then delete any temporary artifacts. Do not make the large pressure path part
of normal verification.

## Steps

1. Add targeted regression coverage to the existing transcript paging tests.
2. Add pure frontend virtual-range and measurement tests that simulate large
   row counts without mounting a huge DOM.
3. Run a one-time synthetic pressure command for 1k / 10k / 50k cells and
   record build/page/payload metrics.
4. Decide whether V2 incremental projection is needed from measured backend
   cost.
5. Verify no large generated data is staged or left in the repository.

## Decisions

- Keep pressure data out of package scripts and CI.
- Keep timing measurements diagnostic rather than strict CI assertions.
- Treat V2 as follow-up only if backend full-build-before-slice cost is the
  measured bottleneck.

## Minimality Gate Plan

- Can this be a no-op: no; V1 needs measured evidence before deciding whether
  V2 is justified.
- Reuse: existing `buildParentAgentTranscript`,
  `pageParentAgentTranscript`, `calculateTranscriptVirtualRange`, and
  transcript measurement helpers.
- Shared root fix: checked backend projection, server route, and frontend
  virtual list owners; no product runtime fix is planned unless pressure shows
  a real bottleneck.
- Avoided: durable pressure fixtures, new renderer, new transcript store,
  package-script pressure gate, and V2 incremental builder before evidence.
- Smallest coherent change: small tests plus one-time acceptance measurement.

## Module Boundary Plan

- Owner module: existing transcript projection and Workbench frontend transcript
  owners.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: no transcript logic should be added to broad
  Workbench facades or `App.tsx`.
- Compatibility surface: full transcript projection remains available; paged
  projection semantics remain compatible.
- Boundary tests: targeted transcript projection, virtual range, and long-text
  measurement tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: canonical transcript projection,
  existing paging helper, virtual range calculation, long-message folding, and
  pretext/fallback measurement.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed in V1 acceptance.
- Domain-specific logic location: existing transcript tests only.
- Shared cross-cutting logic location: existing transcript helper modules.
- Local framework / state machine / projection / validation / gate avoided:
  central DB, second renderer, cursor-aware V2 builder, and pressure fixture
  framework.
- Future-cost reduction for similar features: pressure evidence prevents
  unnecessary V2 work and keeps long-conversation regression small.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

