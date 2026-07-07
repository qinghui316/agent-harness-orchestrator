# Reference: OpenAI Codex

## Source

- Source repo: `https://github.com/openai/codex`
- Local path: `reference-projects/openai-codex/`
- Inspected commit: `2630a6ca35707e9386fe41f898983321ebb8ae09`
- Reference status: local ignored source reference. Do not vendor-copy into AHO product code.

## Inspected Files

| File | Reason |
| --- | --- |
| `README.md` | Product surface and install/run modes |
| `codex-cli/bin/codex.js` | npm launcher, platform binary selection, signal forwarding |
| `codex-rs/cli/src/main.rs` | top-level CLI subcommands and dispatch |
| `codex-rs/exec/src/cli.rs` | `codex exec` flags and non-interactive interface |
| `codex-rs/exec/src/lib.rs` | stdin prompt handling, config loading, sandbox/approval behavior |
| `codex-rs/exec/tests/suite/prompt_stdin.rs` | tested stdin prompt semantics |
| `codex-rs/utils/cli/src/shared_options.rs` | shared `--sandbox`, `--cd`, model, profile, danger bypass options |
| `codex-rs/tui/src/cli.rs` | interactive-only `--ask-for-approval` flag location |
| `codex-rs/app-server/README.md` | app-server permissions, thread cwd, and desktop/app boundary |
| `codex-rs/core/src/tools/handlers/goal_spec.rs` | Goal tool surface, create/get/update behavior, and allowed status transitions |
| `codex-rs/core/src/goals.rs` | Goal continuation, budget handling, lifecycle prompts, and resume logic |
| `codex-rs/core/templates/goals/continuation.md` | Continuation-loop instructions for pursuing a persistent objective from current repo evidence |
| `codex-rs/core/templates/goals/budget_limit.md` | Budget-limit handoff behavior for a long-running objective |
| `codex-rs/tui/src/chatwidget/tests/status_and_layout.rs` | History-cell insertion, active exec cell, warning cells, and collaboration-mode display behavior |
| `codex-rs/tui/src/chatwidget/tests/status_command_tests.rs` | Status command output as inserted history cells |

## Codex CLI Entrypoints

The top-level CLI defines `exec` as the non-interactive Codex entrypoint. It also exposes `review`, `sandbox`, login/logout, MCP, app-server, desktop app launch, apply, resume/fork, and cloud-task commands.

The npm launcher in `codex-cli/bin/codex.js` selects the platform-specific native binary, updates `PATH` for bundled helpers, forwards signals, and mirrors the child process exit status. AHO should keep using a process spawn boundary instead of importing Codex internals.

## Exec and Prompt Evidence

`codex exec` supports a headless flow:

- `--json` prints JSONL events to stdout.
- `--output-last-message` writes the final agent message to a file.
- `-` as the prompt sentinel forces reading the prompt from stdin.
- If a positional prompt is provided and stdin is also piped, stdin is appended as a `<stdin>` block.
- `--cd` / `-C` sets the working root.
- `--model` and `--profile` are shared options.

Implication: AHO Phase 2C's stdin prompt, JSONL capture, and last-message artifact model matches the Codex CLI shape.

For Phase 4E, the same `codex exec` read-only interface is sufficient for Spec Agent and Planner Agent proposal capture: AHO sends a composed prompt through stdin, captures JSONL/stdout/stderr, and stores the final response as proposal artifacts.

## Sandbox and Approval Evidence

Shared CLI options include:

- `--sandbox` / `-s`
- `--dangerously-bypass-approvals-and-sandbox`
- `--cd` / `-C`

`codex exec` marks shared `model` and danger-bypass options as global and reads shared sandbox/cwd/profile values. In headless exec mode, the loaded config override defaults `approval_policy` to `never`. The interactive TUI exposes `--ask-for-approval`, but `codex exec` does not expose it as an exec flag in the inspected source.

`codex exec` rejects runtime approval requests such as command execution approval, file change approval, tool user input, dynamic tool calls, auth token refresh, and apply-patch approval. This means non-interactive exec should be treated as a capture-and-fail-closed runtime, not as an interactive approval flow.

`--full-auto` is a removed/deprecated compatibility trap. Its warning says to use `--sandbox workspace-write` instead. AHO should not use `--full-auto` and should never use danger bypass for default runs.

## Worktree Evidence

No stable local `codex exec` source path was found that creates or manages Git worktrees. The local exec surface accepts a cwd through `--cd` / `-C`; it does not appear to create an isolated branch or worktree itself.

The app-server docs mention cwd arrays such as a project path and a project worktree path, but that is an app/server coordination surface, not evidence that local `codex exec` creates worktrees.

Implication: Phase 3A should make AHO own worktree creation, lifecycle, branch naming, cleanup, and artifact linking. Codex should receive the worktree path as cwd.

## What AHO Should Borrow

- Treat Codex as an external executable invoked through argv arrays.
- Use stdin for composed prompts.
- Capture stdout JSONL, stderr, exit code, and last-message artifacts.
- Detect capabilities at runtime because CLI flags can move across versions.
- Use Codex app-server opportunistically when Workbench needs `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, `turn/interrupt`, and richer turn notifications.
- Use `--sandbox read-only` for proposal capture.
- Keep Spec Agent, Planner Agent, Auditor, and evidence proposer runs in read-only mode.
- For future write mode, prefer `--sandbox workspace-write` inside an AHO-created worktree.
- Keep auth delegated to the user's existing Codex install and config.

## What AHO Should Not Copy

- Do not import Codex internal Rust crates or app-server protocols.
- Do not require desktop/app-server APIs for the local MVP; keep `codex exec` fallback.
- Do not treat app-server `threadId` / `turnId` as workflow truth.
- Do not treat Codex thread goals as AHO workflow truth.
- Do not use `--full-auto`.
- Do not use `--dangerously-bypass-approvals-and-sandbox` as a fallback.
- Do not assume Codex app/desktop worktree behavior applies to `codex exec`.
- Do not let Codex session storage become AHO durable memory.

## Codex Goal Continuation Mapping

Codex's `goal` source is a useful reference for long-running objective behavior, not a replacement for AHO Change/ECL.

Observed source behavior:

- `goal_spec.rs` exposes `get_goal`, `create_goal`, and `update_goal` as explicit tools.
- Creating a goal stores a persistent objective; it is not just the current turn's task list.
- The model may mark a goal `complete` only when the objective is genuinely achieved. Pause, resume, and budget-limit states are controlled by the system or user, not by arbitrary model preference.
- The continuation template tells the model to keep the full objective, inspect the current repository/evidence, make meaningful progress, and only complete after a requirement-by-requirement audit.
- The budget-limit template tells the model to wrap up and avoid starting substantive new work when the active budget is exhausted.

AHO should borrow these rules:

- A complex demand should keep a visible Goal brief plus selected Change scope
  rather than shrinking into the next small turn. If AHO later uses Codex
  native Goal, it is a provider carrier for that current objective text, not
  the source of AHO project memory.
- Each loop turn should start from current repo and Harness evidence, not from stale chat memory alone.
- Completion requires an evidence audit against the original objective, accepted artifacts, validation/audit, IntegrationCheck, apply/close state, and user requirements.
- Blocked, paused, resumed, and budget-limited states must be explicit lifecycle states, not hidden model moods.
- The main Agent may decide that low-conflict work can proceed in parallel and high-conflict work must wait or enter a fix loop.
- AHO may record a `GoalLoopContinuationBrief` as a next-turn reading aid derived from current evidence, but the next turn still has to re-read the selected Change and current artifacts before acting.

AHO must not copy these parts as authority:

- Codex `Goal` is thread/task state; AHO workflow truth remains Change/ECL plus artifacts.
- Codex continuation is not a scheduler loop and does not authorize worker start, source mutation, merge, or close in AHO.
- Codex continuation locks, idle continuation scheduling, active-turn reservation, and token accounting runtime are not copied by AHO's continuation brief evidence.
- AHO still requires ToolPolicyGate, Validation, Audit, IntegrationCheck, and human apply/close gates.

## Implications for Phase 3A

- Implement `WorktreeManager` in AHO, not in the Codex adapter.
- Create worktrees under AHO-controlled run state, then pass the worktree path to Codex with `--cd` / `-C`.
- Keep `RuntimeAdapter` separate from `WorktreeManager`.
- Preserve the current run artifact ledger: context, prompt, events, stdout, stderr, last-message, diff, validation, and review should remain durable artifacts.
- Future Codex write mode should be explicit and should not change `aho run codex` read-only semantics.
- Write-mode completion must still require validation, auditor review, and human confirmation before merge/apply.

## Phase 6E App-Server Mapping

Official Codex app-server documentation describes this lifecycle:

```text
initialize / initialized
-> thread/start or thread/resume
-> turn/start
-> turn/steer while active
-> turn/interrupt when requested
-> streaming item/agent/tool notifications
-> turn/completed
```

AHO maps that to an optional runtime adapter:

- `planning-agent` app-server turns run read-only in the project root.
- `coder-agent` app-server turns run in an AHO-owned worktree with workspace-write permissions.
- `AgentSession` stores runtime continuity and diagnostics only.
- Raw JSON-RPC notifications are written to `app-server-events.jsonl`; readable assistant deltas and command/tool summaries are projected into the demand conversation.
- If app-server is unavailable or protocol detection fails, the Workbench falls back to `codex exec` and explicitly says live steering is unavailable.

## Phase 7B Transcript Renderer Mapping

Additional source inspection for Phase 7B used:

- `codex-rs/tui/src/history_cell.rs`
- `codex-rs/tui/src/resume_picker/transcript.rs`
- `codex-rs/tui/src/exec_cell/render.rs`

Codex keeps the transcript as cells rather than mixed workflow summaries. Assistant markdown is one kind of history cell. Command execution is an exec/status cell with compact transcript lines and expanded output available through the execution cell. AHO should mirror that boundary:

- assistant-visible text maps to `assistant-message`;
- command execution maps to one compact `process-row`, e.g. `已运行 N 条命令`;
- command, cwd, exit code, stdout/stderr, and previews stay in row details;
- `turn/completed`, usage, and normal status update state but do not create prose cells;
- AHO workflow evidence must not become Codex-like assistant text unless it was literally present in the Codex runtime/replay event stream.

This adapter does not replace independent validation, audit, or human apply/merge decisions.

## Phase 7A Transcript Cell Mapping

Codex's TUI does not render one giant workflow card. Its chat widget inserts history cells for visible assistant text, status/command activity, warning/error states, active execution cells, and collaboration-mode rows. Tests under `codex-rs/tui/src/chatwidget/tests/` assert that history cells are inserted, updated, deferred, or suppressed depending on event type and active execution state.

AHO cannot reuse the Rust TUI components directly, but it should copy the projection rule:

```text
runtime event stream
-> compact conversation cells
-> expandable detail when needed
```

AHO maps Codex-style cells to `ParentAgentTranscriptCell`:

- `HistoryCell` / assistant markdown-like output -> `assistant-message`.
- user prompt history -> `user-message`.
- active command / status / exec cell -> compact `process-row`.
- warning/error cell -> visible `process-row`.
- MCP/tool/collaboration activity -> compact `process-row` with details.
- evidence-like rows that are present in the Codex runtime/replay stream -> `evidence-row`.
- normal policy pass, normal boundary pass, raw JSONL, provider JSON, raw logs, run ids, and artifact paths -> `detail-only`.

Priority matters. If app-server or `codex exec` replay provides real assistant output, AHO must show that output without adding synthetic workflow prose to the default conversation. Validation/audit/PR/landing/maintenance summaries are AHO workflow evidence and belong in the run graph, node details, confirmation queue, or evidence drawers unless Codex itself emitted them in the visible transcript. Derived fallback summaries are not part of the default conversation path. `codex exec` output is replay-style; only app-server/live transport should be presented as live streaming.

## Open Questions

- Which Codex CLI versions in user environments expose `--output-last-message`; AHO should keep the JSONL fallback.
- Whether future Codex app-server APIs become stable enough for a separate runtime adapter.
- How much of Codex's app/server approval reviewer model should influence AHO's future independent auditor role.
- Whether future AHO write mode should use `codex exec` only or also support interactive/desktop runtimes as separate adapters.

## Native Subagent Boundary

Codex native subagents are provider runtime capability, not AHO workflow truth.
AHO may project real app-server collaboration events such as `collabToolCall` /
`collabAgentToolCall` into the Workbench when the provider emits them, and a
future leaf executor may explicitly ask Codex to use native subagents for
bounded exploration. That does not replace WorkflowPlan, WorkflowGraphPlan,
WorkflowRun, TaskRun, WorkerLease, validation, audit, ToolPolicyGate, or human
gates.

AHO must not fake `planning-agent` or child-agent activity when Codex did not
emit real provider events. Parent/child thread links are projection and
diagnostics; Harness-controlled execution remains owned by the target Workflow
Runtime.
