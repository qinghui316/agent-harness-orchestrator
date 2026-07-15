import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export interface WorkbenchRuntimeMutationLock {
  release(): Promise<void>;
}

export async function acquireWorkbenchRuntimeMutationLock(
  memory: ResolvedMemory,
  action: string,
): Promise<WorkbenchRuntimeMutationLock> {
  const path = join(dirname(memory.workbenchDbPath), "runtime-mutation.lock");
  await mkdir(dirname(path), { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(path, "wx");
      await handle.writeFile(`${JSON.stringify({ action, pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
      break;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      handle = undefined;
      if (!isAlreadyLocked(error)) throw error;
      if (attempt === 0 && await removeDeadOwnerLock(path)) continue;
      throw new Error(`Workbench 正在执行数据库重建或运行状态变更，暂时不能${action}。请稍后重试。`, { cause: error });
    }
  }
  if (!handle) throw new Error(`Workbench 无法取得运行状态变更锁，不能${action}。`);
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      await handle.close();
      await unlink(path).catch((error) => {
        if (!isMissing(error)) throw error;
      });
    },
  };
}

async function removeDeadOwnerLock(path: string): Promise<boolean> {
  const owner = await readFile(path, "utf8")
    .then((value) => JSON.parse(value) as { pid?: unknown })
    .catch(() => null);
  if (!owner || typeof owner.pid !== "number" || !Number.isInteger(owner.pid) || owner.pid <= 0 || isProcessAlive(owner.pid)) {
    return false;
  }
  await unlink(path).catch((error) => {
    if (!isMissing(error)) throw error;
  });
  return true;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM");
  }
}

function isAlreadyLocked(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
}
