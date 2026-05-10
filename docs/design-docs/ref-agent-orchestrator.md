# Reference Map: Agent Orchestrator

Source repo: `https://github.com/ComposioHQ/agent-orchestrator`

Local submodule path: `reference-projects/agent-orchestrator/`

Inspected files: `README.md`, `CLAUDE.md`, repository layout.

## Summary

Agent Orchestrator is a local agent orchestration system with dashboard supervision, worktree isolation, runtime adapters, and flat-file state conventions.

## Borrow

- Worktree isolation for each run.
- Dashboard-oriented project and run status.
- Runtime adapter boundaries.
- Flat-file state as a low-install-friction default.
- Separate product orchestration from agent implementation.

## Do Not Copy

- Do not make GitHub issues or PRs the primary work unit.
- Do not auto-merge to the main branch.
- Do not default to large parallel agent fleets.
- Do not make dashboard-first architecture block the CLI core.

## Product Implications

Agent Harness Orchestrator should begin with CLI-managed flat files, but preserve run metadata shapes that can later power a local dashboard.

## Open Questions

- Which runtime adapter patterns should inform Codex `exec` in Phase 2?
- Which dashboard state files are worth mirroring in a future Web UI?
