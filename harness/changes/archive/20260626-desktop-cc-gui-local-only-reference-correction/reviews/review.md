# Review: desktop-cc-gui-local-only-reference-correction

Status: completed.

## Findings

No blocking findings.

The corrected policy matches the user's requirement: reference projects are local development material, not repository dependencies. Local clones may remain on disk, but Git must not track their source, gitlinks, or submodule metadata.

## Verification

- Selected verification scope: Git index checks, stale submodule wording grep, Harness lint, encoding lint, reindex/status, and evolution check.
- Git index check: `git ls-files --stage reference-projects` returned no tracked reference entries.
- `.gitmodules` check: file removed.
- Drift grep: no stale `git submodule update`, `Reference projects are submodules`, `Update submodule pointers`, or `Local submodule path` wording remained in tracked current policy docs.
- `scripts/lint-ecl.ps1`: pass after policy/lint update.
- `scripts/lint-encoding.ps1`: pass.
- `scripts/harness-change.ps1 reindex/status`: pass.
- `scripts/harness-evolve.ps1 check`: pass.
- Full / aggregate product suites run or skipped: skipped because no product runtime, Workbench UI, provider bridge, scheduler, apply/close, or source behavior changed.

## Complexity Deletion Review

- delete: removed `.gitmodules` and all tracked reference-project gitlinks.
- reuse: reused existing reference maps and `docs/references/index.md`.
- yagni: avoided a reference downloader, submodule manager, or product runtime feature.
- shrink: replaced submodule policy with a simpler local-only rule and mechanical lint guard.
- net: removes repository dependency surface; small lint/doc additions preserve the invariant.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/ECL.md`, `docs/STATUS.md`, `docs/references/index.md`, `docs/design-docs/ref-desktop-cc-gui.md`.
- Before/after line counts: not materially expanded beyond active pointer/correction text.
- Duplicate current-state fields checked: active pointer aligned in `AGENTS.md` and `docs/STATUS.md` during implementation.
- Roadmap/current-direction stale language checked: reference policy now says local-only optional clones; desktop product roadmap remains unchanged.
- Archive-ledger content promoted / retained / merged / retired / archive-only: prior archive statements about submodules are superseded by this correction; no archive history copied forward.
- Tested with: drift grep and ECL lint.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes as direct user correction.
- promote: local-only reference policy promoted into `AGENTS.md`, `docs/ECL.md`, `docs/references/index.md`, and `lint-ecl.ps1`.
- retain: source maps and GitHub URLs remain tracked.
- merge: reference acquisition guidance merged into one local-only rule.
- retire: submodule/githook guidance retired.
- archive-only: prior submodule attempt and Git for Windows segfault remain historical evidence only.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no runtime bridge changed.
- Checked boundary: references remain external evidence only and are not project dependencies.
- Tested with: Git index check and lint.

## Module Boundary Coverage

- Module boundary coverage applicable: yes for Harness lint ownership.
- Module owners checked: `scripts/lint-ecl.ps1` owns the mechanical local-only reference invariant.
- Compatibility surface: normal checkout no longer has reference submodule metadata.
- Tested with: `lint-ecl`.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: ECL lint and reference maps.
- New cross-cutting mechanism and owner: no new mechanism beyond a small lint rule update.
- Local framework / state machine / projection / validation / gate avoided: all avoided.
- Future-cost reduction result: future references can be documented by URL/map without adding Git dependency metadata.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- Stale active-path / phase grep: active pointer aligned during implementation; closeout will point to archive.
- Pending evolution state checked: no pending evolution before close.

## Non-Applicable Coverage

- Worktree Diff Artifact Coverage: not applicable.
- Read Model Projection Coverage: not applicable.
- Workbench User-Surface Honesty Coverage: not applicable.
- Scoped Workbench Action Payload Coverage: not applicable.
- Transcript Renderer Source-Boundary Coverage: not applicable.
- Source Apply Safety Coverage: not applicable.
- Proposal / Runtime Boundary Coverage: not applicable.
- Goal Loop Boundary Coverage: not applicable.
- Remote Handoff Acceptance Coverage: not applicable.
