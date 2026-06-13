# Plan: Phase 10B Loop Engineering Codex Goal Reference Alignment

## Approach

Use a docs-only structured change. First record the ECL intent and handoff state, then add reference maps for Loop Engineering and Codex goal source, then update core AHO docs so future scheduler/main-agent work is guided by a persistent Goal/Change loop with conflict-aware parallelism and existing Harness gates.

## Steps

1. Record implementation scope in `summary.md`, `spec.md`, `plan.md`, `tasks.md`, and `reviews/review.md`.
2. Update `AGENTS.md` and `docs/STATUS.md` to name Phase 10B as active.
3. Add `docs/design-docs/ref-loop-engineering.md`.
4. Extend `docs/design-docs/ref-openai-codex.md` with `goal` source mapping.
5. Update `docs/references/index.md` with Loop Engineering and Codex goal mapping.
6. Update `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/WORKBENCH.md`, and `docs/BOUNDARIES.md` with Goal-driven Adaptive Loop boundaries.
7. Add a lightweight `Goal Loop Boundary` rule to `docs/ECL.md`.
8. Run drift, reference, boundary, Harness, and product verification.

## Decisions

- Keep the loop as architecture guidance only; no product code changes.
- Use Addy Osmani's original Loop Engineering article as primary web evidence rather than an unstable repost.
- Use local Codex source as primary Codex goal evidence.
- Preserve AHO workflow truth in Change/ECL and artifacts; Codex `goal` informs long-running objective behavior only.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: no product implementation is changed; docs reiterate future owner-module requirements.
- Compatibility surface: no public runtime/API surface changes.
- Boundary tests: documentation/reference grep checks plus Harness lint.
- Follow-up split candidates: none.
- If not applicable, reason: docs/reference alignment only; no product module ownership changes.

## Planning-Discovered Gaps

None.
