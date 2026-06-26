# Review: workbench-local-scheduler-terminal-path-real-ui-scout-v1

Status: completed.

## Findings

No unresolved correctness finding for the implemented fixes.

Residual product blocker: after local landing readiness is `ready`, close/archive
is blocked by the selected external-local Change review state:
`Review status is pending`. This is now surfaced as the current primary local
blocker and does not masquerade as scheduler, PR, or remote work.

## Verification

- Selected verification scope: real Workbench UI acceptance, targeted landing /
  read-model suites, fast product checks, build, and Workbench aggregate unit
  gate.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed.
- Rationale for selected scope: touched owners are Workbench projection and
  landing attribution; slow release scheduler suites were not needed because no
  scheduler runtime behavior changed.
- Commands passed:
  - `npx vitest run tests/unit/landing-source-diff.test.ts`
  - `npx vitest run tests/unit/workbench-read-model.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `npm run test:workbench`

## Complexity Deletion Review

- delete: none.
- reuse: scoped automation, controlled scheduler wrapper, scheduler runtime,
  IntegrationCheck, landing, close, source safety, Workbench confirmation
  queue, and decision inspector alignment.
- yagni: avoided central DB, workflow runtime, permission system, projection
  framework, raw scheduler full-access allowlist, PR/remote/merge paths.
- shrink: fixed two owner-local root causes instead of adding a terminal-path
  coordinator.
- net: small net increase for deterministic tests; no new framework.

## Acceptance Feedback

- Real/manual acceptance performed: yes, using Workbench UI at
  `http://127.0.0.1:4335/`.
- Real Codex acceptance claimed: yes for worker runs in the external sandbox.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion
  evidence: worker implementation used `coder-codex` worktree runs; manual
  IntegrationCheck/apply/landing were driven through Workbench action paths.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: browser tab session had to be rebound; not a
  product blocker.
- Screenshots / artifacts / run ids: see `summary.md` for run ids and E-drive
  paths.
- External source/state safety: source root was clean before manual integration
  apply and dirty after apply only in `src/alpha.ts` / `src/beta.ts`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: two product blockers fixed
  in existing owners; final close blocker recorded.

## Documentation Entropy Coverage

- Applicable: yes, closeout will align `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Before/after line counts: not used; update is pointer-level only.
- Duplicate current-state / latest archive fields checked: done.
- Roadmap/current-direction stale language checked: done.
- Archive-ledger content handling: detailed run ids and gate sequences should
  remain archive-only.
- Tested with: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`,
  and `harness-evolve check`.

## Experience Lifecycle Coverage

- Applicable: closeout only.
- Promote / retain / merge / retire decisions: retain current Harness rules.
- Archive-only decisions: detailed acceptance evidence remains archive-only.

## Worktree Diff Artifact Coverage

- Applicable: no unless product code changes worktree diff collection.
- Reason: acceptance may observe worktree diffs, but does not change diff
  collection behavior unless a blocker is found.

## Read Model Projection Coverage

- Applicable: yes.
- Scope: selected Change confirmation queue and decision inspector across
  scheduler, IntegrationCheck, integration apply, landing, and close gates.
- Tested with: real UI evidence and
  `npx vitest run tests/unit/workbench-read-model.test.ts`.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: real browser Workbench right confirmation panel.
- Checks: only one real primary gate, no raw scheduler full-access, no fake PR /
  remote / merge / Harness evolution, terminal gates remain human where required.
- Tested with: real UI DOM observation and Workbench aggregate unit gate. UI
  component code did not change.

## Scoped Workbench Action Payload Coverage

- Applicable: yes if product code changes or acceptance inspects action payloads.
- Required targets: change id, scheduler / IntegrationCheck / apply / landing
  ids as rendered by the real current gate.
- Tested with: real UI/API evidence for scheduler, IntegrationCheck apply, and
  landing gates.

## Source Apply Safety Coverage

- Applicable: yes.
- Source project: `E:\aho-accept\local-scheduler-terminal-v1\src`.
- Runtime home: `E:\aho-accept\local-scheduler-terminal-v1\home`.
- Source-root mutation gate: integration apply only after manual confirmation.
- Before/after source status: clean before integration apply; after apply only
  `src/alpha.ts` and `src/beta.ts` modified.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Boundary: Workbench SQLite remains interaction/projection storage; Change,
  run, validation, audit, worktree, IntegrationCheck, apply, landing, and close
  artifacts remain workflow truth.
- Tested with: real UI and artifact evidence.

## Proposal / Runtime Boundary Coverage

- Applicable: yes.
- Artifact classification: Codex Plan is proposal; scheduler candidate/check
  artifacts are execution/integration evidence; Workbench UI is projection.
- Execution boundaries: plan confirmation is human; raw scheduler and manual
  IntegrationCheck / integration apply/discard remain outside full-access.
- Tested with: real UI and targeted tests.

## Goal Loop Boundary Coverage

- Applicable: yes.
- Persistent scope: selected Change only.
- Authority: local Goal Loop may choose/wait/delegate only through existing
  gates; it is not workflow truth.
- High-impact gates: manual IntegrationCheck and integration apply/discard stay
  human-confirmed.
- Tested with: real UI and Workbench aggregate unit gate.

## Module Boundary Coverage

- Applicable: yes.
- Owners: Workbench read-model/confirmation, action revalidation, scheduler
  runtime, IntegrationCheck, landing, close, automation stop reason.
- Forbidden write-back locations: broad Workbench/server/frontend/runtime
  facades should not receive new main logic.
- Tested with: targeted landing/read-model tests and product checks.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused: scoped automation, current-gate revalidation,
  controlled scheduler continuation, IntegrationCheck aggregate validation/audit,
  landing review, close gate, and source safety.
- New cross-cutting mechanism: none.
- Local framework avoided: central DB, workflow engine, permission system,
  projection framework, duplicate scheduler executor, and evidence family.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Latest archive / active path alignment: done.
- Pending evolution state checked: no pending evolution; four archived changes
  since last completion, threshold five.
- Tested with: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`,
  and `harness-evolve check`.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: PR, remote, merge, push, and provider flows are out of scope.
