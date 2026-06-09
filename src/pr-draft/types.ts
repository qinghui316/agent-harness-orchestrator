export type RemoteProviderStatus = "ready" | "no-remote" | "no-gh" | "no-auth" | "not-git" | "unsupported";
export type PrDraftStatus = "prepared" | "created";

export interface RemoteProviderCapability {
  provider: "github-cli";
  status: RemoteProviderStatus;
  ready: boolean;
  remoteName?: string;
  remoteUrl?: string;
  currentBranch?: string | null;
  reason?: string;
  setupHint: string;
}

export interface PrDraftPackage {
  version: "1.0";
  id: string;
  landingPackageId: string;
  projectId: string | null;
  provider: "github-cli";
  status: PrDraftStatus;
  title: string;
  bodyArtifact: string;
  packageArtifact: string;
  remoteName?: string;
  remoteUrl?: string;
  baseBranch?: string | null;
  branchName: string;
  prUrl?: string;
  landingEvidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
}
