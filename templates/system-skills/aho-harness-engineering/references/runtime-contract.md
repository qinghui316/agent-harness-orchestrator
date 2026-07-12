# Runtime Contract

Runtime supplies a bounded task packet with the mode, task identity, evidence references, canonical root, writable Markdown namespaces, and required verification. Evolution packets also identify one fixed source window.

Treat identity, evidence scope, source window, canonical root, namespaces, and policy as server facts. Do not broaden them. Resolve every path against the canonical root, reject traversal and symlinks that escape it, and edit only Markdown under writable namespace roots.

Maintenance edits canonical Markdown directly. Evolution first returns a proposal in a read-only turn, native-spawns one scorer child, and edits canonical docs only when the score is at least 80 with no hard issue. There is no reviewer, diff-manifest, or project-memory apply stage.

Runtime, not this Skill, owns task creation, claim/fencing, heartbeat, retries, lease interruption, ledger and watermark updates, Change close, and maintenance/evolution completion. The Evolution Agent owns its bounded scorer delegation.
