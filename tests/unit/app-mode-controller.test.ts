// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_MODE_STORAGE_KEY,
  restoreProductMode,
  useAppModeController,
  type AppModePreferencePort,
} from "../../src/web/src/controllers/AppModeController.js";

afterEach(cleanup);

describe("AppModeController", () => {
  it("defaults missing and invalid persisted values to harness", () => {
    expect(restoreProductMode(null)).toBe("harness");
    expect(restoreProductMode("planning")).toBe("harness");
    expect(restoreProductMode("agent")).toBe("agent");
    expect(restoreProductMode("harness")).toBe("harness");
  });

  it("restores once and changes mode only through explicit selection", () => {
    const preference: AppModePreferencePort = {
      read: vi.fn(() => "agent"),
      write: vi.fn(),
    };
    const { result, rerender } = renderHook(() => useAppModeController(preference));

    expect(result.current.productMode).toBe("agent");
    rerender();
    expect(preference.read).toHaveBeenCalledOnce();

    act(() => result.current.selectMode("harness"));
    expect(result.current.productMode).toBe("harness");
    expect(preference.write).toHaveBeenCalledWith("harness");
  });

  it("uses the fixed browser profile key", () => {
    const setItem = vi.fn();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: vi.fn(() => null), setItem, removeItem: vi.fn(), clear: vi.fn() },
    });
    const { result } = renderHook(() => useAppModeController());

    act(() => result.current.selectMode("agent"));

    expect(setItem).toHaveBeenCalledWith(PRODUCT_MODE_STORAGE_KEY, "agent");
    expect(PRODUCT_MODE_STORAGE_KEY).toBe("aho.workbench.productMode.v1");
  });
});
