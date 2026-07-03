# Post Real A2A Conversation Delete Window

## Candidate Window

`harness/evolution/pending.md` lists five candidate archives:

- `20260702-auto-evolve-post-main-agent-llm-strategy-advice-window`
- `20260702-main-agent-goal-style-real-codex-ui-acceptance-fix-pass-v1`
- `20260702-main-agent-child-agent-workspace-flow-v2`
- `20260703-main-agent-real-a2a-flow-audit-repair-v1`
- `20260703-workbench-conversation-delete-harness-resume-entry-v1`

## Decision

Status: `docs_current_delta`

Independent review: subagent Socrates, no numeric score provided.

Socrates recommended `approve` and `docs_current_delta`. The archive window
does not justify a new `docs/ECL.md` rule, `docs/BOUNDARIES.md` boundary,
Harness template/script/lint/CI, or product runtime change. Existing ECL and
BOUNDARIES coverage plus the docs updated by the conversation-delete change
cover the relevant lessons.

## Coverage Rationale

Existing coverage is sufficient for:

- real Codex / A2A acceptance evidence through ECL real acceptance feedback and
  reference-driven UI coverage;
- child-agent workspace and transcript ownership through transcript renderer
  source-boundary, user-surface honesty, proposal/runtime, runtime bridge, and
  module-boundary coverage;
- LLM strategy advice and Goal-style autonomy through Goal Loop boundary,
  ToolPolicyGate / human-gate preservation, and controlled evolution rules;
- conversation deletion through Workbench/RUNTIME/BOUNDARIES docs that classify
  transcript/message deletion as interaction state only, while Change docs,
  workflow evidence, ResumePoint, current gates, and source state remain
  authoritative.

## Required Current Delta

Repair current handoff drift caused by closing
`workbench-conversation-delete-harness-resume-entry-v1` and triggering this
pending evolution window:

- after `mark-complete`, `AGENTS.md` and `docs/STATUS.md` must state that no
  active change and no pending Harness evolution remain;
- latest product archive remains
  `20260703-workbench-conversation-delete-harness-resume-entry-v1`;
- latest completed Harness evolution should point to the archived closeout for
  this evolution window;
- `docs/STATUS.md` `Next Resume Point` must not say pending evolution is none
  while the top handoff says pending exists.

## Experience Retention Scan

- Promote: none. The candidate lessons are already covered by existing ECL and
  BOUNDARIES rules.
- Retain: real acceptance evidence, transcript source-boundary, user-surface
  honesty, proposal/runtime boundary, Goal Loop boundary, runtime bridge
  boundary, and conversation-delete truth separation.
- Merge: current handoff state should merge latest product archive and latest
  evolution archive without duplicating archive details.
- Retire: contradictory pending-state wording in current handoff docs.
- Archive-only: exact UI run ids, screenshots, A2A implementation file lists,
  and per-change validation details.

## Non-Changes

No product runtime, Workbench UI, action registry, confirmationQueue,
automation allowlist, ToolPolicyGate, Scheduler, IntegrationCheck, apply/close,
remote, PR, merge, ordinary Agent mode, Harness rule, template, script, lint,
or CI change is required.
