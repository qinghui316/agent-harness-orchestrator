# AHO Memory Layout

Use AHO resolved memory paths. Do not infer paths from `cwd`.

## repo-local

`repo-local` is repository-local and team-shareable by default:

- `AGENTS.md` at project root;
- `docs/` at project root;
- `harness/` at project root;
- `scripts/` at project root;
- runtime-only data under project `.agent-harness/`.

Use this mode only when the project intentionally keeps Harness docs in the
repo.

## external-local

`external-local` keeps source code in any user-selected directory and keeps AHO
memory under the user app data home, normally:

`C:\Users\<user>\.agent-harness\projects\<project-id>`

The project root contains only:

- `AGENTS.md`;
- `.agent-harness/project.json`;
- `.agent-harness/.gitignore`.

The resolved memory root contains:

- `docs/`;
- `harness/`;
- `scripts/`;
- runs, Workbench state, agent catalog, commands, managed skills, and related
  runtime evidence.

For external-local projects, never propose `docs/` or `harness/` paths in the
source root unless the user is explicitly migrating to repo-local/team-share
mode.

## Existing AGENTS.md

If external-local preparation finds a hand-written `AGENTS.md`, deterministic
init may skip overwriting it. The Skill may propose a merge, but it must not
overwrite it directly.

## Codex Access

When memory lives outside the source root, AHO must provide the memory root as
an explicit readable directory to Codex where required. The Skill should state
that AHO resolves memory paths; it should not invent `--add-dir` paths.

## Team-Shared Future

Team-shared repo-local or hybrid memory is a future explicit design. Do not
silently convert external-local projects into repo-local projects.
