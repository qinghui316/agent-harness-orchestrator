# Spec: desktop-cc-gui-local-only-reference-correction

## Goal

Make all reference projects local-only optional development evidence. The repository must not track reference project source code, submodule pointers, or gitlinks.

## Users

- The product owner, who wants reference projects available to local agents without uploading or distributing them.
- Future agents, who need clear rules for reading local reference source when it exists and falling back to GitHub URLs or maps when it does not.
- Repository users, who should not be forced to initialize reference projects to use AHO.

## Acceptance Criteria

- AC-001: No `reference-projects/*` path remains tracked as a gitlink in the main repository.
- AC-002: `.gitmodules` is removed because references are no longer submodules.
- AC-003: Current reference docs describe reference source as optional local clones, not required submodules.
- AC-004: Development setup no longer instructs users to initialize submodules.
- AC-005: Current handoff docs reflect the corrected local-only policy and point to this correction.
- AC-006: Harness lint enforces the local-only reference policy by rejecting `.gitmodules` and tracked `reference-projects/*` entries.

## Non-Goals

- Do not delete local reference source directories from this machine.
- Do not remove reference maps or source URLs.
- Do not change AHO product runtime behavior.
- Do not implement provider, packaging, UI, Workbench, scheduler, or Goal Loop changes.

## Constraints

- Keep `README.md` untracked and unrelated.
- Preserve the recently added `docs/design-docs/ref-desktop-cc-gui.md` map, but classify its local path as optional.
- Treat old archive statements about submodules as superseded by this correction, rather than relying on them as current policy.

## Risks

- Future agents may try to run `git submodule update` from stale docs.
- Future agents may fail when local reference source is missing unless docs tell them to use the map and GitHub URL first.
- Removing gitlinks changes repository metadata and must be explicit in Git status.
- Harness lint must change with the policy or future checks will keep requiring submodules.
