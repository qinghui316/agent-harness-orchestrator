import { describe, expect, it } from "vitest";
import { modePresentationPolicy } from "../../src/web/src/presentation/ModePresentationPolicy.js";

describe("ModePresentationPolicy", () => {
  it("shares ordinary Workbench and Office surfaces in both modes", () => {
    expect(modePresentationPolicy("agent").shared).toEqual(modePresentationPolicy("harness").shared);
    expect(Object.values(modePresentationPolicy("agent").shared).every(Boolean)).toBe(true);
  });

  it("exposes governance surfaces only in Harness mode", () => {
    expect(Object.values(modePresentationPolicy("agent").harness).every((visible) => !visible)).toBe(true);
    expect(Object.values(modePresentationPolicy("harness").harness).every(Boolean)).toBe(true);
  });
});
