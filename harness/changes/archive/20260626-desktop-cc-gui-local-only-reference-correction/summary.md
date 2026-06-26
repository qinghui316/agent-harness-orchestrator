# Local-Only Reference Project Policy Correction

## Purpose

Correct the reference-project policy: reference repositories are developer-local source evidence, not project dependencies. They may live under `reference-projects/` on this machine, but AHO must not upload their gitlinks/submodule pointers or require other users to download them.

This change removes all tracked reference-project gitlinks and the `.gitmodules` file while preserving documentation maps that name source URLs and optional local paths.

## Scope

In scope:

- Remove all tracked `reference-projects/*` gitlinks from the Git index.
- Remove `.gitmodules`.
- Update reference policy docs to say references are optional local clones.
- Update development setup to remove `git submodule update` instructions.
- Correct current handoff docs after the previous desktop-cc-gui reference-map closeout.

Out of scope:

- Deleting local reference source directories from disk.
- Product runtime, Workbench UI, provider, scheduler, apply/close, or Harness evolution behavior.
- Rewriting old historical archives except by superseding them with this correction.

## Current Status

Completed. Ready to close after final reindex/status checks.

## Verification

- Git index check: `git ls-files --stage reference-projects` returned no tracked reference entries.
- `.gitmodules` removed.
- Drift grep: no stale submodule initialization or local submodule wording remained in tracked current policy docs.
- `scripts/lint-ecl.ps1`: pass after updating the lint rule to reject `.gitmodules` and tracked `reference-projects/*`.
- `scripts/lint-encoding.ps1`: pass.
- `scripts/harness-change.ps1 reindex/status`: pass.
- `scripts/harness-evolve.ps1 check`: pass.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user clarified that reference projects are local development material and must not be uploaded or downloaded by other users.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: local `reference-projects/` directories are preserved; only Git tracking is removed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: recorded in `reviews/review.md`.
- Experience lifecycle result: correction of current reference policy; no Harness runtime change.
- Roadmap/current-direction stale language check: desktop product roadmap retained; reference acquisition policy corrected.
- Old experience retained / merged / retired / archive-only: prior submodule attempt is superseded and archive-only; local-only policy is current.
