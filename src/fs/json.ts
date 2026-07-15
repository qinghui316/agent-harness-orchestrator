import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export function parseJsonText(text: string, pathForError = "JSON input"): unknown {
  try {
    return JSON.parse(stripUtf8Bom(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON file ${pathForError}: ${error.message}`);
    }
    throw error;
  }
}

export async function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseJsonText(raw, path);
    return schema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid JSON file ${path}: ${(error as Error).message}`);
    }
    throw error;
  }
}

export async function readRequiredJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return schema.parse(parseJsonText(raw, path));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid JSON file ${path}: ${error.message}`);
    }
    throw error;
  }
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function atomicWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, content, "utf8");
  try {
    await renameWithTransientWindowsRetry(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function renameWithTransientWindowsRetry(source: string, target: string): Promise<void> {
  const delays = process.platform === "win32" ? [10, 25, 50, 100, 200, 400] : [];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const delay = delays[attempt];
      if (delay === undefined || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}
