# Runtime Contract

Runtime supplies a typed assignment with the mode, project and assignment identity, immutable input checkpoint, policy version, bounded evidence references, current document and stable-memory references, isolated workspace root, writable Markdown namespace roots, and required verification. Closeout and evolution assignments also identify a fixed source window.

Treat identity, evidence scope, source window, workspace, namespaces, and policy as server facts. Do not broaden them. Resolve every path against the workspace root, reject traversal and symlinks that escape it, and edit only Markdown under writable namespace roots.

The workspace is the Agent's complete write surface. Runtime materializes its immutable base, captures the resulting filesystem/Git diff, binds reviews to that diff, and decides whether canonical state may change. Agent prose cannot add, remove, or override captured file changes.

Runtime, not this Skill, owns assignment creation, claim/fencing, retries, reviewer execution, apply/rollback, ledger and watermark updates, Change close, and maintenance/evolution completion.
