# Plan: workbench-reference-style-file-reference-composer-v1

## Approach

Reuse the existing Workbench composer, topic message, skill-parser, and Codex
context paths. Add the smallest reusable file-reference owner: one server-side
project file search helper, one frontend file mention parser/picker/chip path,
and optional message context metadata that Codex context builders can render as
referenced project files.

## Steps

1. Inspect current composer/topic/thread-log/Codex context shapes and the
   `desktop-cc-gui` file-reference source files.
2. Add a project-scoped file search helper and Workbench API route.
3. Add shared frontend `@file` parsing, picker, chips, and draft/topic state
   wiring for both home and topic composers.
4. Extend topic message input/thread entries with scoped file refs and include
   refs in Codex chat/planning prompt context.
5. Add targeted backend/frontend/runtime tests and update review evidence.

## Decisions

- File refs are per-message context. V1 does not implement sticky pinned
  context.
- Codex context receives relative path metadata only. Full file contents are
  not injected by default.
- Unmatched `@token` remains ordinary user text.

## Minimality Gate Plan

- Can this be a no-op: no; composer currently has no `@file` reference path.
- Reuse: existing Workbench project routes, topic message inputs, Codex context
  builders, composer controls, and skill-parser/picker patterns.
- Shared root fix: add one project file-search helper and one file-reference
  parser instead of caller-local path handling.
- Avoided: file index database, contenteditable rewrite, provider/model branch,
  file tree panel, attachment system, and workflow action changes.
- Smallest coherent change: searchable current-project refs plus message-bound
  Codex context.

## Module Boundary Plan

- Owner module: server project-file search helper, frontend file-reference
  composer helper/component, existing Codex chat context owner.
- New / moved responsibilities: file search safety and file mention parsing.
- Facade touch points: Workbench server route dispatch and `App.tsx` state
  wiring remain thin composition only.
- Forbidden write-back locations: do not put search logic in broad Workbench
  chat/read-model facades or treat refs as confirmation queue state.
- Compatibility surface: existing topic create/send routes continue to accept
  old payloads without refs.
- Boundary tests: server route/search tests, DOM composer tests, Codex context
  tests.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: topic message metadata, current
  project registry/status, Codex context builders, composer skill-selection
  wiring.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  there is no current project-file search helper, so add a small reusable one.
- Domain-specific logic location: file search safety under server/workbench
  project helpers; UI parsing/picker under web shell composer helpers.
- Shared cross-cutting logic location: message refs flow through existing topic
  thread/message and Codex context mechanisms.
- Local framework / state machine / projection / validation / gate avoided:
  no new workflow state, permission system, projection system, or durable file
  index.
- Future-cost reduction for similar features: later file tree/attachments can
  reuse safe project file resolution and composer ref parsing.

## Planning-Discovered Gaps

Need to confirm exact thread-log JSON persistence shape before choosing the
minimal field name for scoped message file refs.
