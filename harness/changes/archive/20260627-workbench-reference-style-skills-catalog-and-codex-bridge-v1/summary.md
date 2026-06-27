# workbench-reference-style-skills-catalog-and-codex-bridge-v1

## Purpose

Implement the first reference-style Skills product slice for AHO Harness mode.
Skills are runtime capabilities for the underlying agent, not Harness workflow
artifacts. V1 adds custom skill root scanning, project/topic enablement, Codex
bridge materialization, and visible Workbench controls for managing enabled
skills.

The implementation follows the `desktop-cc-gui` source model: skills can live in
external roots, include supporting folders such as `references/`, `examples/`,
and `scripts/`, and are surfaced through settings/composer runtime context. AHO
keeps its Harness authority boundary: enabling a skill does not authorize a
workflow action, source apply, close, remote operation, scheduler action, or
Harness evolution.

## Scope

In scope:

- Custom skill roots and scanning directories containing `SKILL.md`.
- Skill metadata, source path/kind/hash, project/topic enablement, and Codex
  bridge sync status.
- Full legal package materialization into `$CODEX_HOME/plugins/aho-managed`,
  including scripts while excluding unsafe paths, symlinks, caches, and large
  files.
- Workbench Settings `技能` panel and composer enabled-skill indicator.
- Provider-neutral response shape with Codex as the only V1 runtime target.
- Run-context audit of enabled skill ids and source/materialized hashes.

Out of scope:

- `$skill` completion, marketplace, curated skill install flow, model settings,
  Claude Code / OpenCode / Gemini execution, and provider switching.
- Direct execution of skill scripts by AHO.
- Any change to confirmation queue, Goal Loop, scheduler, validation/audit,
  apply/close, remote/merge/PR, or Harness evolution permissions.

## Current Status

Completed / ready to close.

## Verification

- `npx vitest run tests/unit/skill-bridge.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/codex.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx tests/unit/skill-bridge.test.ts tests/unit/workbench-server.test.ts`
- `npx vitest run tests/integration/cli-flow.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: the first real UI server attempts used the
  default user `AHO_HOME`; the service was restarted with explicit E-drive
  `AHO_HOME` and `CODEX_HOME` through `cmd /c set ... && node ...`. Real UI
  also exposed an immediate-refresh gap where enabling a Skill in Settings did
  not update the composer indicator until reload; fixed by notifying the parent
  refresh path after add/refresh/enable/sync.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4363/`
  - Source: `E:\aho-accept\skills-catalog-v1\src`
  - Runtime home: `E:\aho-accept\skills-catalog-v1\home`
  - Codex home: `E:\aho-accept\skills-catalog-v1\codex-home`
  - Skill root: `E:\aho-accept\skills-catalog-v1\skill-roots`
  - Screenshot: `E:\aho-accept\skills-catalog-v1\screenshots\skills-settings-synced.png`
  - Synced bridge package:
    `E:\aho-accept\skills-catalog-v1\codex-home\plugins\aho-managed\skills\skillscatalog__pricing-helper`
- External source/state safety: E-drive acceptance source was initialized for
  Harness setup, so `git status --short` showed only setup-owned
  `.agent-harness/` and `AGENTS.md`. No workflow action, source apply, close,
  scheduler, remote, merge, PR, or Harness evolution action was triggered.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: follow-ups remain
  `$skill` completion, actual skill-usage evidence, real model settings, and
  provider capability matrix.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
