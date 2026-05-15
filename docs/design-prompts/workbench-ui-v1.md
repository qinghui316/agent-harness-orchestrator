# Workbench UI Image Prompt v1

## Goal

Generate a static desktop mockup for the first AHO personal Workbench GUI.

The image is for design direction only. It must show the warm editorial style and three-pane information architecture before any GUI code is implemented.

## Prompt

Create a high-fidelity 16:9 desktop application screenshot mockup for "Agent Harness Orchestrator", a local-first AI coding workbench. All visible user-interface copy should be Simplified Chinese, except technical artifact file names and code identifiers.

Visual style: extremely minimal warm editorial product UI, cream canvas `#faf9f5`, warm ink text `#141413`, muted coral accent `#cc785c`, light cream panels `#f5f0e8` and `#efe9de`, dark product surfaces `#181715` only for code/log/run replay. Use a refined editorial serif for topic title and major headings, Inter-like sans for dense UI, JetBrains Mono-like monospace for code and artifacts. No blue SaaS palette.

Layout: three-column desktop app. Left sidebar shows project selector, topics, repo, memory, settings, with Chinese labels such as "项目", "主题", "仓库", "记忆", "设置". Center workbench shows breadcrumb "agent-harness-orchestrator / 主题 / 会员折扣计价", a topic title "会员折扣计价", and two tabs: "线程" and "Agent 循环". Right sidebar is "确认队列".

Center Thread View: use an editorial timeline, not chat bubbles. Show Chinese rows for "需求意图", "Spec 已确认", "计划已确认", "Coder 运行", "验证通过", "审查通过", "Worktree 准备应用", "Spec-Test 漂移正常". Keep the timeline compact and readable.

Center Agent Loop View: include a dark run replay panel with realistic product chrome. Show event rows, a small code/diff snippet, and artifact chips: `events.jsonl`, `stdout.log`, `last-message.md`, `diff.patch`. Label the stream as "Replay".

Right Approval Inbox: show simple approval rows for "接受审查", "应用 Worktree", and "关闭变更". Use coral "确认" buttons and cream outline "拒绝" / "稍后" buttons. The approval pane should feel actionable but not loud.

Overall composition: quiet, restrained, high information clarity, subtle hairline dividers, 8px to 12px radius, minimal shadows, no decorative blobs, no gradients, no hero illustration, no marketing page, no nested cards. The interface should look like a serious local developer workbench for supervising AI coding workflows.

Do not include Anthropic, Claude, or any external brand logo. Do not use blue primary buttons. Do not invent features such as live streaming controls, cancel, or multi-agent scheduler as enabled; if visible, they should appear as subtle disabled future controls.

## Must Show

- Left: Projects / Topics / Repo / Memory.
- Center: Thread and Agent Loop tabs.
- Center: Topic(Change) workflow with Spec, Plan, Coder, Validation, Audit, Apply, Drift.
- Center: dark replay product surface.
- Right: Approval Inbox with confirm actions.
- Artifact chips: `events.jsonl`, `stdout.log`, `last-message.md`, `diff.patch`.

## Avoid

- Blue SaaS styling.
- Marketing hero composition.
- Decorative gradients, blobs, or abstract illustrations.
- Heavy shadows.
- Nested cards inside cards.
- Chat-only layout.
- Anthropic or Claude branding.

## Acceptance Checklist

- The mockup is simpler and warmer than the previous blue-white version.
- Cream, coral, and dark product surface are visually clear.
- AHO remains a change-centered workbench, not a chat app.
- Thread View and Agent Loop View are both understandable.
- Approval Inbox clearly represents human confirmation gates.
- The image does not promise live streaming, cancel, or multi-agent scheduling as implemented features.
- Visible UI copy is Chinese while artifact file names remain exact.

## Iteration Template

When revising, keep the same structure and change only the requested dimension:

```text
Revise the AHO Workbench mockup while preserving the three-pane layout and warm editorial style.
Change only: <specific change>.
Keep: cream canvas, coral confirm buttons, dark run replay surface, Thread + Agent Loop tabs, Approval Inbox.
Avoid: blue SaaS palette, marketing hero, decorative gradients, nested cards.
```
