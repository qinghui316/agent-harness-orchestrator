# Plan: auto-evolve-post-feedback-real-ui-window

## Approach

Treat this as a bounded Harness evolution closeout, not product development. Read the candidate window, classify experience, request independent subagent review, then apply only compact current-doc alignment if needed.

Main-agent recommendation after reading the window and subagent review: `noop` for durable Harness changes, with only ordinary lifecycle handoff alignment.

## Steps

1. Create the active Harness evolution change.
2. Review `pending.md`, ECL evolution rules, handoff docs, and the candidate archive summaries.
3. Write an evolution proposal under `harness/evolution/proposals/`.
4. Use an authorized subagent for read-only independent review and scoring.
5. Update active review with the subagent result and Experience Retention Scan.
6. Run `harness-evolve mark-complete` with `Status=docs_merge` and `EvalMode=subagent_review`.
7. Update handoff docs to no-active/no-pending after close, run Harness checks, close/archive, and settle git.

## Decisions

- Result type: `noop`, because no durable rule/template/lint/runtime/current-doc rule delta is justified. Active/pending/final handoff edits are ordinary lifecycle alignment.
- Product runtime changes: rejected; the only new product lesson in the window was already fixed in `decision-inspector` and covered by existing Workbench honesty/projection rules.
- Rule/template changes: rejected unless subagent finds a repeated uncaptured gap.

## Minimality Gate Plan

- Can this be a no-op: partially. No rule/runtime change is needed, but pending evolution must be completed and handoff state aligned.
- Reuse: existing `harness-evolve.ps1`, `harness-change.ps1`, `results.tsv`, current ECL review coverage, and handoff docs.
- Shared root fix: current ECL already covers controlled evolution, documentation entropy, experience lifecycle, Workbench user-surface honesty, projection freshness, source safety, scoped payloads, and human gates.
- Avoided: no new evidence family, review-template section, lint rule, product runtime, or evolution framework.
- Smallest coherent change: proposal + result row + state cleanup + compact handoff edits.

## Module Boundary Plan

- Owner module: not applicable; no product module changes.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench handlers, projections, and Harness templates unless evidence proves a gap.
- Compatibility surface: existing Harness scripts and docs remain compatible.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: this is a Harness evolution docs/state closeout.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled evolution, Experience Lifecycle, Documentation Entropy, and generated change/evolution scripts.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: archive summaries and proposal only.
- Shared cross-cutting logic location: unchanged ECL rules.
- Local framework / state machine / projection / validation / gate avoided: all avoided.
- Future-cost reduction for similar features: keeps evolution results compact and prevents one-off product bugs from becoming redundant rules.
- If not applicable, reason: product-code architecture growth is not touched.

## Planning-Discovered Gaps

None. The pending window appears covered by existing Harness rules and compact handoff alignment.
