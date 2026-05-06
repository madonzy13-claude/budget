/**
 * Test 2 (T-2): pg-boss handler wrapper rejects empty / undefined tenantIds.
 *
 * The wrapper must throw TenantContextMissing BEFORE any DB read is issued.
 * This test uses bun:test mock to verify no pg.Client.query is called on
 * invalid payloads.
 */
import { describe, it, expect, mock } from "bun:test";
import {
  withTenantJobHandler,
  TenantContextMissing,
  type TenantJobPayload,
} from "@budget/platform";
import { TenantId } from "@budget/shared-kernel";

const tenantA = TenantId("00000000-0000-0000-0000-000000000001");

describe("Test 2: worker handler wrapper rejects missing/empty tenantIds", () => {
  it("throws TenantContextMissing when tenantIds is undefined", async () => {
    const dbQueryMock = mock(async () => {});
    const handler = withTenantJobHandler(
      async (_payload: TenantJobPayload, _tenantIds) => {
        // If we reach here, a DB read was attempted — should NOT happen
        await dbQueryMock();
      },
      "test-job",
    );

    const payload: TenantJobPayload = { tenantIds: undefined };
    let thrown: unknown;
    try {
      await handler(payload);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(TenantContextMissing);
    expect((thrown as TenantContextMissing).name).toBe("TenantContextMissing");
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("throws TenantContextMissing when tenantIds is an empty array", async () => {
    const dbQueryMock = mock(async () => {});
    const handler = withTenantJobHandler(
      async (_payload: TenantJobPayload, _tenantIds) => {
        await dbQueryMock();
      },
      "test-job",
    );

    const payload: TenantJobPayload = { tenantIds: [] };
    let thrown: unknown;
    try {
      await handler(payload);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(TenantContextMissing);
    expect((thrown as TenantContextMissing).name).toBe("TenantContextMissing");
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("runs handler without error when tenantIds has ≥1 valid id", async () => {
    const executedWith: TenantId[] = [];
    const handler = withTenantJobHandler(
      async (_payload: TenantJobPayload, tenantIds) => {
        executedWith.push(...tenantIds);
      },
      "test-job",
    );

    const payload: TenantJobPayload = { tenantIds: [tenantA] };
    await handler(payload);

    expect(executedWith).toEqual([tenantA]);
  });

  it("error message includes job name", async () => {
    const handler = withTenantJobHandler(
      async () => {},
      "budget.expense-notify",
    );

    let errorMsg = "";
    try {
      await handler({ tenantIds: undefined });
    } catch (e) {
      errorMsg = (e as Error).message;
    }

    expect(errorMsg).toContain("budget.expense-notify");
    expect(errorMsg).toContain("TenantContextMissing");
  });
});
