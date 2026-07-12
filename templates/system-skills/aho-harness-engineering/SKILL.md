---
name: aho-harness-engineering
description: "Use only for AHO Runtime-assigned Harness engineering: onboard or audit bounded context, maintain canonical project Markdown from one closeout, or propose and apply a scored evolution from one five-close window."
---

# AHO Harness Engineering

Work only from the bounded task packet prepared by AHO Runtime. The packet selects exactly one mode:

- `onboard`: create or reconcile initial project-specific Harness Markdown.
- `audit`: inspect current Harness context and repair assigned Markdown drift when justified.
- `maintain-assigned-closeout`: update durable memory from one assigned terminal Change.
- `evolve-assigned-window`: improve Harness guidance from one fixed archive window.

Never infer a mode from user prose, repository state, `pending.md`, or archive counts. If the mode, assignment identity, evidence references, canonical root, writable Markdown namespaces, or required verification are missing or inconsistent, stop and report the blocker.

## Workflow

1. Validate the Runtime assignment, canonical root, writable Markdown namespaces, and fixed evidence window.
2. Read only the supplied evidence and current Markdown needed for the selected mode.
3. Classify candidate knowledge as `promote`, `retain`, `merge`, `retire`, or `archive-only`.
4. For maintenance, directly create, edit, delete, split, merge, or rename canonical Markdown inside the writable namespaces.
5. For evolution, first return a read-only proposal, then native-spawn one independent scorer child. Edit canonical target docs only after it returns a score of at least 80 with no hard issue.
6. Re-read the resulting files, check links and document roles, and run only the verification assigned by Runtime.
7. Return a concise summary of changed files, evidence used, verification, warnings, or why no change was needed.

The filesystem is the edit source. Do not create a patch envelope, diff manifest, reviewer package, or project-memory apply transaction.

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
- Touch only Markdown in Runtime-provided canonical writable namespaces. Never follow symlinks or escape those namespaces.
- Treat generated indexes, product source, executable scripts, CI, configuration, secrets, and runtime state as read-only or out of scope.

## Authority Boundaries

The Agent cannot trigger work, create or claim assignments, choose or count archive windows, schedule workflow workers, close Changes, advance watermarks, or mark maintenance/evolution complete. Do not invoke AHO lifecycle commands or start reviewer agents. The assigned Evolution Agent owns requesting its one native scorer child.

Runtime owns namespace enforcement, task claim and fencing, heartbeat, retries, lease interruption, fixed windows, verification policy, ledger updates, watermarks, and close/finalization. Maintenance and accepted Evolution Agents own their bounded canonical Markdown edits; the Evolution Agent owns scorer delegation.

## Stop Conditions

Stop without editing when assignment lineage is inconsistent, required evidence is unavailable, a needed path is outside writable Markdown namespaces, Evolution has no score of at least 80, facts conflict without a safe resolution, or the requested result would weaken source safety, validation, ownership, or human gates.
