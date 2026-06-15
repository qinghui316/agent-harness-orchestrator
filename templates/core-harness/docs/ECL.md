# ECL

## Purpose

This project uses ECL to record requirements, plans, tasks, reviews, and Harness evolution as repository artifacts.

## Small Change

Small changes are local, low-risk edits with no interface, data, permission, architecture, runtime, or validation-chain impact.

## Structured Change

Structured changes require one active change under `harness/changes/active/`.

Required files:

- `summary.md`
- `spec.md`
- `plan.md`
- `tasks.md`
- `reviews/review.md`

## Lifecycle

Use generated Harness scripts or Agent Harness Orchestrator commands to move changes through active, parking, and archive.

## Evolution

Pending evolution is a maintenance reminder, not an auto-apply instruction. Apply Harness improvements only with evidence, proposal, review, validation, and results logging.

## Documentation Entropy

`AGENTS.md` is a map, not a manual or archive ledger. `docs/STATUS.md` is a short handoff, not a full project chronology. Current-plan or roadmap docs must not keep stale `Current Baseline` or `Next Direction` text as current truth after a newer current-plan document supersedes it. Historical facts belong in archived summaries and `harness/changes/INDEX.json`.

Docs, handoff, Harness-rule, template, and auto-evolve changes should record whether current documents grew, whether duplicate current-state facts were introduced, whether roadmap/current-direction language is stale, and whether old experience was retained, merged, retired, or left archive-only.

## Experience Lifecycle

Auto-evolve proposals must check both new-rule gaps and stale-experience cleanup. Raw archive summaries and generated indexes are durable evidence; current docs and templates are compact derived memory that should keep only guidance that changes current agent behavior.

- `Promote`: make new evidence a rule, template field, lint, test, or command.
- `Retain`: keep old experience because it still changes current agent behavior.
- `Merge`: replace repeated specific lessons with one shorter rule.
- `Retire`: remove old experience now covered by code, tests, lint, templates, or newer rules.
- `Archive-only`: keep historical truth in archived summaries, not current docs.

A `noop` result is valid only after checking both missing new rules and stale or duplicate old experience.
