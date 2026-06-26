# Review: workbench-integration-applied-local-landing-close-real-ui-scout-v1

Status: completed / ready to close with blocker recorded.

## Findings

- [P1] Landing attribution for repaired IntegrationFix patches with new files
  used incompatible untracked patch rendering. Repaired patches used Git-like
  new-file headers and filtered blob ids, while landing/source-diff callers
  rendered untracked files with ad hoc zero hashes and platform line endings.
  Fixed by adding shared `src/project/untracked-patch.ts` and reusing it from
  audit, IntegrationCheck patch workspace, landing source diff, and PR source
  matching.
- [P2] Local close/archive remains not reachable after landing-ready in the
  old E-drive sandbox. After landing became ready, Workbench routed to a
  PR/provider status gate because no Git remote exists. PR/remote are out of
  scope for this local-Agent scout, so the next product slice should define the
  local-only terminal close path after landing-ready instead of configuring
  GitHub or faking close.

## Verification

- Selected verification scope: touched source-diff/IntegrationCheck/landing
  owners plus daily Workbench aggregate because the fix affects Workbench
  post-apply surface and source attribution.
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
- Full / release slow suites: not run. This change touched source-diff
  attribution and Workbench local landing surface, not scheduler release
  dispatch, remote landing, or provider behavior.

## Complexity Deletion Review

- delete: removed four duplicate untracked-file patch renderer implementations.
- reuse: existing IntegrationCheck, landing, audit, PR source matching,
  Workbench action, and current-gate revalidation owners.
- yagni: no new runtime, permission system, projection framework, evidence
  family, PR/remote path, or local close framework.
- shrink: source attribution now has one Git-compatible helper instead of
  caller-local renderers.
- net: production code is neutral/slightly smaller at call sites with one
  shared helper and one regression test added.
- Note: this is supplemental and does not replace correctness, source safety,
  stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes, through a real Workbench server and
  project-scoped action path at `http://127.0.0.1:4374`.
- Browser UI evidence caveat: the in-app browser connector failed to initialize
  with `failed to write kernel assets`; acceptance used the same Workbench
  server actions and fresh snapshots that the UI consumes. This is recorded as
  an environment limitation, not a product pass shortcut.
- Real Codex acceptance claimed: no new Codex run in this change. The change
  reused the already accepted repaired IntegrationFix artifact from the E-drive
  sandbox.
- External source: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- IntegrationCheck id: `apply-check-20260625165935-fa41891a`.
- Landing package id: `landing-integration-check-251e3dd502b9`.
- Gate sequence observed:
  `planning.scheduler.integration-outcome.reconcile` ->
  `planning.scheduler.run.complete` ->
  `landing.prepare` ->
  `landing.refresh` ->
  `pr-draft:provider:landing-integration-check-251e3dd502b9` blocker.
- Source state after local landing scout:
  `M src/alpha.ts`, `M src/beta.ts`, `?? src/integration-note.ts`.
- Remote handoff acceptance: not applicable; PR/remote/merge are explicitly
  out of scope and were not executed.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Duplicate current-state fields checked: yes; entry docs should record only
  latest local landing scout impact and next recommended blocker.
- Roadmap/current-direction stale language checked: yes.
- Archive-ledger content: detailed gate ids, hashes, and source status remain
  archive-only in this change summary.
- Tested with: Harness lint/reindex/status/evolve checks during closeout.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes for handoff closeout only.
- promote: shared untracked-patch rendering as durable product fix.
- retain: IntegrationFix/apply/landing evidence in archive summaries.
- merge: next direction should merge "local ending" language into one local
  terminal gate blocker rather than adding more history.
- retire: treating PR provider readiness as the local-Agent terminal path.
- archive-only: detailed sandbox ids and hashes.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: yes.
- Checked scope: repaired IntegrationFix patch with added
  `src/integration-note.ts` and Windows `core.autocrlf=true`.
- Tested with: `tests/unit/landing-source-diff.test.ts`.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: real selected Change primary gate progression through
  scheduler outcome, scheduler completion, landing prepare, landing refresh,
  and final provider blocker.
- Tested with: real Workbench server snapshots and `npm run test:workbench`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Visible primary UI backed by implemented workflow paths: yes for scheduler
  outcome/completion and local landing.
- Authoritative primary-surface alignment checked: yes through real primary
  gate sequence.
- Out-of-scope future capability check: no automatic PR/remote/merge/Harness
  evolution was shown as completed.
- Real App/browser UI verification result: browser connector unavailable; real
  Workbench server/action/snapshot path used as supplemental acceptance.
- Tested with: real server actions plus `npm run test:workbench`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: selected `changeId`, scheduler run, apply check, landing
  candidate package.
- Tested action path: project-scoped Workbench action endpoint with current
  primary payloads and server revalidation.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- Checked source project: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Checked runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Source-root mutation gate checked: landing refresh did not apply source,
  push, merge, or create remote state; it only classified already-applied local
  source changes and wrote Workbench memory artifacts.
- Out-of-scope source mutation check: PR/remote/merge/Harness evolution were
  not executed.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: Workbench server/action path and external-local memory
  restore on E-drive sandbox.
- Tested with: real Workbench server at `http://127.0.0.1:4374`.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: landing package/review is local
  readiness evidence; it does not authorize PR/remote/merge.
- Out-of-scope execution paths checked: PR provider gate appeared only as a
  blocker/status, not as an executed remote action.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Recommendation authority checked: controlled continuation wrappers advanced
  only concrete current gates; no Goal Loop evidence became workflow truth.
- Hidden execution / source mutation check: no hidden remote or Harness
  evolution execution.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked: source-diff patch rendering, audit, IntegrationCheck
  patch workspace, landing, PR source matching.
- Moved responsibilities: untracked text patch rendering moved to shared
  `src/project/untracked-patch.ts`.
- Retained facade responsibilities: no broad Workbench facade logic added.
- Compatibility surface: action ids and Workbench API shapes unchanged.
- Tested with: targeted suites, `npm run test:fast`, `npm run test:workbench`.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: Git hash-object semantics,
  existing source diff hash, landing review, IntegrationCheck apply, Workbench
  current gate revalidation.
- New cross-cutting mechanism and owner: one small source patch-render helper
  under `src/project`.
- Why existing mechanisms were insufficient: four callers duplicated the same
  untracked-file patch semantics and drifted from Git patch identity.
- Local framework avoided: no state machine, projection system, permission
  system, or evidence family.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: covered by Harness status and reindex.
- Latest archive / active path alignment: active path aligned before close;
  archive path will be generated by `harness-change close`.
- Pending evolution state checked: no pending evolution at intake; final
  `harness-evolve check` required.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: yes as an out-of-scope boundary.
- Checked provider/repository/action boundary: PR provider readiness appeared
  because no Git remote exists; no PR/remote/merge action was executed.
- Tested with: real final primary gate classified as local close blocker.
