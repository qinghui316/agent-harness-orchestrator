# Reference: desktop-cc-gui

## Source

- Source repo: `https://github.com/zhukunpenglinyutong/desktop-cc-gui`
- Local path: `reference-projects/desktop-cc-gui/`
- Inspected commit: `49a69c373c1fe34e0da56516ae5134007d485fd8`
- Reference status: local ignored source reference. Do not vendor-copy into AHO product code.

## What desktop-cc-gui Is

`desktop-cc-gui` is a local desktop AI coding client built on Tauri 2, React, TypeScript, and Rust. It wraps command-line coding agents such as Claude Code, Codex CLI, and OpenCode with a graphical product layer: workspace management, chat, file references, tool cards, file tree, Git panel, terminal, skills, project memory, project map, usage/cost views, settings, themes, and packaging.

AHO should use it as a product-layer and multi-engine desktop-Agent reference. AHO must not copy its authority model into Harness mode. In AHO Harness mode, Change/ECL files, accepted artifacts, run artifacts, validation, audit, worktrees, apply/landing/close, and Harness evolution remain workflow truth.

## Inspected Files

| File | Reason |
| --- | --- |
| `README.zh-CN.md` | Product positioning, user-facing feature list, setup, packaging, and development model. |
| `package.json` | Desktop build scripts, doctor/check scripts, dependency profile, performance and runtime-contract checks. |
| `src/features/` | Feature-first frontend organization across app shell, composer, files, git, terminal, skills, project map, memory, settings, and more. |
| `src/features/app/components/AppLayout.tsx` | Responsive app-shell composition and panel/dock slots. |
| `src/features/workspaces/hooks/useWorkspaces.ts` | Workspace listing, active workspace state, restore snapshot, worktree/clone hooks, Codex prewarm. |
| `src/features/skills/hooks/useSkills.ts` | Skills listing, custom skill roots, startup orchestration, response normalization, debug evidence. |
| `src-tauri/src/` | Rust backend feature modules for engine, Codex, git, terminal, files, settings, project memory, runtime logs, and workspaces. |
| `src-tauri/src/engine/capability_matrix.rs` | Provider capability matrix for Codex, Claude, Gemini, and OpenCode. |
| `src-tauri/src/backend/app_server.rs` | Codex app-server launch/session/timing/diagnostic bridge reference. |
| `src-tauri/tauri.conf.json` | Desktop packaging, updater, CSP, asset protocol, resources, icons, and platform bundle settings. |

## Product-Layer Mapping

### App Shell / Layout

- Reference evidence: `src/features/app/components/AppLayout.tsx`, `src/features/layout/`, `src/features/home/`, `src/features/status-panel/`.
- AHO current gap: AHO Workbench has the core Harness workspace, transcript V2, orchestration map, and collapsed confirmation rail, but not a polished desktop shell with project home, global navigation, docks, settings, and mode switching.
- AHO adaptation: create a shared product shell that hosts Harness mode first: left project navigation, central demand/workspace surface, optional file/git/terminal/runtime docks, right confirmation rail, and mode-aware top-level entry.
- Boundary: shell state is UI/projection only. It must not replace `confirmationQueue.primary`, Change state, validation/audit truth, or apply/close gates.
- Suggested implementation phase: Phase 1, Harness mode product shell.
- Acceptance signal: a user can open AHO, see project/workspace status, enter Harness Workbench, and switch visible panels without triggering workflow actions or leaking internal TaskRun/WorkerLease terms.

### Workspace / Project Management

- Reference evidence: `src/features/workspaces/hooks/useWorkspaces.ts`, `src/features/workspaces/components/WorkspaceHome.tsx`, `src-tauri/src/workspaces/`, `src-tauri/src/session_management_*`.
- AHO current gap: AHO can serve external-local projects and restore markers, but the product still needs first-run project creation, historical project list, workspace grouping, clear restore diagnostics, and a project home.
- AHO adaptation: build project onboarding around AHO's existing marker and external-local memory model. Use a workspace list and project home like desktop-cc-gui, but make AHO project readiness and memory home explicit.
- Boundary: project registry and Workbench SQLite are interaction/configuration stores. They do not become Harness workflow truth.
- Suggested implementation phase: Phase 1.
- Acceptance signal: users can add/open/reopen projects from UI; restored projects show memory mode, Codex readiness, active demands, and safe next entry without manual CLI setup.

### Engine / Provider Capability Matrix

- Reference evidence: `src-tauri/src/engine/capability_matrix.rs`, `src/features/engine/`, `src/features/models/`, provider settings scripts and checks.
- AHO current gap: AHO is Codex-first and has not formalized a user-facing provider capability matrix for future Claude Code / OpenCode support.
- AHO adaptation: document and later implement a provider capability matrix with Codex as the only enabled provider initially. Future engines advertise capabilities such as streaming, tool use, MCP, reasoning effort, collaboration mode, session continuation, and image input.
- Boundary: provider capability is runtime bridge evidence, not permission authority. AHO gates still decide whether an action may run.
- Suggested implementation phase: Phase 4.
- Acceptance signal: settings can show Codex provider status and future provider placeholders without claiming unsupported engines are active.

### Codex Bridge / Runtime Diagnostics

- Reference evidence: `src-tauri/src/backend/app_server.rs`, `src-tauri/src/codex/`, `src/features/codex/`, `src/features/runtime-log/`, `scripts/doctor.mjs`.
- AHO current gap: AHO has Codex runtime paths and artifacts, but the user-facing setup, version/config/trust diagnostics, app-server status, and actionable failure messages are still sparse.
- AHO adaptation: add a Codex diagnostics surface before changing bridge internals: installed version, config/trust status, runtime home, app-server availability, fallback mode, and recent failures.
- Boundary: Codex thread/session ids are runtime continuity only. They must not override AHO Change, accepted plan, run artifacts, validation/audit, or close state.
- Suggested implementation phase: Phase 1 for diagnostics, Phase 4 for provider settings.
- Acceptance signal: a user can tell why Codex cannot start or why AHO fell back, without reading terminal logs.

### Chat / Composer

- Reference evidence: `src/features/composer/`, `src/features/messages/`, `src/features/commands/`, `src/features/prompts/`, README features for `@` file refs, slash commands, attachments, images, queued prompts, rewind, and fork.
- AHO current gap: AHO's demand conversation is functional but lacks mature composer affordances for file references, slash commands, attachments, queued user input, and visible feedback/revise actions.
- AHO adaptation: extend the existing Workbench composer in Harness mode before building normal Agent mode. Treat `@file`, slash commands, and attachments as scoped evidence inputs to planning/rework, not hidden workflow authority.
- Boundary: composer input cannot bypass plan confirmation, ToolPolicyGate, source safety, or apply/close gates.
- Suggested implementation phase: Phase 2.
- Acceptance signal: users can reference files and choose common commands from the composer, and the resulting artifacts show scoped lineage to the selected demand/change.

### Files / Git / Terminal

- Reference evidence: `src/features/files/`, `src/features/git/`, `src/features/git-history/`, `src/features/terminal/`, `src-tauri/src/files/`, `src-tauri/src/git/`, `src-tauri/src/terminal.rs`.
- AHO current gap: AHO has source safety and worktree evidence but lacks first-class user panels for file browsing, git status/diff/history, and terminal access inside the product shell.
- AHO adaptation: add read-mostly project panels first: file tree, diff viewer, git status, terminal dock. Mutating Git/source operations must route through existing AHO gates or explicit project-tool actions.
- Boundary: file/git/terminal panels are tools, not workflow truth. They must not mutate source root before an explicit human action or current-Change scoped local authorization.
- Suggested implementation phase: Phase 3.
- Acceptance signal: users can inspect files, diffs, git status, and run terminal commands without losing AHO source-safety separation.

### Skills / MCP / Tool Discovery

- Reference evidence: `src/features/skills/hooks/useSkills.ts`, `src/features/curated-skills/`, `src-tauri/src/skills.rs`, bundled `curated-skills` resources.
- AHO current gap: AHO can operate with Codex skills/plugins through runtime context, but there is no product UI for skill discovery, status, installation guidance, or custom roots.
- AHO adaptation: build a Skills panel that lists detected AHO/Codex skills, custom roots, source, enabled status, and compatibility. Use Codex-first behavior before adding provider-specific catalogs.
- Boundary: installed or detected skills are runtime capabilities. They do not silently alter Harness rules, project memory, or permissions.
- Suggested implementation phase: Phase 4.
- Acceptance signal: users can see which skills/tools are available to Codex for the current project and why a tool is unavailable.

### Project Memory / Project Map / Context Ledger

- Reference evidence: `src/features/project-memory/`, `src/features/project-map/`, `src/features/context-ledger/`, `src-tauri/src/project_memory/`, `src-tauri/src/project_map*`.
- AHO current gap: AHO has artifact-first memory and external-local restore, but lacks a polished user-facing project map, compact memory view, and context/cost ledger.
- AHO adaptation: expose AHO memory as provenance-backed summaries: project map as derived structure, context ledger as "what evidence fed this answer", and memory notes as editable/reviewable project knowledge.
- Boundary: these are memory/projection surfaces. They must not become accepted plan/tasks, validation/audit, or apply/close authority.
- Suggested implementation phase: Phase 4 or later.
- Acceptance signal: users can inspect project knowledge and context usage while still seeing that Harness artifacts remain the authoritative workflow state.

### Plan / Tasks / Kanban / Intent Canvas

- Reference evidence: `src/features/plan/`, `src/features/tasks/`, `src/features/kanban/`, `src/features/intent-canvas/`, `src/features/spec/`.
- AHO current gap: AHO has Codex Plan Mode, accepted artifacts, TaskGraph, and Workbench gates, but the user-level planning/task visualization can be clearer.
- AHO adaptation: adapt these ideas into Harness mode surfaces: accepted plan, next decision, task graph, worker branches, blockers, and feedback loops. Do not create a second planning truth.
- Boundary: visual task cards and intent nodes are projections over accepted AHO artifacts unless a later change explicitly creates an editable proposal artifact.
- Suggested implementation phase: Phase 2 for planning surface polish, later for editable canvas.
- Acceptance signal: users can understand current plan/tasks and provide feedback without seeing raw internal scheduler/runtime objects as primary workflow.

### Runtime Log / Diagnostics

- Reference evidence: `src/features/runtime-log/`, `src/features/debug/`, `src/features/session-activity/`, `src-tauri/src/runtime_log/`, diagnostic scripts.
- AHO current gap: AHO records rich artifacts, but user-facing provider/env/runtime blocker explanations are scattered across evidence details and terminal output.
- AHO adaptation: add a runtime diagnostics panel that summarizes Codex availability, last run failures, provider/auth/env blockers, validation/audit status, and links to raw artifacts.
- Boundary: diagnostics explain failures; they do not create gates or authorize recovery.
- Suggested implementation phase: Phase 1 and Phase 3.
- Acceptance signal: users can distinguish provider/auth/env failures from product path bugs and Codex agent-quality failures.

### Settings / Theme / i18n / Shortcuts / Update

- Reference evidence: `src/features/settings/`, `src/features/theme/`, `src/features/update/`, `src/i18n/`, package scripts for branding and native menu checks.
- AHO current gap: AHO's product is still primarily a local web Workbench without mature settings, theme, shortcuts, localization, or update surfaces.
- AHO adaptation: add settings in layers: project/runtime settings first, then UI preferences, then i18n/shortcuts, then desktop update behavior once packaged.
- Boundary: user preferences must not change Harness gates or source safety unless they are explicit provider/runtime configuration with diagnostics.
- Suggested implementation phase: Phase 4 and Phase 6.
- Acceptance signal: users can configure Codex path/home/profile and UI preferences from product surfaces, with clear validation.

### Packaging / Desktop App

- Reference evidence: `src-tauri/tauri.conf.json`, build scripts `tauri:dev`, `tauri:build`, `build:win-x64`, `build:mac-*`, updater config, bundled resources.
- AHO current gap: AHO is currently a local Workbench/server developer product, not a packaged desktop app.
- AHO adaptation: treat Tauri packaging as a later productization option after Harness mode product shell and settings stabilize. Package the UI/server/runtime bridge without weakening local-first source boundaries.
- Boundary: packaging is distribution. It must not change workflow truth or introduce hidden provider credentials, remote merge, or auto-update mutation of project state.
- Suggested implementation phase: Phase 6.
- Acceptance signal: a packaged app can open a local project, configure Codex, and run the same Harness mode behavior as the dev Workbench.

## Development Roadmap Implications

1. Phase 1: Harness mode product shell. Add project home, project open/create/restore, Codex diagnostics, and settings entry.
2. Phase 2: Workbench usage layer. Improve composer, file references, slash commands, attachments, feedback affordances, and plan/task surfaces.
3. Phase 3: Tool panels. Add file tree, git status/diff/history, terminal, and runtime log panels with source-safety boundaries.
4. Phase 4: Skills, MCP, provider settings. Keep Codex active; prepare capability matrix for Claude Code and other engines.
5. Phase 5: Normal Agent mode. Reuse the same shell but swap the execution algorithm to a direct single-Agent Codex-style conversation.
6. Phase 6: Desktop packaging. Evaluate Tauri or equivalent only after the product shell and settings are mature.

## Do Not Copy

1. Do not copy desktop-cc-gui's session store or memory model as AHO workflow truth.
2. Do not make ordinary Agent mode the default Harness mode.
3. Do not add Claude Code/OpenCode/Gemini branches before a provider capability matrix exists.
4. Do not introduce Tauri packaging before core local project setup and settings are usable.
5. Do not vendor-copy source code or UI components.
6. Do not let file/git/terminal panels mutate source root outside AHO's explicit safety gates.
7. Do not replace `confirmationQueue.primary` with UI panel state, task cards, or normal chat controls.

## Open Questions For Later Changes

- Whether AHO should package the current local server inside Tauri or keep a separate daemon model.
- Whether normal Agent mode should share the same Workbench transcript store or use a simpler session store.
- Which provider capabilities must be normalized before adding Claude Code.
- Which settings belong at global app level versus project level.
- How to expose Skills/MCP without making installed tools implicit permissions.
