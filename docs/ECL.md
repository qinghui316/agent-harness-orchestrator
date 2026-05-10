# Evolution Constraint Language

## 1. Purpose

ECL is this repository's change lifecycle. It makes requirements, plans, implementation tasks, validation, review, and Harness evolution visible as repository artifacts.

## 2. Context Loading

Agents load context in this order:

1. `AGENTS.md`
2. `docs/ECL.md`
3. Active change files under `harness/changes/active/`, if present
4. `harness/evolution/pending.md`, if no active change exists and pending evolution exists
5. `docs/STATUS.md`
6. Task-specific docs

## 3. Small Change

Small changes are local, low-risk edits with no interface, data, permission, architecture, runtime, or validation-chain impact.

Examples:

- Typos.
- Comments.
- Narrow documentation wording.
- Single-file low-risk fixes.

Small changes may skip active change creation, but the final response or existing task notes must include verification.

## 4. Structured Change

Structured changes include:

- Cross-file behavior.
- APIs or schemas.
- Architecture.
- Harness rules or scripts.
- Reference source updates.
- Work likely to exceed 20 minutes.
- Unclear requirements.

Structured changes must use a single active change directory.

## 5. Active Change Files

Each structured change contains:

| File | Purpose |
| --- | --- |
| `summary.md` | Short purpose, scope, and handoff |
| `spec.md` | WHAT and WHY |
| `plan.md` | HOW and planning-discovered gaps |
| `tasks.md` | Executable checklist |
| `reviews/review.md` | Independent review and findings |

High-impact unknowns are recorded as `[NEEDS CLARIFICATION: ...]` and block implementation.

## 6. Plan-First Inputs

When a user gives a plan, split it into:

- `spec.md` for goals, users, acceptance, non-goals, constraints, assumptions, and risks.
- `plan.md` for implementation strategy and validation.
- `tasks.md` only after the spec and plan are coherent enough to execute.

Do not repeat a full interview when the plan is complete and does not conflict with repository evidence.

## 7. Change Lifecycle

```text
new -> active -> park | close
parking -> resume -> active
active -> close -> archive
```

Only one active change is allowed.

Use `scripts/harness-change.ps1` for lifecycle operations. Do not hand-edit `harness/changes/INDEX.json`.

## 8. STATUS Handoff

`docs/STATUS.md` is the lightweight handoff after active work is closed. Before closing a change, update STATUS with completed work, verification, residual risks, and next recommended resume point.

After close, STATUS should point to the archived `summary.md`.

## 9. Controlled Evolution

Harness evolution starts from archived evidence:

- Repeated failures.
- User corrections.
- Validation gaps.
- Rules that can be mechanically checked.
- Agent misunderstandings.

When `harness/evolution/pending.md` exists, it is a maintenance reminder, not a hard lock. Acting on pending evolution requires proposal, independent review, validation, `results.tsv`, and `mark-complete`.

If no independent scorer is available, the only allowed result is `noop` with dry-run evaluation.

## 10. Reference Project Updates

Reference projects are submodules under `reference-projects/`. Updating them is a structured change because it changes the source context available to future agents.

Each update must record:

- Repo and commit before/after.
- Reason.
- Product implications.
- Verification.
