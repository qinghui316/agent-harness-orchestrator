---
name: aho-harness-engineering
description: "Use only for AHO Runtime-assigned Harness engineering in one isolated workspace: onboard a project, audit Harness context, maintain one assigned closeout, or evolve one assigned archive window. Directly edits Markdown while Runtime owns assignment, diff capture, review, apply, and lifecycle authority."
---

# AHO Harness Engineering

Work only from the assignment and isolated workspace prepared by AHO Runtime. The assignment selects exactly one mode:

- `onboard`: create or reconcile initial project-specific Harness Markdown.
- `audit`: inspect current Harness context and repair assigned Markdown drift when justified.
- `maintain-assigned-closeout`: update durable memory from one assigned terminal Change.
- `evolve-assigned-window`: improve Harness guidance from one fixed archive window.

Never infer a mode from user prose, repository state, `pending.md`, or archive counts. If the mode, assignment identity, evidence references, workspace root, writable Markdown namespaces, or required verification are missing or inconsistent, stop and report the blocker.

## Workflow

1. Validate the Runtime assignment and confirm the current directory is the assigned isolated workspace.
2. Read only the supplied evidence and current Markdown needed for the selected mode.
3. Classify candidate knowledge as `promote`, `retain`, `merge`, `retire`, or `archive-only`.
4. Directly create, edit, delete, split, merge, or rename Markdown inside the writable namespaces.
5. Re-read the resulting files, check links and document roles, and run only the verification assigned by Runtime.
6. Return a concise summary of changed files, evidence used, verification, warnings, or why no change was needed.

Runtime captures the filesystem/Git diff from the workspace. The final response is evidence and summary only; it is never the diff source.

## Reference Routing

- Always read `references/runtime-contract.md`, `references/evidence-selection.md`, and `references/output-contract.md`.
- For `onboard` or `audit`, read `references/onboarding-context.md`; load project-state, memory-layout, or document-generation guidance only as needed.
- For `maintain-assigned-closeout`, read `references/incremental-closeout.md` and `references/document-roles.md`.
- For `evolve-assigned-window`, read `references/evolution-window.md`, `references/document-roles.md`, and `references/failure-and-recovery.md`.
- Read `references/worked-examples.md` before a non-trivial edit or when deciding between no-op, merge, split, rename, and delete.

## Editing Rules

- Prefer no change when bounded evidence does not justify durable current guidance.
- Keep `AGENTS.md` and status documents compact; preserve detailed chronology in Change archives.
- Preserve project-specific content unless evidence proves it stale, duplicated, or misplaced.
- Use filesystem operations for structural changes. Do not encode edits in the final response.
- Touch only Markdown in Runtime-provided writable namespaces. Never follow symlinks or escape the workspace.
- Treat generated indexes, product source, executable scripts, CI, configuration, secrets, and runtime state as read-only or out of scope.

## Authority Boundaries

The Agent cannot trigger work, create or claim assignments, choose or count archive windows, schedule workers, apply workspace changes to canonical memory, close Changes, advance watermarks, or mark maintenance/evolution complete. Do not invoke AHO lifecycle commands or start maintenance/reviewer agents.

Runtime owns workspace creation, namespace enforcement, task claim and fencing, retries, diff capture, review, verification policy, canonical apply/rollback, ledger updates, watermarks, and close/finalization. Report requests or blockers to Runtime instead of attempting those actions.

## Stop Conditions

Stop without editing when assignment lineage is inconsistent, required evidence is unavailable, the workspace is not isolated, a needed path is outside writable Markdown namespaces, facts conflict without a safe resolution, or the requested result would weaken source safety, validation, ownership, or human gates.
