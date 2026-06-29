# Plan: workbench-provider-product-mode-runtime-boundary-v2

## Approach

Extend the existing `src/provider-runtime/` owner instead of creating a new
engine framework. Add a thin Codex provider runtime summary that reads readiness
from existing Codex/model/Skill owners, make Product Mode and Harness Execution
Mode vocabulary explicit, and ensure Codex run metadata is consistent across
runner paths that already produce run artifacts/events.

## Steps

1. Inspect current provider-runtime, Codex runner, Workbench API, Settings, and
   composer mode wiring.
2. Add or refine provider runtime types/helpers for Provider, Product Mode,
   Harness Execution Mode, capability snapshot identity, and Codex readiness.
3. Wire Codex run metadata through supported run artifact/event paths without
   rewriting the runners.
4. Keep UI Codex-only and ensure execution mode copy remains Harness-scoped.
5. Add targeted tests for backend runtime summaries, metadata, stable hashes,
   and UI non-exposure of fake providers/modes.
6. Run targeted verification, aggregate checks as needed, and Harness checks.

## Decisions

- V2 stops at Codex/Harness. Future provider/product-mode values may exist in
  types only where necessary, but they are not runnable API/UI entries.
- Provider Registry is diagnostics/readiness, not authority.
- Existing owners stay in place; provider runtime reads summaries.

## Minimality Gate Plan

- Can this be a no-op: no; V1 exists but the boundary needs stable vocabulary,
  metadata, and tests before more product features depend on it.
- Reuse: extend `src/provider-runtime/`, Codex diagnostics/model settings,
  Skill catalog, and existing Workbench Settings surfaces.
- Shared root fix: centralize readiness summary and metadata identity instead
  of adding feature-local provider checks.
- Avoided: no provider selector, no normal Agent mode, no runner rewrite, no
  workflow authority changes.
- Smallest coherent change: thin adapter/metadata/test pass.

## Module Boundary Plan

- Owner module: `src/provider-runtime/`.
- New / moved responsibilities: readiness aggregation and provider metadata
  identity only; no storage migration.
- Facade touch points: Workbench API, Settings UI, Codex runner metadata calls.
- Forbidden write-back locations: Scheduler, Goal Loop, validation/audit,
  apply/close, ToolPolicyGate, confirmation actions.
- Compatibility surface: existing Workbench API remains Codex-only; run
  artifacts gain metadata fields only.
- Boundary tests: unsupported providers/modes not runnable; registry not used
  as authorization.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: provider-runtime V1, Codex
  diagnostics, model settings, Skill catalog, attachments/app-server readiness,
  Workbench Settings.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing mechanisms are sufficient; V2 adds shared aggregation only.
- Domain-specific logic location: Codex readiness remains Codex/provider owner.
- Shared cross-cutting logic location: provider-runtime types and metadata.
- Local framework / state machine / projection / validation / gate avoided: no
  new workflow engine, permission system, or projection framework.
- Future-cost reduction for similar features: Browser/Git/file editing/runtime
  log can read one provider readiness summary instead of scattering provider
  checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
