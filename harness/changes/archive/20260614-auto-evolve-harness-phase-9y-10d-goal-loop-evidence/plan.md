# Plan: Auto Evolve Harness Phase 9Y 10D Goal Loop Evidence

## Approach

Use the existing controlled-evolution path. Read the pending archive window, ask two subagents for independent review, compare their recommendations with the current ECL Goal Loop Boundary, and then either apply a minimal Harness rule/template delta or record `noop/subagent_review`.

## Steps

1. Review `harness/evolution/pending.md`, the five candidate archive summaries, and relevant ECL Goal Loop / Controlled Evolution rules.
2. Capture two subagent reviews with explicit scope, recommendation, score, limitations, and whether a durable rule gap exists.
3. Write an evolution proposal under `harness/evolution/proposals/`.
4. If the review recommends `modify`, update only the necessary Harness docs/templates/lint; if it recommends `noop`, do not modify product code or Harness rules.
5. Run Harness verification.
6. Run `harness-evolve.ps1 mark-complete` with the final status and eval mode.
7. Repair handoff drift, close the ECL change, and commit without unrelated `README.md`.

## Decisions

- The current expected eval mode is `subagent_review` because the persistent goal explicitly authorizes subagent review for pending Harness evolution.
- The current expected product-code delta is none.
- The likely decision point is whether Goal Loop confirmation surface constraints need a permanent ECL/template coverage item.

## Module Boundary Plan

- Owner module: not applicable unless the evolution result is `modify` and touches templates/docs.
- New / moved responsibilities: not applicable for a noop evaluation.
- Facade touch points: none.
- Forbidden write-back locations: product runtime modules, Workbench action handlers, server routes, frontend shells, scheduler runtime, CLI modules.
- Compatibility surface: no product or public Harness command surface change unless a minimal Harness rule is accepted.
- Boundary tests: Harness lint and encoding lint; product tests only if product code or scripts/templates change.
- Follow-up split candidates: none.
- If not applicable, reason: this is Harness evolution evidence, not a product module implementation.

## Planning-Discovered Gaps

Pending subagent review will decide whether existing Goal Loop Boundary wording is sufficient or needs a narrow confirmation-surface addition.
