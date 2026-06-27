# Plan: workbench-minimal-right-tool-rail-files-panel-v1

## Approach

Replace the right-side shell wrapper, not the Harness decision owner. The new shell owns only collapse state and tab selection. The `确认` tab delegates to the existing `DecisionInspectorPane`; the `文件` tab delegates to a new read-only frontend panel backed by project-scoped file APIs that reuse the existing file-reference safety owner.

## Steps

1. Add the right tool rail shell and wire `确认 / 文件` tab state into `App`.
2. Add project file tree and preview helpers by extending the existing file-reference owner instead of creating a second safety policy.
3. Add server routes for directory children and preview.
4. Add a compact read-only file panel that can browse, search, preview, refresh, and call back to `setComposerFileRefs`.
5. Add tests for API safety, UI tab behavior, fake-control absence, and composer ref insertion.
6. Run targeted/product/Harness verification and record real UI acceptance if possible.

## Decisions

- The right rail remains a single collapsed entry. Future tools are not shown until implemented.
- `确认` is the default tab when pending confirmations exist; otherwise the shell can keep the last selected tab in frontend state only.
- File preview is lightweight text preview with binary/too-large/unsupported messages; no CodeMirror/editor path in V1.
- File/directory references inserted from the file panel reuse the existing composer `TopicFileReference` shape.

## Minimality Gate Plan

- Can this be a no-op: no; current UI has no real file tree/preview panel and the right rail cannot switch between confirmation and read-only tools.
- Reuse: existing `DecisionInspectorPane`, composer file refs, `searchProjectFiles`, and project root safety.
- Shared root fix: extend the file-reference safety owner so composer search, file tree, and preview share path/ignore rules.
- Avoided: no generic multi-tool registry, no editor subsystem, no fake browser/Git/terminal tabs, no new permission system.
- Smallest coherent change: one right shell wrapper, one read-only file panel, two backend read-only endpoints.

## Module Boundary Plan

- Owner module: `src/workbench/file-references.ts` for file safety/read helpers; Workbench server router for read-only HTTP routes; web panel components for shell/panel rendering.
- New / moved responsibilities: right shell UI state, project file children, project file preview, and composer ref insertion from the file panel.
- Facade touch points: `App.tsx` composes the new shell and passes selected project/composer callbacks.
- Forbidden write-back locations: no file action logic in `DecisionInspectorPane`; no file safety duplication in broad server route code.
- Compatibility surface: existing `DecisionInspectorPane` props and composer refs stay compatible.
- Boundary tests: server safety tests plus DOM tests for tab/action separation.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: composer `@file` refs, project-scoped file safety, collapsed right rail, and confirmation queue.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the existing rail cannot switch between confirmation and read-only tools, so a small shell wrapper is needed.
- Domain-specific logic location: read-only file browsing and preview in a file panel/helper.
- Shared cross-cutting logic location: root safety, ignore rules, size and symlink guards stay in `file-references`.
- Local framework / state machine / projection / validation / gate avoided: no generic tool registry, no durable right-panel state, no new gate or workflow action system.
- Future-cost reduction for similar features: later Git/terminal/runtime log can reuse the same shell pattern without adding extra right-side buttons.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None.
