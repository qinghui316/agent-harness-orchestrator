# Spec: workbench-reference-style-skills-catalog-and-codex-bridge-v1

## Goal

Add a reference-style Skills catalog and Codex bridge for Workbench Harness mode.
Users can register local skill roots, scan skills, enable them for a project or
current demand, and sync enabled skills into Codex runtime materialization.

## Users

Local AHO users who want Codex to have project-relevant capabilities while using
Harness mode. Future provider users should be able to reuse the same catalog
semantics when Claude Code / OpenCode / Gemini runtime targets are implemented.

## Acceptance Criteria

- AC-001: Users can register custom skill roots, refresh scanning, and see
  skill name, description, source path, source kind, and source hash for
  directories containing `SKILL.md`.
- AC-002: Skill packages may include `references/`, `examples/`, `scripts/`, and
  other legal package files. AHO does not execute scripts directly.
- AC-003: Project-level and current-topic enablement work, and run context records
  enabled skill ids, source hashes, materialized hashes, and runtime target.
- AC-004: Enabled skills sync into the Codex bridge under the AHO-managed plugin
  namespace with safe manifest rules that skip `.git`, `node_modules`, caches,
  oversized files, symlinks, and path escapes.
- AC-005: Workbench Settings exposes a `技能` panel with add root, refresh,
  enable/disable, and sync controls backed by real APIs. Composer shows an
  enabled Skill indicator that opens Settings.
- AC-006: The API shape is provider-neutral through `runtimeTargets`, but V1 only
  exposes Codex and does not display fake provider/model/marketplace controls.
- AC-007: Enabling or syncing a Skill does not affect `confirmationQueue`,
  workflow gates, source apply, close/archive, scheduler, remote/merge/PR, or
  Harness evolution.

## Non-Goals

- No `$skill` completion.
- No marketplace or curated skill install flow.
- No Claude Code / OpenCode / Gemini bridge.
- No model/provider settings.
- No direct AHO script execution.
- No new workflow truth, permission system, runtime engine, or projection
  framework.

## Constraints

- Follow `desktop-cc-gui` Skill semantics where they apply to runtime
  capabilities, while preserving AHO Harness workflow truth.
- Reuse existing owners: `src/skill/catalog.ts`, `src/codex/bridge.ts`,
  `WorkbenchStore`, Workbench API routes, Settings UI, and composer controls.
- Reference projects and `README.md` remain untracked and out of this change.

## Risks

- Over-constraining skill package contents would make AHO diverge from the
  reference project and Codex Skill semantics.
- Treating enabled skills as workflow authority would weaken Harness gates.
- Copying arbitrary external roots without manifest guards could pull in caches,
  dependencies, symlinks, or private large files.
