# AHO Workbench UI Style

## 1. Direction

AHO Workbench should feel like a calm local AI coding desk, not a blue SaaS dashboard and not a marketing page.

The visual language is warm, editorial, and operational:

- warm cream canvas;
- warm ink text;
- muted coral primary actions;
- dark product surfaces only for code, logs, run replay, and diff chrome;
- compact, readable information density;
- minimal decoration.

The style may borrow the warm editorial feeling of Claude-style product surfaces, but it must not copy Anthropic branding, logos, proprietary typefaces, or page structure.

## 2. Color Tokens

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#faf9f5` | App background |
| `surfaceSoft` | `#f5f0e8` | Sidebar and subtle bands |
| `surfaceCard` | `#efe9de` | Light panels and selected rows |
| `hairline` | `#e6dfd8` | Low-contrast borders |
| `ink` | `#141413` | Primary text |
| `body` | `#3d3d3a` | Body text |
| `muted` | `#6c6a64` | Secondary labels |
| `mutedSoft` | `#8e8b82` | Captions and timestamps |
| `primary` | `#cc785c` | Primary confirmation actions |
| `primaryActive` | `#a9583e` | Pressed primary actions |
| `surfaceDark` | `#181715` | Run replay, code, log, diff surfaces |
| `surfaceDarkElevated` | `#252320` | Inner dark panels |
| `onDark` | `#faf9f5` | Text on dark surfaces |
| `success` | `#5d9f70` | Passed states |
| `warning` | `#d4a017` | Attention states |
| `error` | `#b94a42` | Failed or rejected states |

Do not use blue as the primary interaction color. Blue may appear only in syntax highlighting inside dark code surfaces if needed.

## 3. Typography

Default implementation fonts:

- Display: `Cormorant Garamond`, `EB Garamond`, Georgia, serif.
- UI/body: `Inter`, system UI, sans-serif.
- Code/logs: `JetBrains Mono`, `Cascadia Code`, monospace.

Rules:

- Use serif display only for product identity, topic titles, and major section headings.
- Use sans-serif for navigation, dense UI labels, buttons, tables, and metadata.
- Use monospace only for command, code, path, log, diff, and artifact labels.
- In implemented UI, avoid negative letter-spacing for stability and cross-platform rendering.
- Keep text compact enough for operational use; do not use hero-scale type inside the app shell.

## 3.1 Interface Language

The first design mockups should use Simplified Chinese UI copy because the initial product workflow is being designed and reviewed in Chinese.

Rules:

- Use concise Chinese labels for navigation, workflow events, approvals, and status.
- Keep technical artifact names unchanged when they are file names or command outputs, for example `events.jsonl`, `stdout.log`, `last-message.md`, and `diff.patch`.
- Keep stable domain vocabulary visible where useful: `Topic(Change)`, `Run`, `Worktree`, `Spec`, `Plan`, `Audit`, and `Drift` may appear with Chinese labels.
- Avoid machine-translated long paragraphs. Prefer short product UI text such as `需求意图`, `Spec 已确认`, `验证通过`, `审查通过`, `准备应用`.
- Future localization can add language switching, but current mockups should prioritize clear Chinese review.

## 4. Layout

The Workbench keeps the existing three-pane information architecture:

```text
Left:   Projects / Topics / Repo / Memory
Center: Topic Thread + Agent Loop Replay
Right:  Approval Inbox
```

Layout rules:

- The app background is `canvas`.
- The left sidebar may use `surfaceSoft`.
- The center pane should be mostly unframed, with thin dividers and light bands.
- The right approval pane may use `surfaceSoft` with individual approval rows.
- Avoid nested cards. If a panel is already framed, its children should be rows or sections, not more cards.
- Preserve room for future live streams, interrupt, cancel, and multi-agent traces.

## 5. Components

### Thread View

Thread View is an editorial timeline over a Change.

- Use compact timeline rows, not large chat bubbles.
- Each row should show role, event type, status, timestamp, and artifact pointer when relevant.
- Spec, Plan, Validation, Audit, Apply, and Drift should remain visible as first-class workflow events.
- Long content should collapse into preview rows with artifact links.

### Agent Loop View

Agent Loop is the product chrome surface.

- Use `surfaceDark` for run replay, logs, code, diff, and Codex output.
- Use monospace text, subtle line numbers, and low-saturation syntax accents.
- Show artifact chips such as `events.jsonl`, `stdout.log`, `last-message.md`, and `diff.patch`.
- Clearly label replay as replay until live streaming exists.

### Approval Inbox

Approval Inbox is a derived action view.

- Primary confirm uses coral.
- Reject or defer actions use cream outline buttons.
- Every high-impact action must look confirmable, not automatic.
- Approval cards should be simple rows with status, reason, and action buttons.

### Status Chips

Use low-saturation chips:

- success: muted green;
- warning: warm amber;
- error: muted red;
- neutral: cream surface with warm ink.

Avoid colorful badge overload.

## 6. Radius, Borders, and Depth

- Standard radius: 8px.
- Larger product surfaces: 12px.
- Avoid heavy shadows.
- Prefer surface changes and hairline borders over elevation.
- Use dark surface contrast sparingly and only for actual product chrome.

## 7. Do / Don't

Do:

- Keep the UI simple, warm, and operational.
- Let the three-pane workflow be immediately legible.
- Use coral only for real confirmation actions and a few selected accents.
- Use dark surfaces for code/log/replay content.
- Show real AHO objects: Topic, Change, Run, Validation, Audit, Worktree, Drift, Approval.

Don't:

- Don't create a marketing hero or landing page.
- Don't use blue SaaS primary buttons.
- Don't add decorative gradient blobs, orbs, or abstract illustrations.
- Don't use nested card-heavy layouts.
- Don't hide workflow gates inside generic chat bubbles.
- Don't imply live streaming, cancel, or scheduler behavior before those features exist.
