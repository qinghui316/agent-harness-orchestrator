---
name: aho-harness-engineering
description: "Use only for AHO-assigned Harness engineering work with a typed runtime mode: project onboarding/context audit, incremental closeout memory maintenance, or a fixed evolution window. Produces context or declarative patch packages from bounded evidence; never triggers, claims, schedules, applies, closes, or marks maintenance/evolution complete."
---

# AHO Harness Engineering

Work only from the Runtime assignment envelope. The envelope selects exactly one mode:

- `onboard`: classify and prepare project context for first use.
- `audit`: refresh or inspect Harness context without source mutation.
- `maintain-assigned-closeout`: maintain memory for the assigned terminal Change.
- `evolve-assigned-window`: evaluate only the assigned fixed archive window.

If `mode`, assignment identity, evidence refs, or allowed targets are missing, stop with a blocker. Never infer a mode from `pending.md`, archive counts, user prose, or repository state.

## Workflow

1. Validate the assignment envelope and read only referenced canonical evidence.
2. Load the mode reference below. Do not load every reference by default.
3. Separate current facts, durable experience, archive-only history, assumptions, and conflicts.
4. Produce the exact output contract for the assigned mode.
5. Return the package to Runtime. Do not write canonical files or execute lifecycle actions.

## Reference Routing

- `onboard` or `audit`: read `references/onboarding-context.md`, plus project-state, memory-layout, or document-generation references only as needed.
- `maintain-assigned-closeout`: read `references/incremental-closeout.md`, `references/document-roles.md`, and `references/output-contract.md`.
- `evolve-assigned-window`: read `references/evolution-window.md`, `references/document-roles.md`, `references/output-contract.md`, and `references/failure-and-recovery.md`.
- For every result, read `references/runtime-contract.md`, `references/evidence-selection.md`, and `references/output-contract.md`.
- For concrete shapes, read `references/worked-examples.md`.

## Decision Method

Classify every candidate:

- `promote`: durable evidence should change current memory or guidance.
- `retain`: current guidance is still necessary and correct.
- `merge`: combine overlapping current guidance into one narrower statement.
- `retire`: remove current guidance that is stale or contradicted.
- `archive-only`: preserve history without promoting it into current memory.

Prefer no patch when evidence does not justify a durable current-state change. A single incident is not a permanent rule unless it exposes a general boundary or reproducible failure.

## Hard Boundaries

- Do not detect thresholds, create or claim tasks, choose archive windows, or inspect `pending.md` to start work.
- Do not invoke AHO CLI lifecycle commands or spawn your own maintenance/reviewer agents.
- Do not edit files, apply patches, close Changes, mark evolution complete, or change watermarks.
- Do not target product/runtime source, permission policy, automation policy, executable scripts, CI, or arbitrary paths.
- Do not weaken ToolPolicy, source safety, validation/audit, ownership, gates, or target taxonomy.
- Do not copy raw transcripts, stdout/stderr, secrets, temporary paths, superseded proposals, or archive narration into stable memory.

Runtime owns assignment, target allowlist, hashes, idempotency, review, verification, atomic application, rollback, ledger, and status. This Skill owns only semantic analysis and declarative content.

## Stop Conditions

Return `blocked` with explicit conflicts when evidence is missing, hashes or assignment identity are inconsistent, an allowed target is insufficient, facts conflict without a safe resolution, or the requested change would alter a forbidden control-plane boundary.
