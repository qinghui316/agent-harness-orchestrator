# Plan: Phase 8T AgentScope Harness Reference Alignment

## Approach

Use the existing reference-project pattern. Add AgentScope 2.0 Python as a submodule, write a dedicated reference map, refresh AgentScope Java Harness mapping, and update AHO architecture docs with a clear Runtime Continuity Layer direction. Do not touch product runtime code.

## Steps

1. Record initial dirty state and create the structured ECL change.
2. Add `reference-projects/agentscope/` as a git submodule with `ignore = all`.
3. Inspect AgentScope 2.0 README/source areas for event/message, permission, workspace/sandbox, multi-session service, background tools, and agent team.
4. Add `docs/design-docs/ref-agentscope.md`.
5. Update `docs/references/index.md` and `AGENTS.md` reference table.
6. Update `docs/design-docs/ref-agentscope-java.md` with v2 Harness details.
7. Update AHO docs for Runtime Continuity Layer and SchedulerContract no-execution boundary.
8. Run reference/drift checks, Harness verification, and product verification.

## Decisions

- AgentScope 2.0 Python and AgentScope Java remain separate references because they answer different questions.
- AgentScope Python is used for current runtime/service concepts.
- AgentScope Java is used for the mature harness-layer structure.
- AHO will borrow runtime-continuity boundaries, not AgentScope's product authority model.

## Module Boundary Plan

- Owner module: not applicable; reference/docs-only change.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: no product modules, no broad facades, no runtime implementation files.
- Compatibility surface: reference docs and `.gitmodules` only.
- Boundary tests: reference grep checks plus Harness/product verification.
- Follow-up split candidates: none.
- If not applicable, reason: change records future architecture boundaries but does not add or move implementation logic.

## Planning-Discovered Gaps

- AHO already references AgentScope Java, but does not yet distinguish AgentScope 2.0 Python from the Java Harness reference.
- Existing docs mention future AgentSession and sandbox concepts, but they need a clearer Runtime Continuity Layer boundary before real parallel scheduler work.
