# Phase 8T AgentScope Harness Reference Alignment

## Purpose

Align AHO's reference documentation with the current AgentScope ecosystem. This phase adds `agentscope-ai/agentscope` as the AgentScope 2.0 Python reference and updates the existing AgentScope Java reference map with the mature `agentscope-harness` layer.

The goal is to record the runtime-continuity lessons AHO should borrow before future parallel scheduler or true subagent work: sessions, workspaces, sandbox/filesystem boundaries, event sources, plan mode, permissions, and background task continuity. This is a documentation/reference phase only.

## Scope

In scope:

- Create the structured ECL change and record carried dirty state from the already-closed Phase 8O-8S Harness evolution handoff.
- Add `reference-projects/agentscope/` for `agentscope-ai/agentscope`.
- Update `docs/references/index.md` to distinguish AgentScope 2.0 from AgentScope Java Harness.
- Add `docs/design-docs/ref-agentscope.md`.
- Update `docs/design-docs/ref-agentscope-java.md` with v2 Harness-layer details.
- Update AHO architecture/runtime/agent/boundary docs with a Runtime Continuity Layer direction.

Out of scope:

- Product runtime implementation.
- Parallel scheduler execution.
- Workbench action, route, CLI, UI, or artifact JSON changes.
- Copying AgentScope runtime code into AHO product code.
- Promoting session, workspace, event, or worker runtime state to workflow truth.

## Current Status

Completed.

## Verification

Passed:

- `git submodule status reference-projects/agentscope`
- `rg "Phase 8S is active|Current active phase: Phase 8S|harness/changes/active/phase-8s" AGENTS.md docs` returned no matches.
- `rg "Phase 8T|AgentScope Harness Reference Alignment|reference alignment|Runtime Continuity" AGENTS.md docs harness/changes/active`
- `rg "AgentScope 2.0|agentscope-ai/agentscope|Runtime Continuity|HarnessAgent|RuntimeContext|AgentEventEnvelope|RuntimeWorkspace|WorkerSession" docs AGENTS.md`
- `rg "do not copy|workflow truth|Change/ECL|SchedulerContract" docs/design-docs/ref-agentscope.md docs/design-docs/ref-agentscope-java.md docs/ARCHITECTURE.md docs/RUNTIME.md docs/BOUNDARIES.md`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Dirty State At Start

Before Phase 8T implementation, `git status --short --untracked-files=all` showed carried handoff state from the closed Phase 8O-8S Harness evolution:

```text
 M AGENTS.md
 M docs/STATUS.md
 M harness/changes/INDEX.json
 D harness/evolution/pending.md
 M harness/evolution/results.tsv
 M harness/evolution/state.json
?? README.md
```

`README.md` remains unrelated and must not be included.
