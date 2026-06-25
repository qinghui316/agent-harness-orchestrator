# workbench-post-plan-scoped-automation-real-ui-scout-v1

## Purpose

Run a focused real Workbench browser acceptance scout after the post-plan scoped
automation boundary was tightened. The scout verifies that `完全访问权限` is not
available for `planning.confirm-execution`, becomes available only after a human
accepted plan, and then consumes only local post-plan execution gates until it
stops at `result.apply` or a real blocker.

This is an acceptance / blocker-scout change. It should not add a new workflow
runtime, evidence family, permission system, scheduler executor, or Goal Loop
decision layer. Product code changes are in scope only when the real UI path
finds a concrete blocker.

## Scope

In scope:

- Create and use an E-drive external sandbox at
  `E:\aho-accept\post-plan-auto-scout-v1\src` with runtime home
  `E:\aho-accept\post-plan-auto-scout-v1\home`.
- Start Workbench against that external project and drive the ordinary browser
  UI path through planning, human plan confirmation, post-plan scoped
  automation, validation/audit, safe `audit.accept`, and the final human
  `result.apply` gate when reachable.
- Record UI, action, automation, Codex, validation/audit, and source-safety
  evidence.
- If the scout finds a real product blocker, fix only the owned path that
  caused it and add targeted verification.

Out of scope:

- Full-auto, scheduler loop, parallel executor, child Change creation, and new
  workflow runtime.
- Automatic apply, close, merge, remote landing, or Harness evolution.
- Direct raw `planning.scheduler.*` automation.
- Using C-drive acceptance directories or the AHO development checkout as the
  managed source project.

## Current Status

Completed and archived.

## Verification

Completed:

- `git status --short`: AHO checkout only had tracked handoff/index changes and
  unrelated untracked `README.md`.
- `npm run build`: passed before launching Workbench.
- External sandbox `git status --short`: clean before source apply and still
  clean at the final `result.apply` gate.
- Real browser UI acceptance at `http://127.0.0.1:4337` using
  `E:\aho-accept\post-plan-auto-scout-v1\src` and
  `E:\aho-accept\post-plan-auto-scout-v1\home`.
- No product code changed, so targeted Vitest/product aggregate suites were not
  rerun for this no-code acceptance scout.
- Harness checks are recorded in `reviews/review.md`.

## Acceptance Feedback

- Workbench URL: `http://127.0.0.1:4337`.
- External source: `E:\aho-accept\post-plan-auto-scout-v1\src`.
- External runtime home: `E:\aho-accept\post-plan-auto-scout-v1\home`.
- Demand/change id: `src-format-js-formatlabel`.
- Visible gate sequence:
  - project restore loaded the external-local project after UI refresh;
  - demand creation exposed `生成方案草案`;
  - plan generation completed and exposed human `确认规划`;
  - plan confirmation surface had `fullAccessCount = 0`, so `完全访问权限`
    was unavailable for `planning.confirm-execution`;
  - after human plan confirmation, post-plan `生成拆分提案` showed the two-tier
    selector and allowed `完全访问权限`;
  - one `完全访问权限` confirmation started scoped automation;
  - running automation disabled duplicate confirmation and hid repeat primary
    confirmation;
  - final visible primary gate was `确认应用并本地提交`
    / `result.apply`.
- Automation:
  - authorization id:
    `automation-authorization-20260625061258-ef4bb5ff`;
  - run id: `automation-run-20260625061258-63486359`;
  - completed steps: 5;
  - stop reason: `terminal-human-gate`;
  - consumed gates: `planning.decompose`,
    `planning.decomposition.confirm`,
    `planning.decomposition.assess-readiness`, `code.run`, and safe
    `audit.accept`.
- Real run artifacts:
  - planning/intake: `run-20260625-140907-src-format-js-formatlabel-53460c`;
  - planning Codex: `run-20260625-140940-src-format-js-formatlabel-2e279a`;
  - coder Codex worktree:
    `run-20260625-141300-src-format-js-formatlabel-84e11e`;
  - validation:
    `run-20260625-141426-src-format-js-formatlabel-ca609b`;
  - audit:
    `run-20260625-141429-src-format-js-formatlabel-dfd540`.
- Worktree id: `wt-20260625-141301-fcc6df`.
- Coder diff stat: `src/format.js` and `tests/format.test.js`, 5 insertions
  and 1 deletion.
- Validation status: `passed`.
- Audit status: `approved`.
- Final approval evidence:
  `runs/run-20260625-141429-src-format-js-formatlabel-dfd540/audit.json`.
- External source safety: source root stayed clean before human apply;
  no automatic apply/close/merge occurred.
- Environment notes:
  - planning/coder Codex shells could not find an `aho` command, but completed
    through AHO-supplied artifacts and memory;
  - worktree checkout did not contain `.agent-harness/project.json`, but this
    did not block the accepted execution path.
- Product blocker classification: none found.
- Remote handoff acceptance: not applicable.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
