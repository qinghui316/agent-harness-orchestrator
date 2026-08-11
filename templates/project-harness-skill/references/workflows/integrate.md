# Integrate

## Inputs

- User-selected completed Changes, canonical baseline, exact commit boundaries, and contracts.
- Current Integration records, Registry conflicts, aggregate checks, and review requirements.

## Agent Judgment

Order selected commit ranges by dependency, resolve conflicts as a local PR reviewer, and decide
whether the combined candidate is ready for I2. Integration records knowledge/evolution signals but
does not rewrite stable L1/L2/L3 or global rules.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime executes Integration start/resume/complete, exact-range application, aggregate validation,
  candidate creation, landing, Registry publication, connector detachment, and worktree cleanup.
- Independent review returns the accepted review artifact bound to the exact candidate SHA.
- Runtime cannot complete landing before explicit I2 and resumes only from its durable
  `landing_phase`; Agents and Workers do not invoke Integration or worktree lifecycle commands.

## Actions

1. Inspect each Runtime-selected linear `base_commit..completion_commit` range.
2. Recommend dependency order and conflict resolutions; Runtime applies exact ranges and never
   merges a long-lived Lane tip.
3. Return compatibility edits and review findings through the assigned Integration task.
4. Interpret Runtime-recorded conflicts, human corrections, contract effects, documentation drift,
   and knowledge signals.
5. Present the Runtime-produced combined diff, validation, review, and risks for I2.
6. Treat connector detachment and worktree removal as Runtime-owned cleanup evidence.

## Outputs

- Integration candidate/record, combined diff, conflicts and Integrator edits, aggregate validation,
  independent review, canonical commit, baseline event, and evolution evidence.

## Exit

After I2, canonical contains the exact reviewed candidate, full contract/affected-path baseline event and
input Change states are durable, `landing_phase=cleanup_complete`, the writer is released, and the
temporary worktree is removed. Shared project knowledge waits for Evolution; affected old Lanes see
`refresh-needed` at preflight.

## Stop And Escalate

Stop for a selected Change without an exact commit boundary, nonlinear ranges, unresolved conflict, failed aggregate gate,
missing I2, an active shared writer owner, an unverifiable Harness link target, or an unknown
directory Junction in the worktree being removed.

## Rules

Apply HR-01, HR-04, HR-05, HR-06, HR-11, HR-15, HR-19, HR-22, and HR-25 plus
`references/rules/by-stage/integrate.md`.
