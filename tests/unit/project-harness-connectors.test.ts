import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillName = "agent-harness-orchestrator-a6ad344cbe4e-harness";

interface ConnectorHost {
  name: string;
  command: string;
  args: (detach: boolean) => string[];
}

const hosts: ConnectorHost[] = [
  {
    name: "PowerShell",
    command: "powershell",
    args: (detach) => [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(repositoryRoot, "scripts", "harness-skill-link.ps1"),
      ...(detach ? ["-Detach"] : []),
    ],
  },
  {
    name: "Node.js",
    command: process.execPath,
    args: (detach) => [
      join(repositoryRoot, "scripts", "harness-skill-link.mjs"),
      ...(detach ? ["--detach"] : []),
    ],
  },
  {
    name: "Python",
    command: "python",
    args: (detach) => [
      join(repositoryRoot, "scripts", "harness-skill-link.py"),
      ...(detach ? ["--detach"] : []),
    ],
  },
];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness worktree connectors", () => {
  it.each(hosts)("$name attaches and detaches both provider links symmetrically", async (host) => {
    const fixture = await createGitFixture();
    const attached = await runConnector(host, fixture.secondary, false);
    expect(attached.action).toBe("attached");
    expect(attached.links.codex.status).toMatch(/attached|existing/);
    expect(attached.links.claude.status).toMatch(/attached|existing/);
    await expectSameTarget(fixture.codexLink, fixture.canonical);
    await expectSameTarget(fixture.claudeLink, fixture.canonical);

    const detached = await runConnector(host, fixture.secondary, true);
    expect(detached.action).toBe("detached");
    expect(detached.links.codex.status).toBe("detached");
    expect(detached.links.claude.status).toBe("detached");
    await expect(readFile(fixture.codexLink, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const repeated = await runConnector(host, fixture.secondary, true);
    expect(repeated.links.codex.status).toBe("missing");
    expect(repeated.links.claude.status).toBe("missing");
  });

  it("rolls back a partial Node.js attach when the second provider path collides", async () => {
    const fixture = await createGitFixture();
    await mkdir(fixture.claudeLink, { recursive: true });
    await writeFile(join(fixture.claudeLink, "owned.txt"), "unmanaged\n", "utf8");

    await expect(runConnector(hosts[1], fixture.secondary, false)).rejects.toThrow(/collision/);
    await expect(realpath(fixture.codexLink)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(fixture.claudeLink, "owned.txt"), "utf8")).toBe("unmanaged\n");
  });

  it("prevalidates every detach target and leaves proven links intact on mismatch", async () => {
    const fixture = await createGitFixture();
    await runConnector(hosts[1], fixture.secondary, false);
    await rm(fixture.claudeLink, { recursive: false, force: false });
    const wrongTarget = join(fixture.root, "wrong-target");
    await mkdir(wrongTarget);
    await createDirectoryLink(wrongTarget, fixture.claudeLink);

    await expect(runConnector(hosts[1], fixture.secondary, true)).rejects.toThrow(/wrong target/);
    await expectSameTarget(fixture.codexLink, fixture.canonical);
    await expectSameTarget(fixture.claudeLink, wrongTarget);
  });

  it("rejects detach from the primary worktree and validates the canonical manifest first", async () => {
    const fixture = await createGitFixture();
    await expect(runConnector(hosts[1], fixture.primary, true)).rejects.toThrow(/cannot be detached/);

    const manifestPath = join(fixture.canonical, "state", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { project_id: string };
    manifest.project_id = "wrong-project";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(runConnector(hosts[1], fixture.secondary, false)).rejects.toThrow(/manifest does not match/);
  });
});

async function runConnector(
  host: ConnectorHost,
  cwd: string,
  detach: boolean,
): Promise<{
  action: string;
  links: Record<string, { path: string; status: string }>;
}> {
  try {
    const { stdout } = await execFileAsync(host.command, host.args(detach), { cwd, windowsHide: true });
    return JSON.parse(stdout) as {
      action: string;
      links: Record<string, { path: string; status: string }>;
    };
  } catch (error) {
    const failure = error as Error & { stderr?: string; stdout?: string };
    throw new Error(`${failure.message}\n${failure.stderr ?? ""}\n${failure.stdout ?? ""}`);
  }
}

async function createGitFixture(): Promise<{
  root: string;
  primary: string;
  secondary: string;
  canonical: string;
  codexLink: string;
  claudeLink: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-harness-connector-"));
  cleanup.push(root);
  const primary = join(root, "primary");
  const secondary = join(root, "secondary");
  await mkdir(primary);
  await runGit(primary, "init");
  await writeFile(join(primary, "tracked.txt"), "fixture\n", "utf8");
  await runGit(primary, "add", "tracked.txt");
  await runGit(primary, "-c", "user.name=AHO Test", "-c", "user.email=aho@example.invalid", "commit", "-m", "fixture");
  await runGit(primary, "worktree", "add", "-b", "connector-secondary", secondary);

  const canonical = join(primary, ".agents", "skills", skillName);
  await mkdir(join(canonical, "state"), { recursive: true });
  await writeFile(join(canonical, "SKILL.md"), `---\nname: ${skillName}\n---\n`, "utf8");
  await writeFile(join(canonical, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: "agent-harness-orchestrator-a6ad344cbe4e",
    project_name: "agent-harness-orchestrator",
    skill_name: skillName,
    skill_revision: 27,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");

  return {
    root,
    primary,
    secondary,
    canonical,
    codexLink: join(secondary, ".agents", "skills", skillName),
    claudeLink: join(secondary, ".claude", "skills", skillName),
  };
}

async function runGit(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args], { windowsHide: true });
}

async function expectSameTarget(link: string, target: string): Promise<void> {
  expect(normalize(await realpath(link))).toBe(normalize(await realpath(target)));
}

function normalize(path: string): string {
  return resolve(path).replace(/\\/g, "/").toLowerCase();
}

async function createDirectoryLink(target: string, link: string): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "mklink", "/J", link, target], { windowsHide: true });
  } else {
    const { symlink } = await import("node:fs/promises");
    await symlink(target, link, "dir");
  }
}
