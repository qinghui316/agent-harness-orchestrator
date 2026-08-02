import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import { join, relative, resolve } from "node:path";
import { projectRelativePath } from "./contracts.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

const execFileAsync = promisify(execFile);
const GIT_BATCH_SIZE = 100;

export type SourceFingerprintStatus = "current" | "missing" | "invalid";

export interface SourceFingerprintResult {
  source: string;
  status: SourceFingerprintStatus;
  fingerprint: string | null;
}

export interface SourceFingerprintCommandResult {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
}

export type SourceFingerprintCommandRunner = (
  cwd: string,
  args: readonly string[],
) => Promise<SourceFingerprintCommandResult>;

export interface SourceFingerprintSnapshotOptions {
  projectRoot: string;
  commandRunner?: SourceFingerprintCommandRunner;
}

export class SourceFingerprintSnapshot {
  readonly projectRoot: string;
  private readonly commandRunner: SourceFingerprintCommandRunner;
  private readonly results = new Map<string, SourceFingerprintResult>();
  private gitRoot: string | null | undefined;
  private calls = 0;

  constructor(options: SourceFingerprintSnapshotOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.commandRunner = options.commandRunner ?? runGit;
  }

  get gitCallCount(): number {
    return this.calls;
  }

  async prime(sources: readonly string[]): Promise<void> {
    const pending = [...new Set(sources.map((source) => projectRelativePath(source) as string))]
      .filter((source) => !this.results.has(source))
      .sort((left, right) => left.localeCompare(right));
    if (pending.length === 0) return;
    const projectRoot = await assertPhysicalDirectory(this.projectRoot, "source fingerprint project");
    const records: Array<{ source: string; path: string; relativeToGit: string | null }> = [];
    const gitRoot = await this.resolveGitRoot(projectRoot);
    for (const source of pending) {
      const path = await resolveWithinPhysicalRoot(projectRoot, source, "source fingerprint");
      try {
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error("source is a link or Junction");
        if (info.isDirectory()) {
          this.results.set(source, { source, status: "current", fingerprint: await fingerprintDirectory(path) });
          continue;
        }
        if (!info.isFile()) {
          this.results.set(source, { source, status: "invalid", fingerprint: null });
          continue;
        }
        const relativeToGit = gitRoot && isWithin(path, gitRoot)
          ? relative(gitRoot, path).replace(/\\/g, "/")
          : null;
        records.push({ source, path, relativeToGit });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          this.results.set(source, { source, status: "missing", fingerprint: null });
        } else {
          this.results.set(source, { source, status: "invalid", fingerprint: null });
        }
      }
    }
    if (gitRoot) await this.primeGitRecords(gitRoot, records);
    for (const record of records) {
      if (this.results.has(record.source)) continue;
      this.results.set(record.source, {
        source: record.source,
        status: "current",
        fingerprint: await fingerprintContent(record.source, record.path),
      });
    }
  }

  async result(source: string): Promise<SourceFingerprintResult> {
    const normalized = projectRelativePath(source) as string;
    await this.prime([normalized]);
    return this.results.get(normalized) as SourceFingerprintResult;
  }

  async fingerprints(sources: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
    const normalized = [...new Set(sources.map((source) => projectRelativePath(source) as string))];
    await this.prime(normalized);
    return new Map(normalized.map((source) => [source, this.results.get(source)?.fingerprint ?? null]));
  }

  async digest(sources?: readonly string[]): Promise<string> {
    const selected = sources
      ? [...new Set(sources.map((source) => projectRelativePath(source) as string))].sort()
      : [...this.results.keys()].sort();
    await this.prime(selected);
    const payload = selected.map((source) => {
      const result = this.results.get(source) as SourceFingerprintResult;
      return [source, result.status, result.fingerprint] as const;
    });
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  private async resolveGitRoot(projectRoot: string): Promise<string | null> {
    if (this.gitRoot !== undefined) return this.gitRoot;
    const result = await this.git(projectRoot, ["rev-parse", "--show-toplevel"]);
    if (result.exitCode !== 0) {
      this.gitRoot = null;
      return null;
    }
    const candidate = resolve(result.stdout.toString("utf8").trim());
    this.gitRoot = isWithin(projectRoot, candidate) ? candidate : null;
    return this.gitRoot;
  }

  private async primeGitRecords(
    gitRoot: string,
    records: Array<{ source: string; path: string; relativeToGit: string | null }>,
  ): Promise<void> {
    const gitRecords = records.filter((record): record is typeof record & { relativeToGit: string } => Boolean(record.relativeToGit));
    const paths = gitRecords.map((record) => record.relativeToGit);
    const indexBlobs = new Map<string, string>();
    const dirty = new Set<string>();
    let batchHealthy = true;
    for (const chunk of chunks(paths, GIT_BATCH_SIZE)) {
      const [listed, changed] = await Promise.all([
        this.git(gitRoot, ["ls-files", "--stage", "-z", "--", ...chunk]),
        this.git(gitRoot, ["diff-files", "--name-only", "-z", "--", ...chunk]),
      ]);
      if (listed.exitCode !== 0 || changed.exitCode !== 0) {
        batchHealthy = false;
        break;
      }
      for (const entry of listed.stdout.toString("utf8").split("\0")) {
        if (!entry || !entry.includes("\t")) continue;
        const [metadata, path] = entry.split("\t", 2);
        const fields = metadata.split(" ");
        if (fields.length === 3 && fields[2] === "0" && /^[a-f0-9]{40,64}$/.test(fields[1])) {
          indexBlobs.set(path, fields[1]);
        }
      }
      for (const path of changed.stdout.toString("utf8").split("\0")) {
        if (path) dirty.add(path);
      }
    }
    if (!batchHealthy) return;
    for (const record of gitRecords) {
      const blob = indexBlobs.get(record.relativeToGit);
      if (!blob || dirty.has(record.relativeToGit)) continue;
      const payload = Buffer.from(`${record.relativeToGit}\0git:${blob}`, "utf8");
      this.results.set(record.source, {
        source: record.source,
        status: "current",
        fingerprint: createHash("sha256").update(payload).digest("hex"),
      });
    }
  }

  private async git(cwd: string, args: readonly string[]): Promise<SourceFingerprintCommandResult> {
    this.calls += 1;
    return this.commandRunner(cwd, args);
  }
}

export function createSnapshotFingerprinter(snapshot: SourceFingerprintSnapshot) {
  return async (_projectRoot: string, sources: readonly string[]): Promise<ReadonlyMap<string, string | null>> =>
    snapshot.fingerprints(sources);
}

async function runGit(cwd: string, args: readonly string[]): Promise<SourceFingerprintCommandResult> {
  try {
    const result = await execFileAsync("git", [...args], {
      cwd,
      encoding: "buffer",
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: number | string };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? Buffer.alloc(0),
      stderr: failure.stderr ?? Buffer.alloc(0),
    };
  }
}

async function fingerprintContent(source: string, path: string): Promise<string> {
  let content = await readFile(path);
  if (!content.subarray(0, 8192).includes(0)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
      content = Buffer.from(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
    } catch {
      // Binary content keeps byte identity.
    }
  }
  return createHash("sha256").update(source).update("\0").update(content).digest("hex");
}

async function fingerprintDirectory(root: string): Promise<string> {
  const files: string[] = [];
  await collectPhysicalFiles(root, root, files);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const source = relative(root, file).replace(/\\/g, "/");
    hash.update(source).update("\0").update(await readFile(file)).update("\0");
  }
  return hash.digest("hex");
}

async function collectPhysicalFiles(root: string, current: string, files: string[]): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if ([".git", "node_modules", "__pycache__"].includes(entry.name) || entry.name.endsWith(".pyc")) continue;
    const path = join(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Source fingerprint traverses a link or Junction: ${relative(root, path)}`);
    if (info.isDirectory()) await collectPhysicalFiles(root, path, files);
    else if (info.isFile()) files.push(path);
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function isWithin(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !/^[A-Za-z]:/.test(rel));
}
