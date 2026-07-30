# AHO Workbench UI Style

## Visual Thesis

AHO Workbench should feel like a quiet local operations desk: warm neutral surfaces, compact information density, readable AI work, and one restrained orange action accent. Blue is reserved for selected/focus affordances where Open Design uses a separate selected color.

## Design Tokens

Use these tokens for the Workbench web UI:

| Token | Value | Use |
| --- | --- | --- |
| `--bg-app` | `#faf9f7` | outer app background |
| `--bg-panel` | `#ffffff` | sidebar, thread, inspector surfaces |
| `--bg-subtle` | `#eef1f5` | selected rows, muted tool rows |
| `--bg-elevated` | `#ffffff` | composer and floating controls |
| `--border` | `#e1e5eb` | panel and row borders |
| `--border-strong` | `#c9d0da` | hover and focused borders |
| `--text` | `#1a1916` | primary text |
| `--text-muted` | `#74716b` | supporting labels |
| `--text-faint` | `#989590` | timestamps and secondary metadata |
| `--accent` | `#c96442` | primary actions and app-chrome action emphasis |
| `--selected` | `#2563eb` | active selection and focus rings only |
| `--success` | `#1f7a3a` | pass/approved state |
| `--warning` | `#b26200` | warnings and pending review |
| `--danger` | `#9c2a25` | failures |

Typography is system sans only. Thread body text is 15-16px. Sidebar, metadata, timestamps, and inspector labels are 12-13px. Do not use serif display typography in the Workbench.

## Layout

The Workbench keeps AHO's three-pane model:

```text
Sidebar | Thread workspace | Decision / evidence inspector
```

- Sidebar is a narrow operational navigator with project, topic, repo, memory, and settings state.
- Thread workspace contains a thin header, tabs, a scrollable Thread Stream, and a fixed/sticky bottom composer.
- Right pane is an inspector for pending decisions, decision history, and evidence. It is not an artifact preview canvas.

The UI should borrow Open Design's neutral pane rhythm and composer shape, but not its artifact editor, iframe runtime, MCP/deploy/export flows, or design system picker.

## Components

- **Thread Header**: 52px target height, 15-16px title, metadata on one muted line. Never render the business request as a hero H1.
- **Thread Stream**: plain message flow, not a timeline of raw events. User and assistant messages should read like normal conversation. Workflow summaries and evidence can use light cards.
- **Assistant Turn**: AI prose first. Status, tool, command, usage, and error rows sit under the same turn as compact activity rows.
- **Composer**: fixed/sticky bottom shell with textarea, compact mode selector when backed by real behavior, true running state, and send control. Hide unimplemented controls.
- **Decision Pane**: inspector-style cards with concise labels, reasons, target/evidence fields, and explicit confirmation actions.
- **Agent Loop**: default to readable run summary and phase list. Raw logs live behind a details disclosure.

## Capability Rules

- Do not show buttons for unimplemented features.
- Implemented actions that are invalid in the current state may be disabled if they show a short reason.
- High-impact actions must continue to use allowlisted workflow actions and explicit confirmation.
- Raw stdout, stderr, JSONL, process, and context events do not enter the main Thread.
