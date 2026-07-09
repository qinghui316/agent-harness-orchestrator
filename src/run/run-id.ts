import { shortHash, slugify } from "../fs/path.js";

export function buildRunId(changeId: string, command: string[]): string {
  const timestamp = compactLocalTimestamp();
  const commandHash = shortHash(`${Date.now()}\0${command.join("\0")}`).slice(0, 6);
  return `run-${timestamp}-${slugify(changeId)}-${commandHash}`;
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
