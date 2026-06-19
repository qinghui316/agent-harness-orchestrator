# Spec: auto-evolve-harness-candidate-window-order

## Goal

Repair and complete the pending Harness evolution so auto-evolve candidate archives reflect recent close-order evidence instead of directory-name ordering.

## Users

- Future agents handling `harness/evolution/pending.md`.
- Maintainers relying on `scripts/harness-evolve.ps1 check` and `mark-complete` to create a truthful evolution window.

## Acceptance Criteria

- AC-001: `scripts/harness-evolve.ps1 check` selects candidate archive summaries from eligible archives ordered by a close-order proxy (`LastWriteTimeUtc`, then name), not by name-only ordering, and does not include auto-evolve archive summaries as candidate product evidence.
- AC-002: The regenerated pending evolution no longer repeats the already reviewed Workbench helper-reuse window or includes the prior auto-evolve archive when newer maintenance canonical patch helper-reuse archives are the latest close-order evidence.
- AC-003: The evolution proposal records before/after evidence: stale Workbench pending candidates, prior `results.tsv` row at archive count 302, current eligible archive count 307, and the corrected candidate window.
- AC-004: The proposal includes an Experience Retention Scan for the corrected candidate window and classifies the duplicate Workbench window as already reviewed/archive-only.
- AC-005: `mark-complete` appends a results row, updates `harness/evolution/state.json`, and clears `harness/evolution/pending.md`.
- AC-006: `AGENTS.md`, `docs/STATUS.md`, and active/archive ECL handoff state stay aligned before and after close.

## Non-Goals

- Product runtime, Workbench behavior, Scheduler behavior, Goal Loop behavior, ToolPolicyGate, human gate, source mutation, remote handoff, and README changes.
- Broad ECL rule, template, lint, or documentation expansion.
- Treating script repair alone as pending evolution completion without evaluating the corrected candidate window.

## Constraints

- Auto-evolve remains evidence-driven: proposal, independent review, validation, results row, and `mark-complete` are required.
- Current docs stay compact derived memory; detailed phase evidence stays in archived summaries and proposal files.
- The fix must preserve the existing archive threshold/count and state-file model unless a larger change is explicitly accepted later.

## Risks

- `LastWriteTimeUtc` is still a local close-order proxy, not a durable archived timestamp. This is acceptable as a narrow repair but should not be expanded into a broader state redesign in this change.
- Regenerating pending evidence can overwrite the stale pending snapshot; the before evidence must be recorded first in the active change or proposal.
