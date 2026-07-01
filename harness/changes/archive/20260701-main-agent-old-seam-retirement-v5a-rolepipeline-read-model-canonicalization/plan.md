# Plan: main-agent-old-seam-retirement-v5a-rolepipeline-read-model-canonicalization

## Approach

Add `mainAgentExecution` as the canonical Workpad read-model field while keeping
`rolePipeline` as a compatibility alias. Use the current role execution summary
shape unchanged. Read-model construction will build the summary once and assign
it to both fields.

Backend and frontend consumers will switch to canonical-first fallback helpers:
`mainAgentExecution ?? rolePipeline`. This preserves old fixtures and snapshots
while proving new code reads the canonical field.

## Steps

1. Add `WorkbenchMainAgentExecutionSummary` as an alias of the existing role
   execution summary shape and expose `mainAgentExecution` on Workpad DTOs.
2. Build the execution summary once in the Workpad read-model and assign it to
   both canonical and legacy fields.
3. Add backend and frontend fallback helpers and migrate projection/UI consumers
   to prefer the canonical field.
4. Add tests for dual output, canonical preference, and legacy-only fallback.
5. Update current handoff docs and review evidence.

## Decisions

- Keep the wire shape identical in V5a.
- Keep legacy fields and ids until V5b proves deletion safe.
- Avoid broad private function renames in this change.

## Minimality Gate Plan

- Can this be a no-op: no; `rolePipeline` remains the only read-model field and
  blocks canonical seam retirement.
- Reuse: existing role execution summary builder and Workpad projection paths.
- Shared root fix: central canonical-first fallback helper instead of local
  one-off reads.
- Avoided: new schema, evidence family, action id change, UI redesign, and
  future-only branch.
- Smallest coherent change: add canonical field, dual output, fallback reads,
  targeted tests, and docs.

## Module Boundary Plan

- Owner module: Workbench read-model owns the DTO/projection alias; frontend
  Workpad owns display fallback.
- New / moved responsibilities: none; existing summary ownership remains.
- Facade touch points: Workpad DTO types, projection consumers, frontend panel
  consumers.
- Forbidden write-back locations: no scheduler, action registry, automation,
  ToolPolicy, apply/close, or broad workflow runtime changes.
- Compatibility surface: legacy `rolePipeline` remains output and input fallback.
- Boundary tests: assert old action/runtime seams do not return and canonical
  read-model preference is used.
- Follow-up split candidates: V5b legacy field deletion assessment.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench read-model and Workpad
  projection summaries.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: Workbench read-model/frontend Workpad surface.
- Shared cross-cutting logic location: tiny canonical-first fallback helpers.
- Local framework / state machine / projection / validation / gate avoided:
  yes.
- Future-cost reduction for similar features: new consumers can use
  `mainAgentExecution` without carrying old pipeline terminology.

## Planning-Discovered Gaps

None.
