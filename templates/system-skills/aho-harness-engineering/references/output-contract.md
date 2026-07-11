# Output Contract

The authoritative output is the final Markdown state in the assigned workspace. Make each justified change directly on disk and leave unrelated files unchanged. Runtime computes the diff after the Agent exits.

Return a concise final summary with:

- mode and assignment identity;
- status: `ready`, `noop`, or `blocked`;
- Markdown files created, edited, deleted, split, merged, or renamed;
- evidence references supporting semantic decisions;
- assigned verification run and result;
- warnings, conflicts, or follow-up requests for Runtime.

For `noop`, leave the workspace unchanged and explain why no durable delta is justified. For `blocked`, avoid speculative edits and identify the missing or conflicting Runtime fact. For `ready`, ensure the summary matches the actual workspace state.

Do not place file contents, edit instructions, lifecycle commands, or a machine-authored change payload in the final response. The response is not an alternate write channel.
