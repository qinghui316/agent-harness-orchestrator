import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function getTemplateRoot(): string {
  if (process.env.AHO_TEMPLATE_DIR) return process.env.AHO_TEMPLATE_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const distCandidate = join(here, "..", "templates", "core-harness");
  if (existsSync(distCandidate)) return distCandidate;
  return join(here, "..", "..", "templates", "core-harness");
}
