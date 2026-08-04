import { posix, win32 } from "node:path";
import { z } from "zod";

declare const skillRelativePathBrand: unique symbol;
declare const sidecarRelativePathBrand: unique symbol;
declare const projectRelativePathBrand: unique symbol;

export type SkillRelativePath = string & { readonly [skillRelativePathBrand]: true };
export type SidecarRelativePath = string & { readonly [sidecarRelativePathBrand]: true };
export type ProjectRelativePath = string & { readonly [projectRelativePathBrand]: true };

export type OwnedArtifactRef =
  | { owner: "project-skill"; path: SkillRelativePath }
  | { owner: "runtime-sidecar"; path: SidecarRelativePath }
  | { owner: "project-source"; path: ProjectRelativePath };

export interface ProjectHarnessHandle {
  projectId: string;
  skillName: string;
  skillRevision: number;
  skillRoot: string;
  contentFingerprint: string;
}

export interface ProviderSkillBinding {
  providerId: string;
  discoveryPath: string;
  status: "ready" | "missing" | "collision" | "unavailable";
  sameTarget: boolean;
  required: boolean;
}

export type ProjectHarnessDiscoveryRoute = {
  providerId: string;
  required: boolean;
  enabled?: boolean;
} & (
  | { relativeRoot: ProjectRelativePath; skillRoot?: never }
  | { relativeRoot?: never; skillRoot: string }
);

export interface ProjectHarnessDiscoveryPolicy {
  routes: readonly ProjectHarnessDiscoveryRoute[];
}

export interface ProjectHarnessSkillBinding {
  projectId: string;
  skillName: string;
  sourcePath: string;
  contentFingerprint: string;
  providers: ProviderSkillBinding[];
}

export interface ProviderSkillInput {
  id: string;
  path: string;
  contentHash: string;
  source: "project-harness" | "aho-system" | "provider-native";
  required: boolean;
}

export function skillRelativePath(value: string): SkillRelativePath {
  return normalizeOwnedRelativePath(value, "project Skill") as SkillRelativePath;
}

export function sidecarRelativePath(value: string): SidecarRelativePath {
  return normalizeOwnedRelativePath(value, "runtime sidecar") as SidecarRelativePath;
}

export function projectRelativePath(value: string): ProjectRelativePath {
  return normalizeOwnedRelativePath(value, "project source") as ProjectRelativePath;
}

export function projectSkillArtifact(path: string): OwnedArtifactRef {
  return { owner: "project-skill", path: skillRelativePath(path) };
}

export function runtimeSidecarArtifact(path: string): OwnedArtifactRef {
  return { owner: "runtime-sidecar", path: sidecarRelativePath(path) };
}

export function projectSourceArtifact(path: string): OwnedArtifactRef {
  return { owner: "project-source", path: projectRelativePath(path) };
}

export function parseOwnedArtifactRef(input: unknown): OwnedArtifactRef {
  const value = z.object({
    owner: z.enum(["project-skill", "runtime-sidecar", "project-source"]),
    path: z.string(),
  }).strict().parse(input);
  if (value.owner === "project-skill") return projectSkillArtifact(value.path);
  if (value.owner === "runtime-sidecar") return runtimeSidecarArtifact(value.path);
  return projectSourceArtifact(value.path);
}

function normalizeOwnedRelativePath(value: string, owner: string): string {
  if (value.includes("\0")) throw new Error(`${owner} path contains a null byte.`);
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized === ".") throw new Error(`${owner} path must identify an artifact.`);
  if (posix.isAbsolute(normalized) || win32.isAbsolute(value) || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${owner} path must be relative: ${value}`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${owner} path contains an unsafe segment: ${value}`);
  }
  return segments.join("/");
}
