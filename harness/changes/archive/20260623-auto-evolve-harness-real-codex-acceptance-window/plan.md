# Plan: auto-evolve-harness-real-codex-acceptance-window

## Approach

Treat `harness/evolution/pending.md` as a maintenance prompt, not a mandate to
add rules. Compare the candidate archive evidence against existing ECL and
current-plan guidance. Promote only lessons that are repeated, product-shaping,
and likely to be missed by future agents without a compact current rule.

## Steps

1. Read the pending archives and current Harness rules.
2. Spawn an authorized read-only subagent for independent review.
3. Write a proposal that records the retention scan and recommended outcome.
4. Apply only the minimal ECL or template change justified by the proposal and
   independent review.
5. Run Harness/documentation validation.
6. Record the result with `scripts/harness-evolve.ps1 mark-complete`.
7. Close the active change and align handoff docs.

## Decisions

- Promote a narrow real self-acceptance isolation rule and template prompt:
  when the current
  project validates itself, formal apply/close evidence must use an isolated
  managed-project copy and external runtime home unless same-root source safety
  is explicitly the test target.
- Promote a narrow Workbench aggregate timeout signal rule and template prompt:
  if the aggregate
  Workbench/slow suite exceeds the tool window without assertion failure, split
  by package-script or capability-domain members and record both signals.
- Promote template prompts for real Codex no-fake evidence and in-flight
  duplicate scoped action suppression where applicable.
- Do not add a new evidence family, broad review section, or lint rule for this
  window; existing Source Apply Safety, Workbench Honesty, Documentation
  Entropy, Experience Lifecycle, and targeted verification rules already cover
  the rest.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime modules and archive
  summaries.
- Compatibility surface: ECL docs only; no CLI/API/runtime behavior changes.
- Boundary tests: not applicable.
- Follow-up split candidates: none.
- If not applicable, reason: this change modifies Harness process guidance and
  evolution records, not product modules.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Controlled Evolution,
  Experience Lifecycle, Real Acceptance Feedback, Source Apply Safety, and
  targeted verification scope.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing rules mention external source/state safety, but the same-root
  current-project acceptance failure showed that self-acceptance needs explicit
  isolation wording. Existing verification guidance mentions aggregate scope,
  but repeated Workbench tool-window timeouts need explicit split-suite
  evidence wording.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: `docs/ECL.md`.
- Local framework / state machine / projection / validation / gate avoided:
  no new workflow or evidence mechanism is introduced.
- Future-cost reduction for similar features: future agents can classify
  same-root self-acceptance and Workbench aggregate timeout evidence without
  rediscovering the archived failure chain.

## Planning-Discovered Gaps

None.
