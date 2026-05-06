import type { TenantId } from '../ids';

export interface OutboxEvent {
  tenantId: TenantId;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

export interface OutboxWriter {
  write(tx: unknown, evt: OutboxEvent): Promise<void>;
}

export class InMemoryOutbox implements OutboxWriter {
  public events: OutboxEvent[] = [];

  async write(_tx: unknown, evt: OutboxEvent): Promise<void> {
    this.events.push(evt);
  }
}
