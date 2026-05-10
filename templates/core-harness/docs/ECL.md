# ECL

## Purpose

This project uses ECL to record requirements, plans, tasks, reviews, and Harness evolution as repository artifacts.

## Small Change

Small changes are local, low-risk edits with no interface, data, permission, architecture, runtime, or validation-chain impact.

## Structured Change

Structured changes require one active change under `harness/changes/active/`.

Required files:

- `summary.md`
- `spec.md`
- `plan.md`
- `tasks.md`
- `reviews/review.md`

## Lifecycle

Use generated Harness scripts or Agent Harness Orchestrator commands to move changes through active, parking, and archive.

## Evolution

Pending evolution is a maintenance reminder, not an auto-apply instruction. Apply Harness improvements only with evidence, proposal, review, validation, and results logging.
