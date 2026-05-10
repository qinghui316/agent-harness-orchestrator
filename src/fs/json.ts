import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export async function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return schema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error(`Invalid JSON file ${path}: ${(error as Error).message}`);
    }
    throw error;
  }
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function atomicWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, path);
}
