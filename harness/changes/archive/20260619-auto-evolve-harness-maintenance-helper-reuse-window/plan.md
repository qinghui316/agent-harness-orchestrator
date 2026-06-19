# Plan: auto-evolve-harness-maintenance-helper-reuse-window

## Approach

Treat the pending window as an evidence-retention pass, not as a new product feature or rule expansion. The likely result is `keep`: existing Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicy, and human-gate rules already cover the observed helper-reuse pattern.

## Steps

1. Record active evolution handoff in `AGENTS.md` and `docs/STATUS.md`.
2. Write the evolution proposal under `harness/evolution/proposals/20260619-maintenance-helper-reuse-window-keep.md`.
3. Validate the proposal and handoff with ECL, encoding, reindex/status, and evolution checks.
4. Record independent subagent review result in `reviews/review.md`.
5. Run `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
6. Confirm `harness/evolution/pending.md` is removed.
7. Mark active evolution close-ready, close/archive it, then update final handoff to no active/no pending.

## Decisions

- Result: `keep`, unless validation or review finds a missing durable rule.
- No current rule/template/lint promotion: the candidate archives are examples of existing rules working.
- Stale active product handoff after the product close is treated as handoff drift to retire during final cleanup.
- Detailed helper-reuse implementation lessons remain archive-only plus summarized in the evolution proposal.

## Documentation Entropy Plan

- Check line counts for `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, and the active review/proposal documents.
- Scan `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/AGENT-DEVELOPMENT-OS.md` for stale current-state language.
- Do not copy candidate archive narratives into entry or handoff docs.

## Experience Retention Plan

- Promote: none expected.
- Retain: current Architecture Growth Control / Core Mechanism Reuse and Module Boundary rules.
- Merge: helper-reuse specifics under existing broad reuse/owner rules.
- Retire: stale active product handoff wording in `AGENTS.md` / `docs/STATUS.md`.
- Archive-only: implementation details of application-authority, store lookup, descriptor display, and markdown renderer helper slices.

## Planning-Discovered Gaps

- Subagent plan/evidence review passed with a `keep` recommendation. Tightening: explicitly scope Experience Retention across entry, handoff, ECL, templates if relevant, current-plan, and product-loop docs; record Documentation Entropy line counts and stale-current-state checks; run `mark-complete` only after proposal, review, and validation.
