import { shortHash } from "../fs/path.js";

export function buildWorktreeId(changeId: string): string {
  const stamp = compactLocalTimestamp();
  const hash = shortHash(`${Date.now()}\0${Math.random()}\0${changeId}`).slice(0, 6);
  return `wt-${stamp}-${hash}`;
}

function compactLocalTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

