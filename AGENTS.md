# Agent Harness Orchestrator Route

Agent Harness Orchestrator (AHO) is a local-first Agent Development OS. Product truth and stable
architecture live in the canonical documents under `docs/`; current Change, Lane, Integration, and
Evolution state live in the project Harness.

<!-- ECL-HARNESS:BEGIN -->
# agent-harness-orchestrator Agent Route

<!-- ECL-HARNESS-PROJECT-ID: agent-harness-orchestrator-a6ad344cbe4e -->

This repository uses the local `agent-harness-orchestrator-a6ad344cbe4e-harness` Harness Skill. Load that Skill before structured
development, worktree coordination, Integration, or Harness evolution.

If this is a newly created worktree and the Skill is not discoverable yet, run:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-skill-link.ps1
```

Then reload the project Harness; single-Lane Small Changes use targeted verification, while Structured and multi-Lane repository work publish scope and run Registry preflight. Before removing this secondary worktree, detach its shared Skill links with:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-skill-link.ps1 -Detach
```

- Preserve unrelated changes and follow existing project verification.
- Current Change artifacts and history live in the shared project Harness.
- Shared Lane and contract facts come from the project Harness Registry.
- Business Integration requires explicit user I2 confirmation.

Do not copy the Harness manual into this file.
<!-- ECL-HARNESS:END -->

Canonical product documents:

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/BOUNDARIES.md`
- `docs/RUNTIME.md`
- `docs/WORKBENCH.md`
- `docs/AGENT-MODEL.md`
- `docs/CURRENT-DEVELOPMENT-PLAN.md`
- `docs/DEVELOPMENT.md`

Preserve unrelated user changes. Keep `README.md` untracked unless the user explicitly scopes it.
