# Plan: auto-evolve-post-main-agent-action-alias-window

## Approach

Review the pending archive window as Harness evolution evidence, not product
runtime work. The smallest coherent result is a docs-current delta: V5a-V5d
lessons are already covered by broad ECL rules for projection coverage, module
boundaries, core mechanism reuse, compatibility facades, documentation entropy,
controlled evolution, and non-expansion of workflow authority, but the current
plan contains a pending-state contradiction that should be repaired before
mark-complete.

## Steps

1. Read `pending.md`, candidate archive summaries, `docs/ECL.md`,
   `docs/BOUNDARIES.md`, `AGENTS.md`, and handoff docs.
2. Request independent subagent review and score.
3. Write a Harness evolution proposal under `harness/evolution/proposals/`.
4. Update active change artifacts with acceptance criteria, tasks, review
   evidence, Experience Retention Scan, and verification plan.
5. If review confirms no gap, run `harness-evolve mark-complete` with
   `noop / subagent_review`.
6. Update handoff docs minimally after pending is removed.
7. Run Harness checks and close the active change.

## Decisions

- Select `docs_current_delta` because the independent review identified a
  concrete current-doc pending-state drift, while confirming no rule, template,
  lint, or runtime gap.
- Keep exact V5a-V5d helper/action names archive-specific. The durable rule is
  to preserve canonical public surfaces, isolate legacy inbound compatibility,
  and avoid permission expansion.

## Minimality Gate Plan

- Can this be a no-op: partly. Existing rules cover the archive window, but
  current-doc drift means a pure no-op would be incomplete.
- Reuse: existing ECL controlled evolution, documentation entropy, module
  boundary, and projection authority rules.
- Shared root fix: no runtime/root fix is proposed; the pending window is
  process evidence.
- Avoided: no new template, lint, action family, projection, or product code.
- Smallest coherent change: proposal + docs-current drift repair + results row
  + mark-complete + compact handoff sync.

## Module Boundary Plan

- Owner module: Harness evolution process; no product module owner changes.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench UI, action
  registry semantics, Scheduler, IntegrationCheck, apply/close, automation.
- Compatibility surface: legacy action alias compatibility remains product
  archive context, not a new Harness API.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: this is Harness evolution closeout, not product
  module implementation.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `harness-evolve` pending/mark
  complete, ECL review coverage, documentation entropy, Experience Lifecycle.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: archive summaries and proposal only.
- Shared cross-cutting logic location: existing `docs/ECL.md` and
  `docs/BOUNDARIES.md`.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: no-op prevents phase-specific
  rule accumulation while preserving clear evidence.
- If not applicable, reason: not applicable to product code; applicable as
  evidence for no new mechanism.

## Planning-Discovered Gaps

None.
