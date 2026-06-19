# Spec: Auto Evolve Harness Workbench Feedback Conversation Split Window

## Goal

Resolve the pending Harness evolution window with an evidence-backed `keep` decision unless the candidate archive summaries reveal a durable current-rule gap.

## Users

- Future agents relying on current Harness and planning docs for Workbench test-architecture work.
- Reviewers checking that Harness evolution remembers useful lessons without growing current docs unnecessarily.

## Acceptance Criteria

- AC-001: Proposal evaluates the exact pending candidate window, including `20260620-workbench-feedback-conversation-test-domain-split`.
- AC-002: Independent review confirms whether `keep` is sufficient or identifies required Harness changes.
- AC-003: Experience Retention Scan records Promote, Retain, Merge, Retire, and Archive-only decisions.
- AC-004: `harness/evolution/results.tsv` and `harness/evolution/state.json` are updated through `mark-complete`, and `harness/evolution/pending.md` is removed.
- AC-005: Harness lint/encoding/status/evolve checks pass and handoff docs are aligned.

## Non-Goals

- Product runtime or test topology changes.
- New ECL, template, lint, or roadmap rule if existing current guidance already covers the repeated evidence.
- Manual edits to `harness/evolution/state.json` or hand-written index changes.

## Constraints

- Follow Controlled Evolution and Experience Lifecycle rules in `docs/ECL.md`.
- Keep current docs compact; do not copy archive narratives into `AGENTS.md` or `docs/STATUS.md`.
- Keep `README.md` unrelated and untracked.

## Risks

- Reusing the prior proposal candidate list instead of the current pending window would make the evolution evidence stale.
- Adding a duplicate ECL/test-strategy rule would worsen documentation entropy.
- Failing to mark evolution complete would leave future agents blocked on stale pending maintenance.
