# Development Setup

## 1. Current Phase

This repository contains Harness infrastructure and a Phase 1 TypeScript CLI.

## 2. Prerequisites

- Git.
- Windows PowerShell 5.1 or PowerShell 7.
- Node.js 20+.
- npm.
- Network access when initializing or updating submodules.

## 3. Reference Sources

Initialize submodules when needed:

```powershell
git submodule update --init --recursive
```

Reference source paths:

- `reference-projects/agent-orchestrator/`
- `reference-projects/oh-my-codex/`
- `reference-projects/ecl-harness-engineer/`

## 4. Product Commands

```powershell
npm install
npm run typecheck
npm run lint
npm run test
npm run build
node dist/index.js --help
```

The CLI command name is `aho` when installed from the package bin.

## 5. Harness Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
```
