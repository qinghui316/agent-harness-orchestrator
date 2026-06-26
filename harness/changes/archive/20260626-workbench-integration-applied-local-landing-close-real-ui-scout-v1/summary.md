# workbench-integration-applied-local-landing-close-real-ui-scout-v1

## Purpose

Verify the local post-integration-apply ending through the real Workbench UI.
The latest product change made `apply-check.apply` reconcile to the real
local `landing.prepare` gate after a repaired IntegrationFix artifact is
applied. This acceptance slice proves that the visible UI can continue from
that point to local `landing.prepare` and then local `change.close/archive`, or
records the next true blocker.

This is the local Agent loop terminal-path scout. It does not introduce PR,
remote, merge, GitHub, or new loop-runtime behavior.

## Scope

In scope:

- Restore the preferred E-drive sandbox
  `E:\aho-accept\integrationfix-real-ui-v1` if its source, home, and gate
  remain usable.
- Otherwise prepare a fresh E-drive sandbox at
  `E:\aho-accept\integration-local-close-v1`.
- Use real Workbench UI/browser interaction to continue from repaired
  IntegrationFix apply through local landing and close/archive.
- Record source state, visible primary gates, landing artifacts, close/archive
  path, and blocker classification.

Out of scope:

- PR, remote, merge, push, GitHub auth, or provider setup.
- Automatic integration apply/discard.
- Expanding scoped `完全访问权限`.
- New workflow runtime, permission system, projection framework, scheduler
  executor, child Change framework, or evidence family.

## Current Status

Completed / ready to close with blocker recorded.

## Acceptance Evidence

- Workbench URL: `http://127.0.0.1:4374`.
- External source: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- External runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Project id: `integrationfix-real-ui-v1`.
- Change id: `src-alpha-ts-alphamode-legacy-modern`.
- IntegrationCheck / apply check id: `apply-check-20260625165935-fa41891a`.
- Repaired patch:
  `E:\aho-accept\integrationfix-real-ui-v1\home\projects\integrationfix-real-ui-v1\workbench\integration-checks\apply-check-20260625165935-fa41891a\repaired.patch`.
- Visible primary gate sequence:
  `planning.scheduler.integration-outcome.reconcile` ->
  `planning.scheduler.run.complete` ->
  `landing.prepare` ->
  `landing.refresh` ->
  final `pr-draft:provider:landing-integration-check-251e3dd502b9` blocker.
- Landing package id: `landing-integration-check-251e3dd502b9`.
- Landing package status after the product fix: `ready`.
- Landing source diff hash:
  `af26694518e45610614cae93c86fe7be30b64445576f95a1438aaed69fc1cd45`.
- Landing changed files: `src/alpha.ts`, `src/beta.ts`,
  `src/integration-note.ts`.
- Landing review verdict: `ready`.
- External source status after acceptance:
  `M src/alpha.ts`, `M src/beta.ts`, `?? src/integration-note.ts`.
- PR/remote/merge/Harness evolution: not executed.

## Product Fix

The scout exposed a real source-attribution bug in local landing. Repaired
IntegrationFix patches that add new files used Git-like new-file patch headers
and LF-normalized blob hashes, while several local source-diff paths rendered
untracked files with ad hoc zero hashes and platform line endings. On Windows
with `core.autocrlf=true`, the source checkout contained CRLF bytes while Git
patch identity uses the filtered LF blob.

The fix adds `src/project/untracked-patch.ts` as the shared Git-compatible
untracked-text patch renderer and reuses it from audit, IntegrationCheck patch
workspace, landing source diff, and PR source matching. The helper uses
`git hash-object --path=<file>` when available and normalizes CRLF to LF when
the filtered Git blob differs from the raw file bytes. This keeps landing
attribution aligned with repaired IntegrationFix patches without adding a new
runtime or permission layer.

## Blocker Classification

Local landing is verified through `landing.prepare` / `landing.refresh`, but
local `change.close/archive` was not reached. After landing became ready, the
current primary gate became a PR/provider status gate:
`pr-draft:provider:landing-integration-check-251e3dd502b9` with summary
`当前项目没有配置 Git remote。`

Because PR/remote/merge are explicitly out of scope for this local-Agent
scout, this is recorded as:

- `product/local-close-flow blocker`: after local landing is ready and PR/remote
  are not part of the current flow, Workbench still routes the next visible
  state to PR provider readiness instead of a local close/archive terminal path.

The blocker should be handled by a later local terminal-gate slice, not by
configuring GitHub or faking close.

## Verification

- `npx vitest run tests/unit/landing-source-diff.test.ts tests/unit/integration-check-apply-discard.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run test:workbench` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed, close-ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: in-app browser connector setup failed with
  `failed to write kernel assets`; acceptance used the real Workbench server
  and project-scoped action path with fresh snapshots. Server-side current-gate
  revalidation remained active.
- Screenshots / artifacts / run ids: see Acceptance Evidence above.
- External source/state safety: AHO development checkout stayed separate from
  the E-drive managed source and runtime home. Landing refresh wrote Workbench
  memory artifacts only and did not run PR/remote/merge.
- Remote handoff acceptance: not applicable; PR/remote/merge are out of scope.
- Product-fixable workarounds or follow-up evidence: local close/archive after
  landing-ready needs a dedicated local terminal-gate follow-up.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: update only compact current handoff and next
  direction.
- Experience lifecycle result: retain current acceptance as latest local
  landing scout; record close blocker archive-only for details.
- Roadmap/current-direction stale language check: update away from generic
  integration apply outcome and toward local terminal close blocker.
- Old experience retained / merged / retired / archive-only: detailed gate
  sequence remains in this archive; entry docs keep only current decision impact.
