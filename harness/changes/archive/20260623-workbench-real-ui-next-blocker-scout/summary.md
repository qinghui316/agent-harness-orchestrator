# workbench-real-ui-next-blocker-scout

## Purpose

Run a lightweight real browser UI scout against an external sandbox project to
find the next concrete Workbench product blocker, if any, after the real Codex
manual-gated local loop acceptance and close-gate projection alignment.

This change does not expand automation. It verifies the current manual-gated
Workbench path from ordinary demand through planning, readiness-scoped real
Codex code execution, validation/audit, result review, human apply, and close.

## Scope

In scope:

- External sandbox source and runtime home for real UI scout evidence.
- Real browser UI / Workbench action path evidence for the manual-gated loop.
- Real `coder-codex` worktree run artifacts when the path reaches `code.run`.
- Validation, audit, result review, apply source safety, and close/archive
  evidence when the path reaches those gates.
- Accurate blocker classification and a minimal product fix if the scout finds
  a real product blocker.
- Closeout docs/handoff updates after the scout or fix completes.

Out of scope:

- Full-auto task mode or scoped automation authorization.
- Scheduler loop runtime, parallel executor, slot allocator, whole-wave
  dispatch, or child Change auto creation.
- Remote PR, push, merge, merge queue, or provider landing behavior.
- Treating server/API-only evidence as a substitute for real browser UI
  evidence.
- Including unrelated untracked `README.md`.

## Current Status

Ready to close.

The real browser UI scout completed in external sandbox `C:\aho-accept\next2`.
It reached a real browser UI demand, planning, decomposition/readiness, real
`coder-codex` `code.run`, validation, audit approval, UI `audit.accept`,
human-gated `result.apply` with a local commit, and human-confirmed
close/archive.

Two product blockers were found and fixed in the same change:

- Product path bug: while a foreground validator AgentTask was active, the
  Workbench read model could still expose result-review decisions. The fix
  makes active role tasks drive running state, stop availability, role pipeline
  status, and confirmation/decision suppression.
- UI honesty gap: after close/archive, an archived selected demand could still
  expose landing/readiness context as the current primary gate. The fix demotes
  selected archived-topic items out of the current primary confirmation
  surface.

The first scout attempt also exposed an environment setup issue: the external
runtime validation profile was written in the wrong local config shape. The
fresh rerun used the bounded real profile
`typecheck`, `lint`, `test:fast`, and `build`.

## Verification

Completed:

- `git status --short`
- `npm run build`
- Real browser UI scout in external sandbox `C:\aho-accept\next2`.
- `npx vitest run tests/unit/workbench-read-model.test.ts`
- `npx vitest run tests/slow/workbench-apply-integration-flow.test.ts -t "completes a user-facing manual gated Workbench loop through apply and archive"`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`

Pending close command pass:

- Harness checks: `lint-ecl`, `lint-encoding`, `harness-change reindex`,
  `harness-change status`, and `harness-evolve check`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: external sandbox validation profile was configured in
  `C:\aho-accept\next2\home\projects\aho-scout-next2\harness\config\environment.json`
  with bounded real commands.
- Extra prompts or reviewer instructions: the demand explicitly asked for a
  small docs-only Workbench note and not product code.
- Retries or environment failures: first sandbox profile shape prevented a real
  validation artifact and exposed the active-validator UI bug; fresh sandbox
  `next2` completed the loop after product fixes.
- Browser UI evidence: Workbench URL `http://127.0.0.1:4331`; visible gates
  advanced through planning, execution confirmation, decomposition/readiness,
  `code.run`, audit accept, result apply, and close. Latest post-close DOM
  check showed selected demand `已归档`, confirmation queue empty, no
  `确认完成需求`, no `开始落地检查`, and no apply/close/landing primary gate.
- Workbench demand/change id:
  `aho-workbench-ci-real-ui-smoke-scout-s`.
- `coder-codex` run artifact:
  `C:\aho-accept\next2\home\projects\aho-scout-next2\runs\run-20260623-155700-aho-workbench-ci-real-ui-smoke-scout-s-f03880\run.json`
  with `runtime = "coder-codex"` and `executionMode = "worktree"`.
- Codex artifacts:
  `codex-events.jsonl`, `last-message.md`, `diff.patch`, and
  `diff-stat.txt` in the same run directory.
- Validation artifact:
  `run-20260623-155827-aho-workbench-ci-real-ui-smoke-scout-s-55d387`,
  status `passed`, worktree diff hash
  `e331862a184603170d23560c0684ca81849733fb7e9713e0c3d993321b40794e`.
- Audit artifact:
  `run-20260623-155926-aho-workbench-ci-real-ui-smoke-scout-s-5a801f`,
  status `approved`, same diff hash.
- Result apply artifact:
  `run-20260623-160054-aho-workbench-ci-real-ui-smoke-scout-s-c4c24d\apply.json`,
  status `applied`, committed `true`, commit
  `4e34b6f782f59ba62c1d858ba3bb5c68f9186406`.
- External source/state safety: source
  `C:\aho-accept\next2\src`, runtime home `C:\aho-accept\next2\home`; source
  `git status --short` was clean before apply and clean after apply.
- Close/archive path:
  `C:\aho-accept\next2\home\projects\aho-scout-next2\harness\changes\archive\20260623-aho-workbench-ci-real-ui-smoke-scout-s`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: both discovered product
  blockers were fixed in owned runtime/projection code and covered with
  targeted tests. Next recommended structured change is
  `scheduler-slow-runtime-reduction`.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for minimal AGENTS/STATUS active
  pointer updates and closeout handoff updates. Pre-close line counts:
  `AGENTS.md` 176, `docs/STATUS.md` 154,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 242.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: closeout should remove the
  active path and set next work to scheduler slow runtime reduction.
- Old experience retained / merged / retired / archive-only: real scout
  evidence is retained in this archive; detailed UI/run history remains
  archive-only after close.
