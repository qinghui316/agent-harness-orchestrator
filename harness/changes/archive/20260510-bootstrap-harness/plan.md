# Plan: Bootstrap ECL Harness

## Approach

Use `ecl-harness-engineer` Core Harness rules as the implementation baseline. Create a complete repository-local Harness before adding product code.

## Steps

1. Initialize Git.
2. Add reference projects as submodules under `reference-projects/`.
3. Create project docs and reference maps.
4. Create active change files and templates.
5. Create Harness config, evolution state, generated index, scripts, and CI.
6. Run Harness verification.

## Decisions

- Reference source uses submodules with `ignore = all`.
- `AGENTS.md` stays a map, not a manual.
- Product code begins in a later structured change.
- Current CI validates only Harness files.

## Planning-Discovered Gaps

None blocking for Phase 0.
