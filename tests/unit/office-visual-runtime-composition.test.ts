import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { loadAgentOfficeRuntimeComposition, OFFICE_CALIBRATION_URL } from "../../src/web/src/office/agentOfficeRuntimeComposition.js";
import { OfficeCalibrationResolver } from "../../src/web/src/office/officeCalibrationResolver.js";

describe("Agent Office visual runtime composition", () => {
  it("loads and freezes one document and injects one exact resolver", async () => {
    const value = JSON.parse(await readFile("src/web/public/agent-office/config/office-calibration.json", "utf8"));
    const fetcher = vi.fn(async () => new Response(JSON.stringify(value), { status: 200 }));
    const runtime = await loadAgentOfficeRuntimeComposition("project-1", fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(OFFICE_CALIBRATION_URL, { cache: "no-cache" });
    expect(Object.isFrozen(runtime.document)).toBe(true);
    expect(runtime.resolver).toBeInstanceOf(OfficeCalibrationResolver);
    expect(runtime.resolver.calibration).toBe(runtime.document);
  });

  it("fails closed for missing, malformed, and old-schema calibration", async () => {
    await expect(loadAgentOfficeRuntimeComposition("project-1", vi.fn(async () => new Response("", { status: 404 })) as typeof fetch))
      .rejects.toThrow(/HTTP 404/);
    await expect(loadAgentOfficeRuntimeComposition("project-1", vi.fn(async () => new Response("{broken", { status: 200 })) as typeof fetch))
      .rejects.toThrow();
    await expect(loadAgentOfficeRuntimeComposition("project-1", vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 3 }), { status: 200 })) as typeof fetch))
      .rejects.toThrow(/schemaVersion/i);
  });

  it("has no default Resolver owner outside the runtime composition", async () => {
    const owners = await Promise.all([
      "harnessOfficeAdapter.ts", "officeDirector.ts", "officeScene.ts", "OfficeStaticSceneRenderer.ts", "OfficeParticipantRenderer.ts",
    ].map((name) => readFile(`src/web/src/office/${name}`, "utf8")));
    expect(owners.join("\n")).not.toMatch(/new OfficeCalibrationResolver\s*\(/);
  });

  it("uses one reference-paced screen speed for bootstrap and profile changes", async () => {
    const [staticRenderer, runtimeRenderer] = await Promise.all([
      readFile("src/web/src/office/OfficeStaticSceneRenderer.ts", "utf8"),
      readFile("src/web/src/office/PixiOfficeRenderer.tsx", "utf8"),
    ]);
    expect(staticRenderer).toContain("screen.animationSpeed = OFFICE_SCREEN_ANIMATION_SPEED");
    expect(runtimeRenderer).toContain("station.screen.animationSpeed = OFFICE_SCREEN_ANIMATION_SPEED");
    expect(staticRenderer).not.toMatch(/screen\.animationSpeed\s*=\s*Math\.max/);
    expect(runtimeRenderer).not.toMatch(/station\.screen\.animationSpeed\s*=\s*Math\.max/);
  });
});
