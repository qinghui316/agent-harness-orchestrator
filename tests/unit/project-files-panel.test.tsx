// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectFilesPanel } from "../../src/web/src/panels/workbench/ProjectFilesPanel.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Project files panel", () => {
  it("opens Markdown and TXT resources while preserving composer references", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      path: "",
      parentPath: null,
      entries: [
        { relativePath: "plan.md", name: "plan.md", kind: "file", extension: "md" },
        { relativePath: "notes.txt", name: "notes.txt", kind: "file", extension: "txt" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const onOpenTextDocument = vi.fn();
    const onSelectedRefsChange = vi.fn();
    render(<ProjectFilesPanel
      projectId="repo"
      selectedRefs={[]}
      onSelectedRefsChange={onSelectedRefsChange}
      onOpenTextDocument={onOpenTextDocument}
    />);

    fireEvent.click(await screen.findByRole("button", { name: /plan\.md/ }));
    expect(onOpenTextDocument).toHaveBeenCalledWith("plan.md");
    const insert = screen.getByTestId("project-files-insert-ref") as HTMLButtonElement;
    await waitFor(() => expect(insert.disabled).toBe(false));
    fireEvent.click(insert);
    expect(onSelectedRefsChange).toHaveBeenCalledWith([expect.objectContaining({ relativePath: "plan.md", source: "composer" })]);

    fireEvent.click(screen.getByRole("button", { name: /notes\.txt/ }));
    expect(onOpenTextDocument).toHaveBeenCalledWith("notes.txt");
  });
});
