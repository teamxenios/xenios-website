// In-memory AssistedOrderQuoteRepository, same role as the parent lane's
// memory-repository.ts: service tests and a future production-isolated demo.
// Never a production fallback — the composition root must refuse instead.

import type {
  AssistedOrderQuoteRecord,
  AssistedOrderQuoteRepository,
} from "./ports";

export class InMemoryAssistedOrderQuoteRepository
  implements AssistedOrderQuoteRepository
{
  private readonly records = new Map<string, AssistedOrderQuoteRecord>();

  public async create(record: AssistedOrderQuoteRecord): Promise<void> {
    if (this.records.has(record.quoteId)) {
      throw new Error(`Duplicate quote id: ${record.quoteId}`);
    }
    this.records.set(record.quoteId, record);
  }

  public async byId(quoteId: string): Promise<AssistedOrderQuoteRecord | null> {
    return this.records.get(quoteId) ?? null;
  }

  public async byRequest(
    requestId: string,
  ): Promise<readonly AssistedOrderQuoteRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => record.requestId === requestId)
      .sort((left, right) => left.version - right.version);
  }

  public async update(record: AssistedOrderQuoteRecord): Promise<void> {
    const existing = this.records.get(record.quoteId);
    if (!existing) {
      throw new Error(`Unknown quote id: ${record.quoteId}`);
    }
    if (existing.version !== record.version) {
      throw new Error(`Lost update on quote ${record.quoteId}`);
    }
    this.records.set(record.quoteId, record);
  }
}
