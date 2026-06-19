# Plan: Maintenance Canonical Authority Markdown Reuse

## Approach

Extend the existing authority owner with explicit markdown renderers for each existing canonical maintenance authority profile. Replace local `## Authority` arrays in canonical update/application/report markdown renderers with those helpers.

The helper should return only the authority section lines, including `## Authority`, blank lines, and bullet rows. It must not inspect paths, write artifacts, add ledger entries, gate actions, or call Workbench/runtime code.

## Steps

1. Add explicit authority markdown helper functions to `src/agent-task/canonical-patch-application-authority.ts`.
2. Update `src/agent-task/canonical-updates.ts` to use the helpers for canonical update proposal/decision, patch proposal, and application gate markdown.
3. Update `src/agent-task/canonical-patch-application.ts` to use the helpers for manifest and result markdown.
4. Update `src/agent-task/canonical-patch-application-report.ts` to use the helper for report markdown.
5. Update targeted tests for helper output and module boundaries.
6. Run targeted verification, close-ready review, close, and commit.

## Decisions

- Reuse existing `canonical-patch-application-authority.ts` rather than creating a new module, because authority flags already live there.
- Keep helper functions explicit per authority profile instead of accepting a broad configuration object. This avoids a generic rendering mini-framework.
- Do not read reference projects. The change is local AHO mechanism reuse and needs no external architecture evidence.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-application-authority.ts`.
- New / moved responsibilities: reusable rendering of existing canonical maintenance authority markdown sections.
- Facade touch points: none planned; public manager exports remain unchanged.
- Forbidden write-back locations: Workbench action/server/frontend code, scheduler, Goal Loop, runtime, artifact store/lifecycle, ledger, schema/type authority, and human-gate code.
- Compatibility surface: existing maintenance canonical exported functions, artifact shapes, markdown meaning, and Workbench maintenance flow remain compatible.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts`, `tests/unit/workbench-module-boundaries.test.ts`; slow maintenance flow if targeted evidence is insufficient.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing canonical authority profile builders, maintenance markdown list helpers, canonical artifact lifecycle/store/ledger helpers indirectly remain unchanged.
- Why existing mechanisms are insufficient if a new mechanism is proposed: authority flag values are centralized but authority markdown is still repeated in seven renderers; the new helpers compose existing authority ownership without changing behavior.
- Domain-specific logic location: canonical update, patch application, and report modules keep source/status/operation/risk/evidence markdown.
- Shared cross-cutting logic location: canonical authority owner.
- Local framework / state machine / projection / validation / gate avoided: no new framework, state machine, projection, validation gate, artifact family, or runtime protocol.
- Future-cost reduction for similar features: future canonical maintenance artifacts can reuse authority markdown helpers and avoid another local authority block.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review `019ee1fa-d86b-7721-9cc1-bb7c27b7e54b` returned PASS with non-blocking constraints: prefer the existing authority owner, keep helpers authority-markdown-only, and record Module Boundary / Core Mechanism Reuse / Proposal-Runtime / Documentation Entropy coverage.
