# Close

## Inputs

- Completed or blocked tasks, review, validation evidence, and current Change state.
- Current Change files and Registry record.

## Agent Judgment

Choose completed, blocked, or abandoned honestly. Completion depends on accepted evidence and
passing validation; Git state and Integration intent do not determine whether the Change qualifies.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime reruns scoped preflight and the close structural gate before Close.
- Runtime executes `change close` exactly once, archives the terminal Change, rebuilds generated
  indexes/catalog state, and runs `evolve check`.
- Agents may assess evidence completeness and recommend a terminal result; internal Workers do not
  execute Close or mutate shared lifecycle state.

## Actions

1. Update summary/review with outcome, validation, risks, and handoff.
2. Identify every pending task and return its resolution or blocker to Runtime.
3. Recommend completed, blocked, or abandoned from the evidence; Runtime performs the transition
   without requiring a Git commit and may record an existing commit boundary.
4. Runtime publishes the compact terminal Registry record and evolution eligibility.
5. Record known follow-up as a next action. Later work uses a new Change whose spec or summary
   references this archived Change; do not mutate terminal evidence.

## Outputs

- Terminal Change record, validation summary, handoff, optional Integration boundary, and pending
  status when the fifth qualified Change is reached.

## Exit

Status is completed, blocked, or abandoned. Only completed, validation-passed, evidence-complete
Changes are eligible for evolution.

## Stop And Escalate

Stop when shared Change evidence is incomplete, an explicitly supplied commit boundary is invalid,
or validation and claimed status disagree.

## Rules

Apply HR-01, HR-06, HR-07, HR-08, and HR-12 plus `references/rules/by-stage/close.md`.
