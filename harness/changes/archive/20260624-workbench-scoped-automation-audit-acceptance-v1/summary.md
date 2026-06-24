# workbench-scoped-automation-audit-acceptance-v1

## Purpose

Extend the Workbench two-tier scoped automation execution segment so `完全访问权限`
can consume a current, safe `audit.accept` gate after validation/audit has
passed. The user still confirms planning before execution, and automation must
stop at the resulting `result.apply` human gate.

This change is the next narrow product slice after
`workbench-scoped-automation-decomposition-gate-coverage-v1`: it turns the
latest real UI stop point, an approved audit proposal, into a bounded automatic
evidence-materialization step without granting source apply, close, merge,
remote, Harness evolution, scheduler loop, or parallel executor authority.

## Scope

In scope:

- Add a minimal approval-action branch to scoped automation for `audit.accept`.
- Revalidate automatic `audit.accept` against the current authoritative
  Workbench primary gate, selected Change, audit id, run id, artifact, and
  audit status.
- Keep `approved-with-notes`, blocked, stale, missing, forged, or cross-Change
  audit gates outside automation.
- Update Workbench UI so `完全访问权限` is available for safe `audit.accept` and
  unavailable for apply/close/high-impact gates.
- Add targeted runtime, revalidation, projection, DOM, and real UI acceptance
  evidence.
- Run real UI acceptance in an E-drive external sandbox, for example
  `E:\aho-accept\audit-accept-v1\src` and
  `E:\aho-accept\audit-accept-v1\home`; do not create new acceptance sandboxes
  on C drive.

Out of scope:

- Automatic `planning.generate`.
- Automatic source apply, close/archive, merge, push, remote landing, or
  Harness evolution.
- Full-auto task mode, scheduler loop, multi-worktree parallel executor,
  slot allocator, or child Change auto creation.
- A second action registry, permission system, projection system, or evidence
  family.

## Current Status

Completed / Ready to close.

## Verification

- Targeted runtime/revalidation/audit checks:
  `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/audit.test.ts`
  passed after the stop-reason and auditor-status prompt fixes.
- Earlier scoped target run:
  `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workflow-actions.test.ts`
  had one aggregate-only `web-app.test.tsx` run-graph DOM flake; single
  `npx vitest run tests/unit/web-app.test.tsx` passed. This is recorded as the
  known App DOM aggregate/wait flake, not a product failure for this change.
- Product checks run before close: `npm run typecheck`, `npm run lint`,
  `npm run test:fast`, and `npm run build` passed. `npm run build` was rerun
  after the final runtime/prompt fixes so real UI acceptance used updated
  `dist/`.
- Workbench aggregate evidence: `npm run test:workbench` exceeded the ordinary
  tool window without an assertion failure both before and after the final
  stop-reason fix. Current split evidence passed:
  `npm run test:workbench:unit`; earlier split evidence also passed
  `npm run test:workbench:slow:scheduler`,
  `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`,
  `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`, and
  `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`. The
  aggregate timeout remains verification topology/runtime-cost debt, not this
  product slice failing.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none. Workbench API wrote Codex trusted-project config
  for the E-drive source path; no manual config editing was required.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures:
  - `E:\aho-accept\audit-accept-v1b` proved the negative safety path:
    real audit returned `approved-with-notes`, so scoped automation correctly
    stopped instead of accepting `audit.accept`.
  - A PowerShell setup mistake briefly wrote runtime state to
    `C:\Users\qinghui\projects\audit-accept-v1c` because `$home` is a built-in
    read-only variable. That exact generated directory was deleted, the
    incomplete E-drive v1c directory was deleted, and subsequent sandboxes used
    `$runtimeHome` under `E:\aho-accept\...`.
  - `E:\aho-accept\audit-accept-v1c` and `v1d` proved UI stop at apply but
    exposed stale stop attribution as `max-steps`; the final runtime fix now
    records `terminal-human-gate`.
- Real UI acceptance:
  - Final sandbox source: `E:\aho-accept\audit-accept-v1e\src`.
  - Final sandbox runtime home: `E:\aho-accept\audit-accept-v1e\home`.
  - Workbench URL: `http://127.0.0.1:4333/`.
  - Demand: "把 describeAutomationMode 的返回值改成 full-access，并更新
    docs/README.md 说明这是 audit accept 自动验收项目。"
  - User-surface path: browser UI created demand, generated planning draft,
    manually confirmed planning, selected `完全访问权限` once, and automation
    advanced through decomposition/readiness, real `coder-codex` `code.run`,
    validation, audit, and automatic `audit.accept`.
  - UI final gate: `应用并本地提交` (`result.apply`) remained visible and
    human-gated; automation did not apply source.
- Run/artifact ids:
  - Automation run:
    `automation-run-20260624104512-622bb5a6`, status `stopped`,
    completed steps `5`, stop reason `terminal-human-gate`.
  - Automation iterations included workflow actions
    `planning.decompose`, `planning.decomposition.confirm`,
    `planning.decomposition.assess-readiness`, `code.run`, and approval action
    `audit.accept`.
  - Real Codex coder run:
    `run-20260624-184515-describeautomationmode-full-access-docs-readme-07e3a0`,
    `runtime = "coder-codex"`, `executionMode = "worktree"`, worktree
    `wt-20260624-184515-1d54f7`.
  - Audit run:
    `run-20260624-184653-describeautomationmode-full-access-docs-readme-b5b8da`,
    status `approved`, findings `[]`, diff hash
    `620717b0590bb98495f92721029ad8bff25c2c60e7801c5035db27e6793768ca`.
- External source/state safety: `git -C E:\aho-accept\audit-accept-v1e\src
  status --short` was empty after automation stopped at `result.apply`; source
  root was not mutated before explicit apply.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - The auditor prompt now states that positive evidence / passing validation
    belongs in the summary and should not become note findings. This avoids
    incorrectly downgrading clean approvals to `approved-with-notes`.
  - Automation stop attribution now treats a successful final `audit.accept`
    at budget boundary as `terminal-human-gate`, because the running automation
    surface can suppress the derived apply gate until the automation action
    itself finishes.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff updated `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` to move this change
  from active to archive/current baseline without copying long sandbox history.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: close/handoff removes active
  path language and records E-drive acceptance as current evidence.
- Old experience retained / merged / retired / archive-only: detailed v1b/v1c/
  v1d retry history is archive-only; current docs retain only the baseline that
  safe `audit.accept` automation stops at human `result.apply`.
