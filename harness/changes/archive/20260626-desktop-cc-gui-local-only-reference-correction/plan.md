# Plan: desktop-cc-gui-local-only-reference-correction

## Approach

Remove reference-project tracking from Git while keeping local files on disk. Then update current docs so reference projects are optional local clones with documented source URLs, not submodules.

## Steps

1. Remove `.gitmodules`.
2. Remove tracked `reference-projects/*` gitlinks from the Git index with `git rm --cached`.
3. Update `AGENTS.md`, `docs/ECL.md`, `docs/DEVELOPMENT.md`, `docs/references/index.md`, and `docs/references/agents-md-practice.md`.
4. Update any reference maps that explicitly say `Local submodule path`.
5. Update `lint-ecl.ps1` so it rejects `.gitmodules` and tracked reference gitlinks instead of requiring them.
6. Update `docs/STATUS.md` to record the correction.
7. Run Harness checks and drift greps.
8. Close and commit the correction, excluding `README.md` and local reference source directories.

## Decisions

- Reference maps and URLs stay tracked.
- Local source under `reference-projects/` may exist on a developer machine but is not required for ordinary checkout.
- If future work needs a reference project, it should first read the map, then use the GitHub URL or local optional path if available.

## Minimality Gate Plan

- Can this be a no-op: no; current Git index contains reference gitlinks.
- Reuse: keep existing reference maps and docs structure.
- Shared root fix: update the policy once across entry/ECL/reference/development docs instead of only fixing desktop-cc-gui.
- Avoided: no product code, no new reference downloader, no repo automation.
- Smallest coherent change: remove gitlinks and stale submodule wording.

## Module Boundary Plan

- Owner module: not applicable; metadata/docs correction only.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime and Workbench code.
- Compatibility surface: checkout no longer requires submodule metadata.
- Boundary tests: Git index check plus Harness docs checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `docs/references/index.md` and design-doc maps.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: reference policy docs.
- Local framework / state machine / projection / validation / gate avoided: all avoided.
- Future-cost reduction for similar features: future references can be added by map + URL without Git metadata churn.

## Planning-Discovered Gaps

- Current repository has four tracked reference gitlinks: `agentscope`, `desktop-cc-gui`, `open-dynamic-workflows`, and `openspec`.
- `.gitmodules` also contains stale entries for other references that are not tracked as gitlinks.
- Existing ECL lint still required `.gitmodules`; it must be updated to match the corrected policy.
