# workbench-real-ui-continuation-next-blocker-scout

## Purpose

Run a lightweight real browser Workbench scout on a fresh external sandbox to
find the next concrete product blocker after bounded Goal-driven controlled
continuation runtime V1. The scout must exercise the ordinary user path and, if
a supported controlled Scheduler gate appears, confirm one bounded continuation
from the visible Workbench UI.

This is a product acceptance/change-finding slice, not an automation expansion.
If the real UI path exposes a blocker, fix the smallest owned product boundary
inside this change. If no blocker appears, close with evidence and use the
result as the next baseline before considering broader Goal-driven loop or
scoped full-auto design.

## Scope

In scope:

- Create and use an external sandbox, separate from the AHO development
  checkout, for source and runtime home.
- Start Workbench from the current AHO product build and use the real browser UI.
- Exercise demand creation through planning, decomposition/readiness,
  `code.run`, validation/audit, result review, apply, and close when reachable.
- Exercise one visible bounded continuation gate if the ordinary path produces a
  supported current controlled Scheduler gate.
- Record UI, server action, Codex/runtime, validation/audit, source safety, and
  close/archive evidence.
- Fix only blockers found on this real product path.

Out of scope:

- Full-auto task mode or scoped automation authorization design.
- Parallel executor, scheduler loop, whole-wave dispatch, slot allocation, or
  child Change auto creation.
- Automatic apply, merge, close, remote landing, or Harness evolution.
- New evidence families or promotion of Goal Loop evidence to workflow truth.

## Current Status

Ready to close.

The real browser Workbench scout completed on a fresh external-local sandbox.
The ordinary UI path reached demand creation, planning draft, planning
confirmation, decomposition/readiness, readiness-scoped real `coder-codex`
`code.run`, validation, audit approval, UI `audit.accept`, human-gated
`result.apply` with local commit, and human-confirmed close/archive.

Two product blockers found during the scout were fixed:

- Product path bug: repo-local harness initialization did not ignore
  `.agent-harness/workbench/`, so Workbench SQLite/runtime files could pollute a
  source checkout. `src/harness/init.ts` now writes and backfills
  `workbench/` in `.agent-harness/.gitignore`.
- Product path bug: Workbench intake and worktree dependency detection bypassed
  the shared BOM-safe JSON parser for some `package.json` reads. They now reuse
  `parseJsonText`, so UTF-8 BOM package files no longer block demand intake or
  dependency-bridge setup.

Negative acceptance evidence was also recorded: the
`C:\aho-accept\continue-next-valid` repo-local sandbox reached audit approval
but correctly stopped before apply because AHO active Change files in the source
root made the source dirty. The completed acceptance therefore used
external-local memory, which is the correct source/memory separation for this
product path.

## Verification

- `npx vitest run tests/unit/harness.test.ts tests/integration/cli-flow.test.ts tests/unit/workbench-read-model.test.ts tests/unit/worktree.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- Sandbox supplemental check: `npm run test:fast` in
  `C:\aho-accept\continue-next-external\src`

## Acceptance Feedback

- Final sandbox source: `C:\aho-accept\continue-next-external\src`.
- Final sandbox runtime home:
  `C:\aho-accept\continue-next-external\home`.
- Workbench URL: `http://127.0.0.1:4335/`.
- Demand/change id: `readme-md-usage-sandbox-aho-workbench`.
- Visible primary gate sequence:
  `生成方案草案 -> 确认规划 -> 生成拆分提案 -> 确认拆分方向 -> 检查执行边界 -> 运行 Code -> 确认审查证据 -> 应用并本地提交 -> 确认完成需求`.
- Real coder run:
  `run-20260624-122101-readme-md-usage-sandbox-aho-workbench-7628f1`,
  `runtime = "coder-codex"`, `executionMode = "worktree"`, worktree
  `wt-20260624-122101-60389b`.
- Coder artifacts exist under
  `C:\aho-accept\continue-next-external\home\projects\continue-next-external\runs\run-20260624-122101-readme-md-usage-sandbox-aho-workbench-7628f1\`:
  `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`,
  `diff-stat.txt`, and `implementation.md`.
- Coder diff: `README.md | 6 ++++++`.
- Validation:
  `run-20260624-122326-readme-md-usage-sandbox-aho-workbench-f03b82`,
  status `passed`, worktree diff hash
  `ca3d05141eeb7ef58e03e0ed11df7ef76fb9a4030879e6032a7b1bc4d95dfdea`.
- Audit:
  `run-20260624-122328-readme-md-usage-sandbox-aho-workbench-d16153`,
  status `approved`, findings `[]`, same diff hash.
- Apply:
  `run-20260624-122602-readme-md-usage-sandbox-aho-workbench-36a685`,
  status `applied`, committed `true`, commit
  `c690c419218e0095ab0c0b520040594346c9de6f`.
- Source safety: `git status --short` was clean before code execution, clean
  before apply, and clean after apply/close. Source mutation occurred only after
  the explicit UI `应用并本地提交` gate.
- Close/archive path in the sandbox memory:
  `C:\aho-accept\continue-next-external\home\projects\continue-next-external\harness\changes\archive\20260624-readme-md-usage-sandbox-aho-workbench\`.
- Environment note: the first repo-local rerun reached audit approval but was
  blocked by source-safety because active Change files lived in the source root;
  external-local memory resolved that by separating durable AHO memory from the
  business checkout.
- Setup note: the external sandbox validation config used `validation.commands`,
  while the current schema expects `validation.profiles.default`; official
  validation therefore used package fallback and passed `typecheck`, `lint`, and
  `build`. The sandbox `test:fast` script was run separately and passed.
- Remote handoff acceptance: not applicable.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active/handoff docs were updated for the active
  change; closeout checked `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` line counts and active path alignment.
- Experience lifecycle result: no Harness evolution proposal is needed from this
  scout. The repo-local source-safety observation is recorded as acceptance
  evidence; existing external-local memory rules cover the durable fix.
- Roadmap/current-direction stale language check: completed before closeout.
- Old experience retained / merged / retired / archive-only: retained current
  external-local source/memory separation guidance; detailed sandbox attempt
  history remains archive-only in this summary.
