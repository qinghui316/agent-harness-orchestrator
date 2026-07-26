import type { OfficePoint } from "./officeSceneCalibration.js";

export type OfficeRouteFrame = {
  position: OfficePoint;
  progress: number;
};

export function officeRouteFrameAt(
  points: readonly OfficePoint[],
  elapsedMs: number,
  durationMs: number,
): OfficeRouteFrame | null {
  if (points.length === 0) return null;
  if (points.length === 1 || durationMs <= 0) {
    return { position: { ...points.at(-1)! }, progress: 1 };
  }

  const progress = clamp(elapsedMs / durationMs, 0, 1);
  const segments = points.length - 1;
  const scaled = progress * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const local = scaled - index;
  const from = points[index]!;
  const to = points[index + 1]!;

  return {
    position: {
      x: from.x + (to.x - from.x) * local,
      y: from.y + (to.y - from.y) * local,
    },
    progress,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
