export interface ProjectWriteLease {
  version: "1.0";
  holderId: string;
  fencingToken: number;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface ProjectWriteLeaseClaim {
  holderId: string;
  ttlMs: number;
}

export interface ProjectWriteLeaseIdentity {
  holderId: string;
  fencingToken: number;
}
