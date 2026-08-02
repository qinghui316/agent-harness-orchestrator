#!/usr/bin/env node
// ECL-HARNESS-CONNECTOR
// Attach or detach this worktree from its project-level shared Harness Skill without requiring Python.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const skillName = "agent-harness-orchestrator-a6ad344cbe4e-harness";
const projectId = "agent-harness-orchestrator-a6ad344cbe4e";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function readItem(itemPath) {
  try {
    return fs.lstatSync(itemPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function normalizePath(itemPath) {
  const normalized = path.resolve(itemPath).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameTarget(link, target) {
  try {
    return normalizePath(fs.realpathSync.native(link)) === normalizePath(fs.realpathSync.native(target));
  } catch {
    return false;
  }
}

function rejectLinkedAncestors(root, itemPath) {
  const relative = path.relative(path.resolve(root), path.dirname(path.resolve(itemPath)));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Skill path escapes this worktree: ${itemPath}`);
  }
  let current = path.resolve(root);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const item = readItem(current);
    if (item?.isSymbolicLink()) {
      throw new Error(`Skill path must not traverse a link or junction: ${current}`);
    }
    if (item && !item.isDirectory()) {
      throw new Error(`Skill path parent must be a directory: ${current}`);
    }
  }
}

function addSkillLink(root, link, target) {
  if (normalizePath(link) === normalizePath(target)) return "physical";
  rejectLinkedAncestors(root, link);
  const item = readItem(link);
  if (item) {
    if (item.isSymbolicLink() && sameTarget(link, target)) return "existing";
    throw new Error(`Skill path collision: ${link}`);
  }
  fs.mkdirSync(path.dirname(link), { recursive: true });
  const type = process.platform === "win32" ? "junction" : "dir";
  const value = process.platform === "win32" ? target : path.relative(path.dirname(link), target);
  fs.symlinkSync(value, link, type);
  return "attached";
}

function removeSkillLink(link) {
  fs.unlinkSync(link);
}

function resolveProject() {
  const current = process.cwd();
  const root = path.resolve(git(current, "rev-parse", "--show-toplevel"));
  const commonRaw = git(root, "rev-parse", "--git-common-dir");
  const common = path.isAbsolute(commonRaw) ? path.resolve(commonRaw) : path.resolve(root, commonRaw);
  const worktreeLines = git(root, "worktree", "list", "--porcelain").split(/\r?\n/);
  const firstWorktree = worktreeLines.find((line) => line.startsWith("worktree "));
  const primary = path.basename(common) === ".git"
    ? path.dirname(common)
    : path.resolve(firstWorktree?.slice("worktree ".length).trim() ?? "");
  if (!primary) throw new Error("could not resolve the primary worktree");
  return { root, primary };
}

function validateCanonical(primary) {
  const canonical = path.join(primary, ".agents", "skills", skillName);
  rejectLinkedAncestors(primary, canonical);
  const item = readItem(canonical);
  if (!item || (!item.isDirectory() && !item.isSymbolicLink())) {
    throw new Error(`canonical project Harness is missing: ${canonical}`);
  }
  if (item.isSymbolicLink()) {
    throw new Error(`canonical project Harness must be physical: ${canonical}`);
  }
  if (!fs.statSync(path.join(canonical, "SKILL.md"), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`canonical project Harness is missing: ${canonical}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(canonical, "state", "manifest.json"), "utf8"));
  if (manifest.project_id !== projectId || manifest.skill_name !== skillName) {
    throw new Error("canonical project Harness manifest does not match this Git project");
  }
  return canonical;
}

function attach(root, canonical, links) {
  const result = {};
  const created = [];
  try {
    for (const [name, link] of Object.entries(links)) {
      const status = addSkillLink(root, link, canonical);
      result[name] = { path: link, status };
      if (status === "attached") created.push(link);
    }
  } catch (error) {
    for (const link of created.reverse()) {
      try { removeSkillLink(link); } catch { /* Preserve the original connector error. */ }
    }
    throw error;
  }
  return result;
}

function detach(root, primary, canonical, links) {
  if (normalizePath(root) === normalizePath(primary)) {
    throw new Error("the primary worktree hosts the physical project Harness and cannot be detached");
  }
  const result = {};
  for (const [name, link] of Object.entries(links)) {
    rejectLinkedAncestors(root, link);
    const item = readItem(link);
    if (!item) {
      result[name] = { path: link, status: "missing" };
    } else if (!item.isSymbolicLink()) {
      throw new Error(`refusing to detach an unmanaged physical Skill path: ${link}`);
    } else if (!sameTarget(link, canonical)) {
      throw new Error(`refusing to detach a Skill link with the wrong target: ${link}`);
    } else {
      result[name] = { path: link, status: "detached" };
    }
  }

  const removed = [];
  try {
    for (const [name, link] of Object.entries(links)) {
      if (result[name].status !== "detached") continue;
      removeSkillLink(link);
      removed.push(link);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const link of removed.reverse()) {
      try { addSkillLink(root, link, canonical); } catch (rollbackError) {
        rollbackErrors.push(`${link}: ${rollbackError.message}`);
      }
    }
    const detail = rollbackErrors.length > 0 ? `; rollback failed for ${rollbackErrors.join(", ")}` : "";
    throw new Error(`could not detach all shared Harness links: ${error.message}${detail}`);
  }
  return result;
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--detach") || args.filter((arg) => arg === "--detach").length > 1) {
  throw new Error("usage: harness-skill-link.mjs [--detach]");
}
const shouldDetach = args.includes("--detach");
const { root, primary } = resolveProject();
const canonical = validateCanonical(primary);
const links = {
  codex: path.join(root, ".agents", "skills", skillName),
  claude: path.join(root, ".claude", "skills", skillName),
};
const result = shouldDetach
  ? detach(root, primary, canonical, links)
  : attach(root, canonical, links);
process.stdout.write(`${JSON.stringify({
  ok: true,
  action: shouldDetach ? "detached" : "attached",
  skill: canonical,
  links: result,
}, null, 2)}\n`);
