# Plan: Phase 1 CLI

## Approach

Build a conservative TypeScript CLI with clear domain modules and flat-file storage. Keep all Harness operations Node-native so the product can manage projects before their generated scripts exist.

## Steps

1. Initialize npm/TypeScript/Vitest/ESLint.
2. Add bundled Core Harness templates.
3. Implement filesystem and JSON helpers.
4. Implement project registry and resolver.
5. Implement project marker and Git status detection.
6. Implement Harness audit/init/reindex.
7. Register CLI commands with human and JSON output.
8. Add unit and integration tests.
9. Update docs and run verification.

## Decisions

- Command name: `aho`.
- User state directory: `~/.agent-harness`.
- `project add` does not write target project files.
- `harness init` is the opt-in mutation point.
- Product code remains single-package for Phase 1.

## Planning-Discovered Gaps

None blocking.
