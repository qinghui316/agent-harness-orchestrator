import { appendFile } from "node:fs/promises";
import type { RunEvent } from "../types/index.js";

export async function appendRunEvent(path: string, event: RunEvent): Promise<void> {
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}
