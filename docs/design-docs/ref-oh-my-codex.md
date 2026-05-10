# Reference Map: oh-my-codex

Source repo: `https://github.com/sigridjineth/oh-my-codex`

Local submodule path: `reference-projects/oh-my-codex/`

Inspected files: `README.md`, repository layout.

## Summary

oh-my-codex organizes Codex-oriented workflows through agents, commands, skills, hooks, and session conventions.

## Borrow

- Codex-first workflow organization.
- Explicit roles for agents and commands.
- Hook and session ideas for later interactive runtime support.
- Plan-first and verification-oriented agent handoff.

## Do Not Copy

- Do not make a global Codex plugin automatically affect all projects.
- Do not require hook-heavy setup for MVP.
- Do not replace repo-local Harness artifacts with global configuration.

## Product Implications

Agent Harness Orchestrator should stay an independent local workbench first, then consider Codex plugin integration after CLI and run state are stable.

## Open Questions

- Which hook points are needed for Codex terminal sessions?
- How much of session resume belongs in AHO versus Codex itself?
