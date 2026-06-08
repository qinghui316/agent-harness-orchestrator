export interface WorkbenchArtifactPreview {
  key: string;
  path: string;
  kind: string;
  exists: boolean;
  sizeBytes?: number;
  preview?: string;
  tail?: string;
  truncated?: boolean;
  diagnostic?: string;
}
