# workbench-external-local-restore-v1

## Purpose

Fix Workbench restore for external-local projects opened by path. A source
directory with a valid `.agent-harness/project.json` and matching
`AHO_HOME/projects/<projectId>` memory should reopen as a usable Workbench
project, with existing demand conversations and gates rehydrated from durable
memory.

This is an entrypoint/projection hardening change. It restores project routing
and memory diagnostics only; it does not add workflow execution authority.

## Scope

In scope:

- Session-scoped direct project restoration for `workbench serve <sourcePath>`.
- Project list and project-scoped Workbench routes that can serve the restored
  direct project without writing the registry.
- Minimal memory diagnostics in project status and UI copy.
- Tests and E-drive real UI acceptance for external-local restore.

Out of scope:

- Full-auto, scheduler loops, parallel executor, automatic apply/discard/close,
  merge, remote landing, and Harness evolution.
- Automatic creation, overwrite, or migration of missing memory roots.
- UI for choosing arbitrary historical memory homes.

## Current Status

Completed. Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/registry.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Harness closeout checks are recorded in `reviews/review.md`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: none.
- UI evidence: browser opened `http://127.0.0.1:4331/` after stopping and
  restarting Workbench. DOM summary showed project `External Restore V1`,
  conversation `Restore Pending Gate`, bottom status `记忆：external-local`,
  `状态：就绪`, `Harness 就绪`, and one visible primary decision card. No
  `初始化 Harness` or `创建需求对话` button was present.
- External source/state safety: acceptance used
  `E:\aho-accept\external-restore-v1\src` and
  `E:\aho-accept\external-restore-v1\home`. Sandbox initialization marker files
  were committed before the restart restore check. `git status --short` in the
  external source was empty before and after restore; restore did not mutate the
  source root.
- Restored project id: `external-restore-v1`.
- Restored active demand / gate: `restore-pending-gate`; Workbench projected a
  current primary decision card from durable memory.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: closeout updates keep current docs as handoff
  pointers and leave detailed sandbox evidence in this archive.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` updated to the
  restored external-local baseline.
- Old experience retained / merged / retired / archive-only: detailed previous
  scheduler/apply-discard history remains archive-only; current docs retain only
  the external-local restore blocker resolution and next direction.
