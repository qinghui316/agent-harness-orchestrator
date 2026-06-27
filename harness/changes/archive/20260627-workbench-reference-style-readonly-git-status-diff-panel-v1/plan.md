# Plan: workbench-reference-style-readonly-git-status-diff-panel-v1

## Approach

Implement one small readonly Git projection owner, expose it through
project-scoped Workbench APIs, and render it with existing right-rail and center
workspace components.

## Steps

1. Add `src/workbench/git-panel.ts` with safe project-root checks, porcelain
   status parsing, numstat summaries, and bounded patch preview.
2. Add `/api/projects/:id/git/status` and `/api/projects/:id/git/diff`.
3. Add web types for Git status/diff results.
4. Extend `RightToolRailShell` with a `Git` tab.
5. Add `ProjectGitPanel` for branch/status/groups and file selection.
6. Add `GitDiffViewer` in the center workspace.
7. Add targeted backend and DOM tests.
8. Run verification, Harness checks, and closeout.

## Decisions

- Adopt the reference product's right-list plus center-diff interaction.
- Keep V1 readonly; do not copy reference mutating Git commands.
- If the selected project path is not the Git toplevel, fail closed with a
  readable message instead of guessing repo-relative paths.

## Minimality Gate Plan

- Can this be a no-op: no; users cannot inspect Git changes in Workbench.
- Reuse: existing `src/project/git.ts`, Workbench project routes, right rail,
  center tabs, and composer file refs.
- Shared root fix: add one Git projection helper instead of route-local parsing.
- Avoided: Git write framework, PR provider, central DB, workflow projection
  rewrite, editable diff surface.
- Smallest coherent change: readonly status/diff API plus UI panels.

## Module Boundary Plan

- Owner module: `src/workbench/git-panel.ts`.
- New / moved responsibilities: readonly Git status and bounded diff preview.
- Facade touch points: `src/server/workbench/api-router.ts`,
  `src/web/src/panels/workbench/*`, `src/web/src/types.ts`.
- Forbidden write-back locations: source root, Harness artifacts, SQLite state,
  Codex runtime settings.
- Compatibility surface: existing files panel and confirmation pane remain.
- Boundary tests: backend route safety and DOM no-action assertions.
- Follow-up split candidates: Git write operations, history, remote/PR, and
  commit flows.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Git CLI helpers, route
  resolution, composer file refs, right rail shell.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing `file-references` handles filesystem browsing, not Git porcelain or
  diff previews.
- Domain-specific logic location: `src/workbench/git-panel.ts`.
- Shared cross-cutting logic location: project root safety remains local to
  readonly Workbench project tools for now.
- Local framework / state machine / projection / validation / gate avoided:
  no workflow state or action system is added.
- Future-cost reduction for similar features: the right rail can add future
  real tools without changing confirmation ownership.

## Planning-Discovered Gaps

None yet.
