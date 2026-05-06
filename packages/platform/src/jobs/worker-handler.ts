/**
 * worker-handler.ts
 *
 * PC-02 / T-2: Worker job handler wrapper that enforces tenant context before
 * any DB read. Throws TenantContextMissing when tenantIds is empty or undefined.
 *
 * Usage:
 *   getBoss().work('my-job', withTenantJobHandler(async (payload, tenantIds) => {
 *     // tenantIds is guaranteed non-empty here
 *   }));
 */
import type { TenantId } from "@budget/shared-kernel";

/** Thrown when a pg-boss job handler is invoked without valid tenant context. */
export class TenantContextMissing extends Error {
  constructor(jobName?: string) {
    super(
      `TenantContextMissing: job${jobName ? ` '${jobName}'` : ""} received empty or missing tenantIds — refusing to execute any DB read (T-2)`,
    );
    this.name = "TenantContextMissing";
  }
}

export interface TenantJobPayload {
  tenantIds: TenantId[] | undefined;
  [key: string]: unknown;
}

export type TenantJobHandler<P extends TenantJobPayload> = (
  payload: P,
  tenantIds: TenantId[],
) => Promise<void>;

/**
 * Wraps a pg-boss job handler to enforce tenant context.
 * Throws TenantContextMissing BEFORE any DB read when tenantIds is absent or empty.
 *
 * @param handler - The job implementation receiving (payload, tenantIds)
 * @param jobName - Optional job name for error context
 */
export function withTenantJobHandler<P extends TenantJobPayload>(
  handler: TenantJobHandler<P>,
  jobName?: string,
): (payload: P) => Promise<void> {
  return async (payload: P) => {
    const { tenantIds } = payload;
    if (!tenantIds || tenantIds.length === 0) {
      throw new TenantContextMissing(jobName);
    }
    await handler(payload, tenantIds);
  };
}
