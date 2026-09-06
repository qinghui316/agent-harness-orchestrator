import { describe, expect, it } from "vitest";
import { normalizeWindowState } from "../../src/desktop/window-state.js";

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe("desktop window state", () => {
  it("restores valid visible bounds", () => {
    expect(normalizeWindowState({ bounds: { x: 40, y: 30, width: 1200, height: 800 }, maximized: true }, [display])).toEqual({
      bounds: { x: 40, y: 30, width: 1200, height: 800 },
      maximized: true,
    });
  });

  it("centers an off-screen or undersized window", () => {
    expect(normalizeWindowState({ bounds: { x: 5000, y: 5000, width: 1200, height: 800 }, maximized: false }, [display])).toEqual({
      bounds: { x: 240, y: 90, width: 1440, height: 900 },
      maximized: false,
    });
    expect(normalizeWindowState({ bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: false }, [display]).bounds.width).toBe(1440);
  });

  it("fits the default to a smaller display", () => {
    expect(normalizeWindowState(null, [{ x: 10, y: 20, width: 1280, height: 720 }])).toEqual({
      bounds: { x: 10, y: 20, width: 1280, height: 720 },
      maximized: false,
    });
  });
});
