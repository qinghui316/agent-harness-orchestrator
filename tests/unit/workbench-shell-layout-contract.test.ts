import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Workbench shell layout contract", () => {
  it("uses two columns when closed and mounts the right rail only while open", async () => {
    const [app, shellCss, sidebarCss, workspaceCss] = await Promise.all([
      readFile("src/web/src/App.tsx", "utf8"),
      readFile("src/web/src/styles/surfaces/shell.css", "utf8"),
      readFile("src/web/src/styles/surfaces/sidebar.css", "utf8"),
      readFile("src/web/src/styles/surfaces/workspace.css", "utf8"),
    ]);
    expect(shellCss).toContain("grid-template-columns: var(--left-sidebar-width, 280px) minmax(0, 1fr);");
    expect(shellCss).toContain(".app-shell.right-rail-open");
    expect(shellCss).not.toContain("decision-pane-collapsed");
    expect(shellCss).not.toMatch(/minmax\(0, 1fr\) 48px/);
    expect(app).toContain('rightToolRailState.mode !== "closed" ? <RightToolRailShell');
    expect(app).not.toContain("BottomStatusBar");
    expect(sidebarCss).toContain("grid-template-rows: minmax(0, 1fr) auto;");
    const normalizedWorkspaceCss = workspaceCss.replace(/\r\n/g, "\n");
    expect(normalizedWorkspaceCss).toContain(".sidebar-resizer {\n  right: -9px;");
    expect(normalizedWorkspaceCss).toContain(".sidebar-resizer::after {\n  right: 8px;");
    expect(normalizedWorkspaceCss).toContain(".right-rail-resizer {\n  left: -9px;");
    expect(normalizedWorkspaceCss).toContain(".right-rail-resizer::after {\n  left: 8px;");
  });

  it("does not retain the retired collapsed rail or text sanitizer", async () => {
    const sources = await Promise.all([
      readFile("src/web/src/panels/workbench/DecisionPaneShell.tsx", "utf8"),
      readFile("src/web/src/formatters.ts", "utf8"),
    ]);
    expect(sources.join("\n")).not.toMatch(/approval-pane-collapsed|userFacingText/);
  });

  it("does not retain retired Workpad presentation selectors or empty Composer APIs", async () => {
    const sources = await Promise.all([
      readFile("src/web/src/App.tsx", "utf8"),
      readFile("src/web/src/shell/composer.tsx", "utf8"),
      readFile("src/web/src/styles/surfaces/workspace.css", "utf8"),
      readFile("src/web/src/styles/surfaces/conversation.css", "utf8"),
      readFile("src/web/src/styles/surfaces/composer.css", "utf8"),
      readFile("src/web/src/styles/surfaces/sidebar.css", "utf8"),
    ]);
    expect(sources.join("\n")).not.toMatch(/onNewWorkpad|workpad-route-switch|workpad-hero|workpad-section|task-queue-|coding-package-|workpad-scroll/);
  });
});
