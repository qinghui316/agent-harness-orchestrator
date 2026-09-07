import { describe, expect, it, vi } from "vitest";
import { parseOfficeRendererConsoleDiagnostic } from "../../src/desktop/renderer-diagnostic.js";
import { loadOfficePixiModule } from "../../src/web/src/office/officePixiRuntime.js";
import {
  createOfficeRendererFailure,
  OFFICE_RENDERER_DIAGNOSTIC_PREFIX,
  reportOfficeRendererFailure,
} from "../../src/web/src/office/officeRendererDiagnostic.js";

describe("Agent Office renderer reliability", () => {
  it("installs the strict-CSP compatibility layer before loading Pixi", async () => {
    const order: string[] = [];
    const pixi = { Application: class Application {} };
    const loaded = await loadOfficePixiModule({
      loadCspCompatibility: async () => { order.push("compatibility"); },
      loadPixi: async () => { order.push("pixi"); return pixi as never; },
    });

    expect(order).toEqual(["compatibility", "pixi"]);
    expect(loaded).toBe(pixi);
  });

  it("classifies failures without exposing the raw cause", () => {
    const failure = createOfficeRendererFailure(
      "application-init",
      new Error("Current environment does not allow unsafe-eval at C:\\private\\project"),
    );
    expect(failure).toEqual({
      stage: "application-init",
      category: "csp-compatibility",
      userMessage: "办公场景暂时无法显示，请重试。",
    });

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportOfficeRendererFailure(failure);
    expect(error).toHaveBeenCalledWith(`${OFFICE_RENDERER_DIAGNOSTIC_PREFIX}{"category":"csp-compatibility","stage":"application-init"}`);
    expect(error.mock.calls.flat().join(" ")).not.toContain("private");
    error.mockRestore();
  });

  it("accepts only allowlisted desktop console diagnostics", () => {
    expect(parseOfficeRendererConsoleDiagnostic(
      `${OFFICE_RENDERER_DIAGNOSTIC_PREFIX}{"category":"asset-load","stage":"scene-build"}`,
    )).toBe("category=asset-load stage=scene-build");
    expect(parseOfficeRendererConsoleDiagnostic(
      `${OFFICE_RENDERER_DIAGNOSTIC_PREFIX}{"category":"asset-load","stage":"scene-build","path":"C:\\\\private"}`,
    )).toBe("category=asset-load stage=scene-build");
    expect(parseOfficeRendererConsoleDiagnostic(
      `${OFFICE_RENDERER_DIAGNOSTIC_PREFIX}{"category":"arbitrary","stage":"scene-build"}`,
    )).toBeNull();
    expect(parseOfficeRendererConsoleDiagnostic("ordinary renderer output")).toBeNull();
  });
});
