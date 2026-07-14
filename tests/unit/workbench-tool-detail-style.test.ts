import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Workbench tool detail viewport contract", () => {
  it("keeps one bounded scroll owner and removes nested pre scrolling", async () => {
    const css = await readFile("src/web/src/styles.css", "utf8");
    const details = css.match(/\.tool-result-details\s*\{([^}]*)\}/)?.[1] ?? "";
    const pre = css.match(/\.tool-result-details pre\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(details).toContain("max-height: min(320px, 38vh)");
    expect(details).toContain("overflow-y: auto");
    expect(details).toContain("overflow-x: auto");
    expect(details).toContain("overscroll-behavior: contain");
    expect(pre).not.toContain("overflow: auto");
  });
});
