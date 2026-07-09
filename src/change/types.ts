import type { AcMap, ChangeIndex, ChangeMetadata } from "../types/index.js";

export interface ChangeCreateResult {
  change: ChangeMetadata;
  path: string;
  acMap: AcMap;
  index: ChangeIndex;
}

export interface ChangeCloseResult {
  archivePath: string;
  change: ChangeMetadata;
  index: ChangeIndex;
}

export interface ChangeAbandonResult {
  archivePath: string;
  change: ChangeMetadata;
  index: ChangeIndex;
  reason?: string;
}

export type ChangeDirectoryState = "active" | "parking" | "archive";
