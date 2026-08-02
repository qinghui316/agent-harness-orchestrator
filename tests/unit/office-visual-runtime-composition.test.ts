import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { loadAgentOfficeRuntimeComposition, OFFICE_CALIBRATION_URL } from "../../src/web/src/office/agentOfficeRuntimeComposition.js";
import { OfficeCalibrationResolver } from "../../src/web/src/office/officeCalibrationResolver.js";

describe("Agent Office visual runtime composition", () => {
  it("loads and freezes one document and injects one exact resolver", async () => {
    const value = JSON.parse(await readFile("src/web/public/agent-office/config/office-calibration.json", "utf8"));
    const catalog = { version: "1.0", catalogHash: "hash", roles: [] };
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url) === OFFICE_CALIBRATION_URL ? value : catalog), { status: 200 }));
    const runtime = await loadAgentOfficeRuntimeComposition("project-1", fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(OFFICE_CALIBRATION_URL, { cache: "no-cache" });
    expect(fetcher).toHaveBeenCalledWith("/api/projects/project-1/workbench/projections/agent-catalog", { cache: "no-cache" });
    expect(Object.isFrozen(runtime.document)).toBe(true);
    expect(runtime.resolver).toBeInstanceOf(OfficeCalibrationResolver);
    expect(runtime.resolver.calibration).toBe(runtime.document);
    expect(runtime.catalog).toEqual(catalog);
  });

  it("degrades to a real-only Office when the optional Catalog display projection fails", async () => {
    const value = JSON.parse(await readFile("src/web/public/agent-office/config/office-calibration.json", "utf8"));
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(
      String(url) === OFFICE_CALIBRATION_URL ? JSON.stringify(value) : "",
      { status: String(url) === OFFICE_CALIBRATION_URL ? 200 : 503 },
    ));
    const runtime = await loadAgentOfficeRuntimeComposition("project-1", fetcher as typeof fetch);
    expect(runtime.catalog).toBeNull();
    expect(runtime.catalogError).toContain("HTTP 503");
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
      "agentSurfaceOfficeSourceAdapter.ts", "officeExperienceComposer.ts", "officeDirector.ts", "officeScene.ts", "OfficeStaticSceneRenderer.ts", "OfficeParticipantRenderer.ts",
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

  it("keeps pointer hit targets visually transparent while preserving keyboard focus and selection semantics", async () => {
    const [styles, renderer] = await Promise.all([
      readFile("src/web/src/styles/surfaces/office.css", "utf8"),
      readFile("src/web/src/office/PixiOfficeRenderer.tsx", "utf8"),
    ]);

    expect(styles).not.toContain(".office-agent-hitbox:hover");
    expect(styles).not.toContain(".office-agent-hitbox.selected");
    expect(styles).not.toContain(".office-agent-hitbox:not(:focus-visible)");
    expect(styles).toMatch(/\.office-agent-hitbox:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/s);
    expect(renderer).not.toContain(' ? " selected" : ""');
    expect(renderer).toContain('type="button" className={`office-agent-hitbox ${actor.status}`}');
    expect(renderer).toContain("aria-pressed={selectedActorId === actor.actorId}");
    expect(renderer).toContain("onClick={(event) =>");
  });
});
