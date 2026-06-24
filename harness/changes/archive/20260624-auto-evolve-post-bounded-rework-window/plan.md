# Plan: auto-evolve-post-bounded-rework-window

## Approach

Treat this as a short Harness evolution change. Evaluate the pending archive
window against existing ECL/review-template/lint/product boundaries, use the
authorized subagent for independent scoring, and apply only the smallest
evidence-backed delta. The expected path is `noop` for durable rules unless the
subagent identifies a repeated lesson not already covered.

## Steps

1. Read the pending file, candidate summaries, current ECL rules, current
   handoff docs, and current development plan.
2. Draft `harness/evolution/proposals/20260624-post-bounded-rework-window-noop.md`
   with candidate evidence, recommendation, Experience Retention Scan, score,
   and validation plan.
3. Record the subagent's independent read-only review in the proposal and
   active review file.
4. If the review recommends no durable change, keep the outcome as `noop`; if
   it finds a real gap, implement only the minimal Harness/template/lint/docs
   delta and validate it.
5. Run Harness verification, then run `harness-evolve mark-complete` with
   `status=noop` and `eval_mode=subagent_review` unless the validated result
   changes.
6. Update handoff docs for final no-active/no-pending state, close the change,
   verify, and git-settle all related files while excluding unrelated
   `README.md`.

## Decisions

- Decision default: no product runtime changes.
- Decision default: no ECL/template/lint changes unless the independent review
  identifies an uncovered repeated constraint.
- Decision default: result status `noop`, eval mode `subagent_review`, because
  existing boundaries already cover scoped automation authority, current-gate
  revalidation, source safety, documentation entropy, and human-gated terminal
  actions.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: product source/runtime, Workbench action
  handlers, automation runtime, and generated `harness/changes/INDEX.json`.
- Compatibility surface: Harness evolution records and handoff docs only.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: this change evaluates Harness process evidence and
  should not introduce product module behavior.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `harness-evolve`, Experience
  Lifecycle scan, Documentation Entropy, Close/Handoff Drift, and subagent
  review evidence.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed by default.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing ECL/Harness evolution workflow.
- Local framework / state machine / projection / validation / gate avoided: no
  new process framework or product gate.
- Future-cost reduction for similar features: prevents scoped automation
  acceptance details from becoming permanent process sprawl.
- If not applicable, reason: not a product feature change.

## Planning-Discovered Gaps

None.
