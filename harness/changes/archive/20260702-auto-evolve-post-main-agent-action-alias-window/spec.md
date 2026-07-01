# Spec: auto-evolve-post-main-agent-action-alias-window

## Goal

Resolve `harness/evolution/pending.md` for the main-agent old-seam retirement
action-alias archive window using the existing Harness evolution process.

## Users

- Future AHO maintainers and agents that depend on compact, current Harness
  rules rather than duplicated phase history.
- Current development agents that need to know whether V5a-V5d revealed a new
  durable Harness rule or only reinforced existing rules.

## Acceptance Criteria

- AC-001: The five candidate archive summaries named in `pending.md` are
  reviewed against current ECL, boundary, and handoff rules.
- AC-002: The evolution proposal records a recommendation, independent review,
  validation plan, and Experience Retention Scan.
- AC-003: If no durable Harness rule/template/runtime gap is found, the
  evolution is marked complete as `docs_current_delta / subagent_review` and
  `harness/evolution/pending.md` is removed.
- AC-004: Current handoff docs are updated only where needed to repair
  pending-state drift, reflect the completed evolution, and preserve the next
  product follow-up.
- AC-005: Harness checks pass after mark-complete and archive closeout.

## Non-Goals

- Do not change product runtime behavior, Workbench UI, action registry
  semantics, confirmationQueue, Scheduler, IntegrationCheck, apply/close,
  remote, PR, merge, or automation allowlist.
- Do not delete live compatibility seams such as `role.pipeline.*`,
  `MainAgentLoopProjection`, or internal demand-worker `rolePipeline`.
- Do not promote implementation-specific helper names into permanent ECL law.

## Constraints

- Pending evolution must include proposal, independent review, validation
  result, results.tsv row, and `harness-evolve mark-complete`.
- Any no-op result must still perform an Experience Retention Scan.
- Current docs should stay compact; archive-specific detail should remain in
  archived summaries or the proposal.

## Risks

- Over-promoting V5-specific alias names into ECL would increase documentation
  entropy and make future cleanup harder.
- Under-recording the no-op-plus-doc-delta rationale would leave future agents
  uncertain about whether `role.pipeline.*` is still an unresolved process issue
  or whether pending evolution is already clear.
