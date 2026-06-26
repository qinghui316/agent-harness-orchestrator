# workbench-local-landing-ready-terminal-close-v1

## Purpose

Fix the local terminal Workbench surface after a same-Change IntegrationCheck
result has been human-applied and local landing readiness is `ready`.
The previous real UI scout proved the path reaches local `landing.prepare`, but
then Workbench showed PR provider readiness when PR/remote are out of scope.

This change makes the local-first ending honest: ready local landing should
surface a local `change.close/archive` gate when available, or a clear local
close blocker when close is not ready. PR/provider status may remain supporting
evidence, but it must not be the selected Change's primary local terminal gate.

## Scope

In scope:

- Adjust the existing Workbench confirmation projection for ready landing
  packages.
- Preserve existing PR/remote gates when a real PR flow already exists.
- Add targeted read-model coverage for no-provider local terminal behavior and
  ready close-gate promotion.
- Record the local terminal blocker and closeout evidence.

Out of scope:

- PR, remote, merge, push, GitHub auth, provider setup, or PR landing.
- Automatic integration apply/discard.
- Expanding scoped `完全访问权限`.
- New workflow runtime, permission system, projection framework, scheduler
  executor, child Change framework, or evidence family.

## Current Status

Completed / ready to close.

## Verification

- `npx vitest run tests/unit/workbench-read-model.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run test:workbench` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; close-ready with only closeout task pending before this update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution and 3 archives since last completion.

## Implementation Notes

- Added a local terminal blocker confirmation item for ready landing packages
  whose selected Change cannot yet close locally.
- Adjusted `buildConfirmationQueue` so `pr-draft:provider:*` from an
  unavailable provider is demoted for the selected local Change. Existing PR
  draft / remote / post-merge items still use the original PR projection.
- Aligned `decisionInspector.primary` with the local terminal blocker through a
  narrow `landing:local-terminal-blocker:*` alignment case.

## Real Acceptance Evidence

- Workbench URL: `http://127.0.0.1:4375`.
- External source: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- External runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Selected Change: `src-alpha-ts-alphamode-legacy-modern`.
- Landing package: `landing-integration-check-251e3dd502b9`.
- Observed primary after fix:
  `landing:local-terminal-blocker:landing-integration-check-251e3dd502b9`.
- Observed primary summary:
  `本地落地检查已通过，但需求暂时不能归档：Review status is pending.`
- PR provider item was present only in background:
  `pr-draft:provider:landing-integration-check-251e3dd502b9`.
- Decision inspector primary aligned with the local terminal blocker.
- External source status remained the previously applied local result:
  `M src/alpha.ts`, `M src/beta.ts`, `?? src/integration-note.ts`.
- No PR, remote, merge, push, or Harness evolution action was executed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: in-app browser connector still failed with
  `failed to write kernel assets`; real Workbench server snapshot/action
  evidence was used instead. This limitation is environmental and did not
  bypass server-side current-gate projection.
- Screenshots / artifacts / run ids: see Real Acceptance Evidence.
- External source/state safety: E-drive source remained separate from the AHO
  development checkout; this change did not mutate source root.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: close remains honestly
  blocked by the Change close gate (`Review status is pending`) until the
  selected Change satisfies existing close requirements.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: compact handoff update only.
- Experience lifecycle result: retain local terminal behavior as current
  baseline; archive detailed E-drive evidence.
- Roadmap/current-direction stale language check: active handoff pointers ready
  for archive closeout.
- Old experience retained / merged / retired / archive-only: archive-only for
  per-run ids and snapshot details.

