// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProductModeActivityController } from "../../src/web/src/controllers/useProductModeActivityController.js";
import type { ProjectProductModeActivitySnapshot } from "../../src/web/src/types.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("useProductModeActivityController", () => {
  it("rejects stale project responses and reloads on mode changes", async () => {
    const pending = new Map<string, (value: ProjectProductModeActivitySnapshot) => void>();
    const load = vi.fn((projectId: string) => new Promise<ProjectProductModeActivitySnapshot>((resolve) => pending.set(projectId, resolve)));
    const { result, rerender } = renderHook(
      ({ projectId, mode }) => useProductModeActivityController(projectId, mode, { load }),
      { initialProps: { projectId: "project-a" as string | null, mode: "agent" as const } },
    );
    rerender({ projectId: "project-b", mode: "agent" });
    await act(async () => pending.get("project-a")?.(activity("project-a", "failed")));
    expect(result.current.snapshot).toBeNull();
    await act(async () => pending.get("project-b")?.(activity("project-b", "running")));
    expect(result.current.snapshot?.projectId).toBe("project-b");

    rerender({ projectId: "project-b", mode: "harness" });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  });

  it("hides a committed snapshot while the next project load is unresolved or fails", async () => {
    const pending = new Map<string, {
      resolve: (value: ProjectProductModeActivitySnapshot) => void;
      reject: (reason: Error) => void;
    }>();
    const load = vi.fn((projectId: string) => new Promise<ProjectProductModeActivitySnapshot>((resolve, reject) => {
      pending.set(projectId, { resolve, reject });
    }));
    const { result, rerender } = renderHook(
      ({ projectId }) => useProductModeActivityController(projectId, "agent", { load }),
      { initialProps: { projectId: "project-a" } },
    );

    await act(async () => pending.get("project-a")?.resolve(activity("project-a", "failed")));
    expect(result.current.snapshot?.projectId).toBe("project-a");

    rerender({ projectId: "project-b" });
    expect(result.current.snapshot).toBeNull();

    await act(async () => pending.get("project-b")?.reject(new Error("unavailable")));
    expect(result.current.snapshot).toBeNull();
  });

  it("debounces invalidations and ignores events from another project", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async (projectId: string) => activity(projectId, "idle"));
    const { result } = renderHook(() => useProductModeActivityController("project-a", "agent", { load }));
    await act(async () => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.invalidate("project-a");
      result.current.invalidate("project-a");
      result.current.invalidate("project-b");
      vi.advanceTimersByTime(119);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

function activity(projectId: string, state: "idle" | "running" | "failed"): ProjectProductModeActivitySnapshot {
  return {
    projectId,
    generatedAt: "2026-08-23T00:00:00.000Z",
    agent: { productMode: "agent", state, updatedAt: null },
    harness: { productMode: "harness", state: "idle", updatedAt: null },
  };
}
