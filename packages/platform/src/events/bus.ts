export type DispatchedEvent = {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
};
export type EventHandler = (evt: DispatchedEvent) => Promise<void>;

const handlers = new Map<string, EventHandler[]>();

export const eventBus = {
  subscribe(eventType: string, handler: EventHandler) {
    const list = handlers.get(eventType) ?? [];
    list.push(handler);
    handlers.set(eventType, list);
  },
  /**
   * PC-08: Handlers receive events scoped to a single tenant. The outbox dispatcher
   * sets app.tenant_ids = [evt.tenantId] (and a system app.current_user_id) BEFORE calling
   * publish, so any in-process handler that performs DB I/O during this call runs under
   * that tenant's RLS context. Handlers MUST NOT escape this scope (e.g. by opening a
   * fresh withInfraTx) — Plan 10 leak-CI test #5 asserts this invariant.
   */
  async publish(evt: DispatchedEvent) {
    const list = handlers.get(evt.eventType) ?? [];
    for (const h of list) {
      try {
        await h(evt);
      } catch (e) {
        console.error(`[event-bus] handler failed for ${evt.eventType}`, e);
      }
    }
  },
};
