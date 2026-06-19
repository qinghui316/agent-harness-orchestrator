# Plan: maintenance-canonical-patch-target-descriptor-render-helper-reuse

## Approach

Add a small `formatCanonicalPatchTargetDescriptor` helper to the existing target-boundary owner. The helper will return the current markdown summary text used by the canonical patch proposal and application manifest renderers. Then replace only the two duplicate local helper functions with calls to the shared helper.

## Steps

1. Add `formatCanonicalPatchTargetDescriptor` in `src/agent-task/canonical-patch-target-boundary.ts`.
2. Import and reuse it in `src/agent-task/canonical-updates.ts`.
3. Import and reuse it in `src/agent-task/canonical-patch-application.ts`.
4. Add direct helper coverage in `tests/unit/agent-task-boundaries.test.ts`.
5. Run targeted and broad verification, then independent close-ready review.

## Decisions

- Helper name: `formatCanonicalPatchTargetDescriptor`, because the helper formats display text and must not be confused with parsing, validation, or authority.
- Preserve exact existing markdown output: `missing` for absent descriptors and `${patchKind} ${targetPath} sha256=${expectedContentHash}` for concrete descriptors.
- Do not move artifact rendering wholesale. This change only removes the repeated target descriptor summary formatter.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-target-boundary.ts`.
- New / moved responsibilities: display-only canonical patch target descriptor summary formatting moves from two feature-local render helpers into the target-boundary owner.
- Facade touch points: none; `src/agent-task/manager.ts` remains untouched.
- Forbidden write-back locations: Workbench, bridge/runtime adapters, frontend, scheduler modules, Goal Loop modules, manager facades, source apply paths, and reference-project source.
- Compatibility surface: generated patch proposal and application manifest markdown descriptor lines remain unchanged; artifact JSON/schema and public exports remain compatible.
- Boundary tests: direct helper test plus existing markdown assertions for proposal and manifest descriptors.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: canonical patch target-boundary owner.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new framework is proposed; this adds a missing display helper to an existing owner.
- Domain-specific logic location: canonical update and application modules keep their artifact-specific markdown renderers.
- Shared cross-cutting logic location: target descriptor summary formatting belongs in `src/agent-task/canonical-patch-target-boundary.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids repeated feature-local descriptor summary formatting and does not add any state machine, projection, validation gate, ledger policy, or protocol.
- Future-cost reduction for similar features: future canonical patch renderers can use one descriptor formatter and avoid drifting display text.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review passed. Tightening notes: helper is display-only, not parser / wire format / schema field / authority signal; `canonical-patch-target-boundary.ts` is the right owner; source-apply, runtime bridge, Workbench surface, projection, remote handoff, and Goal Loop coverage are not applicable unless implementation expands scope.
