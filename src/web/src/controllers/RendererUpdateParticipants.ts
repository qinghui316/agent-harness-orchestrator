/** Collects narrow save/validation callbacks, never a second draft store. */
export class RendererUpdateParticipants {
  private readonly participants = new Set<(updateId: string) => Promise<() => boolean>>();
  private revision = 0;
  private prepared: { updateId: string; revision: number; validators: Array<() => boolean> } | null = null;

  register(prepare: (updateId: string) => Promise<() => boolean>): () => void {
    this.participants.add(prepare);
    this.revision += 1;
    return () => { this.participants.delete(prepare); this.revision += 1; };
  }

  async prepare(updateId: string): Promise<void> {
    this.prepared = null;
    const revision = this.revision;
    const validators = await Promise.all([...this.participants].map((prepare) => prepare(updateId)));
    if (revision !== this.revision || !validators.every((validate) => validate())) {
      throw new Error("Draft participants changed while saving.");
    }
    this.prepared = { updateId, revision, validators };
  }

  confirm(updateId: string): boolean {
    return Boolean(this.prepared && this.prepared.updateId === updateId
      && this.prepared.revision === this.revision && this.prepared.validators.every((validate) => validate()));
  }

  cancel(updateId: string): void {
    if (this.prepared?.updateId === updateId) this.prepared = null;
  }
}

export const rendererUpdateParticipants = new RendererUpdateParticipants();
