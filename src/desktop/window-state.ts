export interface DesktopWindowBounds { x: number; y: number; width: number; height: number }
export interface DesktopWindowState { bounds: DesktopWindowBounds; maximized: boolean }
export type DesktopDisplayArea = DesktopWindowBounds;

export const DEFAULT_WINDOW_STATE: DesktopWindowState = {
  bounds: { x: 120, y: 80, width: 1440, height: 900 },
  maximized: false,
};

export function normalizeWindowState(value: unknown, displays: readonly DesktopDisplayArea[]): DesktopWindowState {
  const candidate = parseState(value);
  if (!candidate || !displays.some((display) => intersects(candidate.bounds, display))) return centeredState(displays[0]);
  return candidate;
}

function parseState(value: unknown): DesktopWindowState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DesktopWindowState>;
  const bounds = record.bounds;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  if (bounds.width < 1024 || bounds.height < 700 || typeof record.maximized !== "boolean") return null;
  return { bounds: { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) }, maximized: record.maximized };
}

function centeredState(display: DesktopDisplayArea | undefined): DesktopWindowState {
  if (!display) return DEFAULT_WINDOW_STATE;
  const width = Math.min(1440, display.width);
  const height = Math.min(900, display.height);
  return { bounds: { x: Math.round(display.x + (display.width - width) / 2), y: Math.round(display.y + (display.height - height) / 2), width, height }, maximized: false };
}

function intersects(left: DesktopWindowBounds, right: DesktopDisplayArea): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}
