# AGENTS.md Practice Article Notes

Source: `https://mp.weixin.qq.com/s/fBBBSfQajYjYtngZAitZCA`

Title: `一个文件让 AI Coding 效率翻倍：AGENTS.md 实践指南`

Accessed: 2026-05-10

## Summary

The article frames `AGENTS.md` as a map for AI agents, not a manual. It recommends progressive disclosure, stable local startup commands, verification loops, reference projects as source truth, and bad-case-driven rule evolution.

## Borrow

- Keep `AGENTS.md` concise and navigational.
- Put detailed rules in `docs/` and link them from the map.
- Use reference source code when documentation would go stale.
- Pair reference source with architecture maps.
- Encapsulate complex environment actions behind simple commands.
- Treat "code changed" as incomplete until build, startup, and validation pass.
- Promote repeated AI mistakes into docs, scripts, or lint rules.

## Do Not Copy

- Do not make every project a monorepo just for context.
- Do not overload `AGENTS.md` with full manuals.
- Do not add reference source without maps and clear priority rules.

## Product Implications

Agent Harness Orchestrator should manage both maps and source references. It should make reference projects discoverable while keeping the project-specific Harness as the primary entry point.

For this repository, reference projects are submodules under `reference-projects/`, and their maps live under `docs/design-docs/`.

## Open Questions

- Which reference project source files are most important for Phase 1 implementation?
- Should future CLI commands automate reference submodule update review?
