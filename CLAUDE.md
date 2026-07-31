<!-- ECL-HARNESS:BEGIN -->
# agent-harness-orchestrator Claude Route

<!-- ECL-HARNESS-PROJECT-ID: agent-harness-orchestrator-a6ad344cbe4e -->

Use the local `agent-harness-orchestrator-a6ad344cbe4e-harness` Skill for structured project work, Change handling, worktree
coordination, Integration, and Harness evolution. Keep detailed rules in the shared Skill rather
than duplicating them here.

If this is a newly created worktree and the Skill is not discoverable yet, run:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-skill-link.ps1
```

Then reload the project Harness; single-Lane Small Changes use targeted verification, while Structured and multi-Lane repository work publish scope and run Registry preflight. Before removing this secondary worktree, detach its shared Skill links with:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-skill-link.ps1 -Detach
```
<!-- ECL-HARNESS:END -->
