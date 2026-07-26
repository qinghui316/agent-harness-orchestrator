export type OfficeAssetPriority = "bootstrap" | "semantic" | "ambient";
export type OfficeAssetKey = string;

export type OfficeAtlasHandle<T = unknown> = {
  key: OfficeAssetKey;
  asset: T;
  release(): void;
};

export type OfficeAssetImporter<T = unknown> = (key: OfficeAssetKey, signal: AbortSignal) => Promise<T>;

type AssetRecord<T> = { asset: T; owners: Map<string, number>; lastUsed: number; priority: OfficeAssetPriority };

export class OfficeAssetLoader<T = unknown> {
  private readonly inflightLoads = new Map<OfficeAssetKey, Promise<T>>();
  private readonly resolvedAssets = new Map<OfficeAssetKey, AssetRecord<T>>();
  private generationController = new AbortController();

  constructor(
    private readonly importer: OfficeAssetImporter<T>,
    private readonly ambientLimit = 12,
    private readonly disposeAsset: (asset: T) => void = () => undefined,
  ) {}

  preload(keys: readonly OfficeAssetKey[], priority: OfficeAssetPriority): Promise<void> {
    return Promise.all(keys.map((key) => this.load(key, priority))).then(() => undefined);
  }

  async acquire(key: OfficeAssetKey, owner: string, priority: OfficeAssetPriority = "semantic"): Promise<OfficeAtlasHandle<T>> {
    const asset = await this.load(key, priority);
    const record = this.resolvedAssets.get(key)!;
    record.owners.set(owner, (record.owners.get(owner) ?? 0) + 1);
    record.lastUsed = Date.now();
    return { key, asset, release: () => this.release(key, owner) };
  }

  release(key: OfficeAssetKey, owner: string): void {
    const record = this.resolvedAssets.get(key);
    if (!record) return;
    const count = record.owners.get(owner) ?? 0;
    if (count <= 1) record.owners.delete(owner);
    else record.owners.set(owner, count - 1);
    record.lastUsed = Date.now();
    this.evictAmbient();
  }

  cancel(): void {
    this.generationController.abort();
    this.generationController = new AbortController();
    this.inflightLoads.clear();
  }

  dispose(): void {
    this.cancel();
    for (const record of this.resolvedAssets.values()) this.disposeAsset(record.asset);
    this.resolvedAssets.clear();
  }

  stats(): { inflight: number; resolved: number; referenced: number } {
    return {
      inflight: this.inflightLoads.size,
      resolved: this.resolvedAssets.size,
      referenced: [...this.resolvedAssets.values()].filter((record) => record.owners.size > 0).length,
    };
  }

  private load(key: OfficeAssetKey, priority: OfficeAssetPriority): Promise<T> {
    const resolved = this.resolvedAssets.get(key);
    if (resolved) {
      resolved.lastUsed = Date.now();
      return Promise.resolve(resolved.asset);
    }
    const inflight = this.inflightLoads.get(key);
    if (inflight) return inflight;
    const signal = this.generationController.signal;
    const request = this.importer(key, signal).then((asset) => {
      if (signal.aborted) throw new DOMException("Office asset load cancelled", "AbortError");
      this.resolvedAssets.set(key, { asset, owners: new Map(), lastUsed: Date.now(), priority });
      return asset;
    }).finally(() => {
      if (this.inflightLoads.get(key) === request) this.inflightLoads.delete(key);
    });
    this.inflightLoads.set(key, request);
    return request;
  }

  private evictAmbient(): void {
    const candidates = [...this.resolvedAssets.entries()]
      .filter(([, record]) => record.priority === "ambient" && record.owners.size === 0)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    while (candidates.length > this.ambientLimit) {
      const candidate = candidates.shift();
      if (!candidate) continue;
      this.resolvedAssets.delete(candidate[0]);
      this.disposeAsset(candidate[1].asset);
    }
  }
}
