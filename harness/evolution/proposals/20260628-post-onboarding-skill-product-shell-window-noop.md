# Harness Evolution Proposal: post-onboarding Skill product-shell window

## Decision

`noop`

## Window

Triggered by `harness/evolution/pending.md` after 5 archived changes since the
last completed evolution:

- `20260628-auto-evolve-post-product-shell-reference-window`
- `20260628-workbench-reference-style-sidebar-cleanup-and-skill-availability-v1`
- `20260628-workbench-reference-style-sidebar-and-skills-polish-v2`
- `20260628-workbench-system-aho-harness-onboarding-skill-v1`
- `20260628-workbench-first-onboarding-aho-harness-skill-package-v2`

## Evidence

- The sidebar and Skills archive pair reinforces existing Workbench
  user-surface honesty and reference-driven UI rules: only implemented controls
  should appear, user-facing labels should hide internal machinery, and
  reference-project behavior must be adapted without vendoring.
- The system onboarding Skill archive pair reinforces existing Runtime Bridge
  and Proposal/Runtime Boundary rules: Skills are runtime capabilities and
  prompt/context aids, not Harness workflow truth or authority.
- The previous auto-evolve archive in this window already found existing ECL
  coverage sufficient for the product-shell reference window.
- Current docs and templates already cover the repeated lessons through:
  Workbench user-surface honesty, reference-driven UI/product source evidence,
  runtime bridge boundary, proposal/runtime boundary, documentation entropy,
  experience lifecycle, minimality, and core-mechanism reuse.

## Independent Review

- Subagent Feynman: recommended `noop` or no-rule `docs_merge`; warned that the
  main risk is duplicating product closeout details in current docs.
- Subagent Sartre: found current docs already cover reference UI honesty, Skill
  runtime vs workflow truth, docs entropy, and pending evolution process.
- Subagent Lagrange: recommended `noop`; no durable Harness rule or template
  delta justified.
- Subagent Bohr: scored `No-op / retain existing ECL coverage` at `95/100`;
  rejected candidate durable rules at `70-75/100`.

## Experience Retention Scan

- Promote: none.
- Retain: existing Runtime Bridge Boundary, Proposal/Runtime Boundary,
  Workbench User-Surface Honesty, Reference-Driven UI/Product Evidence,
  Documentation Entropy, Experience Lifecycle, Minimality, and Core Mechanism
  Reuse rules.
- Merge: none.
- Retire: none.
- Archive-only: specific sidebar/Skills/onboarding implementation details,
  screenshots, E-drive acceptance paths, registry cleanup counts, and transient
  product debugging history.

## Rejected Durable Changes

| Candidate | Reason rejected |
| --- | --- |
| Add Skill/onboarding boundary rule | Already covered by Runtime Bridge and Proposal/Runtime Boundary sections; score 73. |
| Add sidebar/Skills reference UI honesty rule | Already covered by Workbench User-Surface Honesty and Reference-Driven UI evidence; score 75. |
| Add extra handoff-drift rule | Existing handoff and documentation entropy rules cover it; score 70. |

## Applied Delta

- No ECL rule delta.
- No review-template delta.
- No product/runtime delta.
- `results.tsv` will record `noop / subagent_review`.

## Verification Plan

- `scripts/lint-ecl.ps1`
- `scripts/lint-encoding.ps1`
- `scripts/harness-change.ps1 reindex`
- `scripts/harness-change.ps1 status`
- `scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review`
- `scripts/harness-evolve.ps1 check`
