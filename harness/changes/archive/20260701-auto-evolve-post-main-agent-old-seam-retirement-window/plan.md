# Plan: auto-evolve-post-main-agent-old-seam-retirement-window

## Approach

Review the candidate archive window for general Harness lessons. Prefer `noop`
unless a missing durable rule, template, lint, or boundary document would have
prevented a repeated real failure mode.

## Steps

1. Read `pending.md` and the five candidate archive summaries.
2. Compare their lessons with `docs/ECL.md`, `docs/BOUNDARIES.md`, `AGENTS.md`,
   and `docs/STATUS.md`.
3. Ask a subagent for independent review.
4. If review agrees with no-op, run `harness-evolve mark-complete` with
   `Status noop` and `EvalMode subagent_review`.
5. Run Harness checks and update handoff docs.

## Decisions

- Initial selected result: `noop`.
- Do not add implementation-specific helper names to ECL.
- Keep old-seam deletion safety under existing minimality, boundary, and
  documentation entropy rules.

## Minimality Gate Plan

- Can this be a no-op: yes, pending independent review.
- Reuse: existing ECL structured change, Minimal Implementation Gate, module
  boundary, documentation entropy, and Harness evolution handling rules.
- Shared root fix: only add a rule if the archive window exposes a general
  repeated failure mode not already covered.
- Avoided: product runtime or template changes without evidence.
- Smallest coherent change: no-op completion record if review agrees.

## Module Boundary Plan

- Owner module: not applicable unless review finds a rule gap.
- New / moved responsibilities: none expected.
- Facade touch points: none expected.
- Forbidden write-back locations: product runtime and Workbench action surfaces.
- Compatibility surface: not applicable.
- Boundary tests: existing ECL/Harness checks.
- Follow-up split candidates: none.
- If not applicable, reason: evolution review only.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `harness-evolve` pending/complete
  lifecycle and current ECL review sections.
- Why existing mechanisms are insufficient if a new mechanism is proposed: not
  applicable for no-op.
- Domain-specific logic location: archive evidence only.
- Shared cross-cutting logic location: existing ECL/BOUNDARIES.
- Local framework / state machine / projection / validation / gate avoided: yes.
- Future-cost reduction for similar features: avoid adding narrow rules that
  later agents must maintain.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
