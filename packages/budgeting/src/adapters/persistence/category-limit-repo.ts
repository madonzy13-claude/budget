/**
 * category-limit-repo.ts — Drizzle adapter for CategoryLimitRepo (SCD-2)
 * PATTERNS.md lines 409-473: SCD-2 close-prev + insert-new pattern.
 * Partial unique index enforced in post-migration.sql prevents duplicate open rows.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { convertCents } from "../../domain/fx-round";
import type {
  ChangeCurrencyResult,
  CategoryLimitRepo,
  CategoryLimitRow,
  SetLimitInput,
  EffectiveLimit,
} from "../../ports/category-limit-repo";

function rowToDto(row: {
  id: string;
  tenant_id: string;
  category_id: string;
  normal_amount: string | bigint;
  normal_currency: string;
  cushion_amount: string | bigint;
  cushion_currency: string;
  needs_amount?: string | bigint | null;
  wants_amount?: string | bigint | null;
  no_limit?: boolean | null;
  effective_from: string | Date;
  effective_to: string | Date | null;
  actor_user_id: string;
  created_at: Date;
}): CategoryLimitRow {
  // effective_from/to returned as Date objects from Postgres — convert to ISO date string
  const toDateStr = (v: string | Date | null) => {
    if (!v) return null;
    if (typeof v === "string") return v.substring(0, 10);
    return v.toISOString().substring(0, 10);
  };
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    normalAmount: String(row.normal_amount),
    normalCurrency: row.normal_currency,
    cushionAmount: String(row.cushion_amount),
    cushionCurrency: row.cushion_currency,
    needsAmount: row.needs_amount == null ? null : String(row.needs_amount),
    wantsAmount: row.wants_amount == null ? null : String(row.wants_amount),
    noLimit: row.no_limit === true,
    effectiveFrom: toDateStr(row.effective_from)!,
    effectiveTo: toDateStr(row.effective_to),
    actorUserId: row.actor_user_id,
    createdAt: new Date(row.created_at),
  };
}

/** 0105: what a currency-converted limit segment was made from. */
type Source = {
  currency: string;
  normal: string;
  cushion: string;
  needs: string | null;
  wants: string | null;
  cushionCents: string | null;
};

export class DrizzleCategoryLimitRepo implements CategoryLimitRepo {
  async changeCategoryCurrency(input: {
    tenantId: string;
    actorUserId: string;
    categoryId: string;
    currency: string;
    now: Date;
  }): Promise<ChangeCurrencyResult> {
    const { tenantId, categoryId, currency: to } = input;
    const r = await withTenantTx(TenantId(tenantId), UserId(input.actorUserId), async (tx) => {
      type Rows<T> = { rows: T[] };
      const q = <T>(query: unknown) => (tx as { execute: (q: unknown) => Promise<Rows<T>> }).execute(query);
      // Same lock setLimit takes: no concurrent limit write sees half a split.
      await q(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '::' || ${categoryId} || '::category_limits'))`);
      const cat = (
        await q<{ currency: string; today: string; month_start: string }>(sql`
          SELECT c.currency::text AS currency,
                 d.today::text AS today,
                 date_trunc('month', d.today)::date::text AS month_start
            FROM budgeting.categories c
            JOIN tenancy.budgets b ON b.id = c.tenant_id
            CROSS JOIN LATERAL (
              SELECT (${input.now.toISOString()}::timestamptz AT TIME ZONE COALESCE(b.timezone, 'UTC'))::date AS today
            ) d
           WHERE c.id = ${categoryId}::uuid AND c.tenant_id = ${tenantId}::uuid
           FOR UPDATE OF c`)
      ).rows[0];
      if (!cat) return { status: "not_found" } as const;
      const from = cat.currency.trim();
      if (from === to) return { status: "same", currency: to } as const;

      // Current + future segments: the one covering this month, and later ones.
      const segs = (
        await q<{
          id: string;
          effective_from: string;
          normal_currency: string;
          normal_amount: string;
          cushion_amount: string;
          needs_amount: string | null;
          wants_amount: string | null;
          cushion_amount_cents: string | null;
          converted_from: Source | null;
        }>(sql`
          SELECT id::text, effective_from::text, normal_currency::text,
                 normal_amount::text, cushion_amount::text, needs_amount::text,
                 wants_amount::text, cushion_amount_cents::text, converted_from
            FROM budgeting.category_limits
           WHERE category_id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid
             AND (effective_to IS NULL OR effective_to >= ${cat.month_start}::date)
           ORDER BY effective_from`)
      ).rows;

      // Today's rate per segment currency (same fallback as fx_convert).
      const rates = new Map<string, string | null>();
      // Each segment converts from its SOURCE: the amounts it was converted from,
      // if it was, else itself. Never a conversion of a conversion (0105).
      const sourceOf = (x: (typeof segs)[number]): Source =>
        x.converted_from ?? {
          currency: x.normal_currency.trim(),
          normal: x.normal_amount,
          cushion: x.cushion_amount,
          needs: x.needs_amount,
          wants: x.wants_amount,
          cushionCents: x.cushion_amount_cents,
        };
      for (const c of new Set([from, ...segs.map((x) => sourceOf(x).currency)])) {
        if (c === to) continue;
        const rr = await q<{ rate: string | null }>(sql`
          SELECT COALESCE(
            (SELECT rate::text FROM budgeting.fx_rates
              WHERE base = ${c}::bpchar AND quote = ${to}::bpchar AND date <= ${cat.today}::date
              ORDER BY date DESC LIMIT 1),
            (SELECT rate::text FROM budgeting.fx_rates
              WHERE base = ${c}::bpchar AND quote = ${to}::bpchar ORDER BY date ASC LIMIT 1)) AS rate`);
        rates.set(c, rr.rows[0]?.rate ?? null);
      }
      if ([...rates.values()].some((v) => v === null)) {
        return { status: "no_rate", fromCurrency: from, toCurrency: to } as const;
      }

      await q(sql`UPDATE budgeting.categories SET currency = ${to} WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`);
      for (const seg of segs) {
        const src = sourceOf(seg);
        const back = src.currency === to;
        const rate = back ? "1" : rates.get(src.currency)!;
        const cv = (v: string | null) => (v === null ? null : convertCents(BigInt(v), rate).toString());
        const keep = back ? null : JSON.stringify(src);
        const amounts = sql`normal_amount = ${cv(src.normal)}::bigint,
                            cushion_amount = ${cv(src.cushion)}::bigint,
                            needs_amount = ${cv(src.needs)}::bigint,
                            wants_amount = ${cv(src.wants)}::bigint,
                            cushion_amount_cents = ${cv(src.cushionCents)}::bigint,
                            normal_currency = ${to}, cushion_currency = ${to},
                            converted_from = ${keep}::jsonb`;
        if (seg.effective_from < cat.month_start) {
          // Started before this month: close it the day before (setLimit's
          // convention) and continue it from the 1st in the new currency.
          await q(sql`
            INSERT INTO budgeting.category_limits
              (tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency,
               needs_amount, wants_amount, cushion_amount_cents, no_limit, effective_from, effective_to, actor_user_id,
               converted_from)
            SELECT tenant_id, category_id, ${cv(src.normal)}::bigint, ${to}, ${cv(src.cushion)}::bigint, ${to},
                   ${cv(src.needs)}::bigint, ${cv(src.wants)}::bigint, ${cv(src.cushionCents)}::bigint,
                   no_limit, ${cat.month_start}::date, effective_to, ${input.actorUserId}::uuid, ${keep}::jsonb
              FROM budgeting.category_limits WHERE id = ${seg.id}::uuid`);
          await q(sql`
            UPDATE budgeting.category_limits
               SET effective_to = ${cat.month_start}::date - INTERVAL '1 day'
             WHERE id = ${seg.id}::uuid`);
        } else {
          await q(sql`UPDATE budgeting.category_limits SET ${amounts} WHERE id = ${seg.id}::uuid`);
        }
      }
      await writeAudit(tx, {
        tenantId: TenantId(tenantId),
        entityType: "category",
        entityId: categoryId,
        action: "update",
        actorUserId: UserId(input.actorUserId),
        before: { currency: from },
        after: { currency: to },
      });
      return { status: "changed", fromCurrency: from, toCurrency: to, limitsConverted: segs.length } as const;
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async setLimit(input: SetLimitInput): Promise<void> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // Pitfall 3: SCD-2 race guard — advisory lock prevents concurrent PATCHes
      // on the same (tenant, category) from producing two overlapping 'open' rows.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId} || '::' || ${input.categoryId} || '::category_limits'))`,
      );

      // 1. Snapshot the previous open row
      const before = await tx.execute<{
        id: string;
        normal_amount: string;
        cushion_amount: string;
        effective_from: string;
      }>(sql`
        SELECT id, normal_amount::text, cushion_amount::text, effective_from::text
        FROM budgeting.category_limits
        WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
      `);

      if (before.rows.length > 0) {
        const prevFrom = before.rows[0].effective_from.substring(0, 10);
        if (prevFrom === input.effectiveFrom) {
          // Same-day edit (Pitfall 5): UPDATE the existing row in place
          await tx.execute(sql`
            UPDATE budgeting.category_limits
            SET normal_amount = ${input.normalAmount}::bigint,
                normal_currency = ${input.normalCurrency},
                cushion_amount = ${input.cushionAmount}::bigint,
                cushion_currency = ${input.cushionCurrency},
                needs_amount = ${input.needsAmount ?? null}::bigint,
                wants_amount = ${input.wantsAmount ?? null}::bigint,
                no_limit = ${input.noLimit ?? false}::boolean,
                converted_from = NULL,
                actor_user_id = ${input.actorUserId}::uuid
            WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
          `);
        } else {
          // 2. Close the previous open row
          await tx.execute(sql`
            UPDATE budgeting.category_limits
            SET effective_to = ${input.effectiveFrom}::date - INTERVAL '1 day'
            WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
          `);

          // 3. Insert new open-ended row
          await tx.execute(sql`
            INSERT INTO budgeting.category_limits
              (tenant_id, category_id, normal_amount, normal_currency,
               cushion_amount, cushion_currency, needs_amount, wants_amount, no_limit,
               effective_from, actor_user_id)
            VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                    ${input.normalAmount}::bigint, ${input.normalCurrency},
                    ${input.cushionAmount}::bigint, ${input.cushionCurrency},
                    ${input.needsAmount ?? null}::bigint, ${input.wantsAmount ?? null}::bigint,
                  ${input.noLimit ?? false}::boolean,
                    ${input.effectiveFrom}::date, ${input.actorUserId}::uuid)
          `);
        }
      } else {
        // No previous row — simple insert
        await tx.execute(sql`
          INSERT INTO budgeting.category_limits
            (tenant_id, category_id, normal_amount, normal_currency,
             cushion_amount, cushion_currency, needs_amount, wants_amount, no_limit,
             effective_from, actor_user_id)
          VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                  ${input.normalAmount}::bigint, ${input.normalCurrency},
                  ${input.cushionAmount}::bigint, ${input.cushionCurrency},
                  ${input.needsAmount ?? null}::bigint, ${input.wantsAmount ?? null}::bigint,
                  ${input.noLimit ?? false}::boolean,
                  ${input.effectiveFrom}::date, ${input.actorUserId}::uuid)
        `);
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category_limit",
        entityId: input.categoryId,
        action: "update",
        actorUserId: uid,
        before: before.rows[0] ?? null,
        after: {
          normalAmount: input.normalAmount,
          normalCurrency: input.normalCurrency,
          cushionAmount: input.cushionAmount,
          cushionCurrency: input.cushionCurrency,
          effectiveFrom: input.effectiveFrom,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category_limit",
        aggregateId: input.categoryId,
        eventType: "budgeting.limit.changed",
        payload: {
          categoryId: input.categoryId,
          normalAmount: input.normalAmount,
          normalCurrency: input.normalCurrency,
          cushionAmount: input.cushionAmount,
          effectiveFrom: input.effectiveFrom,
          actorUserId: input.actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async setLimitForMonth(
    input: import("../../ports/category-limit-repo").SetLimitForMonthInput,
  ): Promise<void> {
    // Current/latest-month edit → carry forward (apply from this month onward).
    if (input.carryForward) {
      return this.setLimit({
        tenantId: input.tenantId,
        categoryId: input.categoryId,
        normalAmount: input.normalAmount,
        normalCurrency: input.normalCurrency,
        cushionAmount: input.cushionAmount,
        cushionCurrency: input.cushionCurrency,
        needsAmount: input.needsAmount,
        wantsAmount: input.wantsAmount,
        noLimit: input.noLimit,
        effectiveFrom: input.monthStart,
        actorUserId: input.actorUserId,
      });
    }

    // Past-month edit → bound the change to JUST this month, splitting the
    // SCD-2 segment that covers it so earlier/later months keep their values.
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);
    const m = input.monthStart;

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId} || '::' || ${input.categoryId} || '::category_limits'))`,
      );

      // The segment covering this month + the boundary decisions (computed in
      // SQL so all date math is native). effective_to is the inclusive last day.
      const sres = await tx.execute<{
        id: string;
        normal_amount: string;
        cushion_amount: string;
        normal_currency: string;
        cushion_currency: string;
        needs_amount: string | null;
        wants_amount: string | null;
        no_limit: boolean;
        eff_to: string | null;
        from_before: boolean;
        is_exact: boolean;
        extends_beyond: boolean;
      }>(sql`
        SELECT id,
               normal_amount::text, cushion_amount::text,
               normal_currency, cushion_currency,
               -- 0061 split: the resume-INSERTs below rewrite the segment that
               -- extends past this month, so they must carry it or a past-month
               -- edit silently NULLs the LATER segment's needs/wants.
               needs_amount::text, wants_amount::text, no_limit,
               effective_to::text AS eff_to,
               (effective_from < ${m}::date) AS from_before,
               (effective_from = ${m}::date
                 AND effective_to = (${m}::date + INTERVAL '1 month' - INTERVAL '1 day')) AS is_exact,
               (effective_to IS NULL
                 OR effective_to > (${m}::date + INTERVAL '1 month' - INTERVAL '1 day')) AS extends_beyond
        FROM budgeting.category_limits
        WHERE category_id = ${input.categoryId}::uuid
          AND effective_from <= ${m}::date
          AND (effective_to IS NULL OR effective_to >= ${m}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      `);
      const S = sres.rows[0];

      const insertMonth = (
        normal: string,
        cushion: string,
        normalCur: string,
        cushionCur: string,
      ) =>
        tx.execute(sql`
          INSERT INTO budgeting.category_limits
            (tenant_id, category_id, normal_amount, normal_currency,
             cushion_amount, cushion_currency, needs_amount, wants_amount, no_limit,
             effective_from, effective_to, actor_user_id)
          VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                  ${normal}::bigint, ${normalCur},
                  ${cushion}::bigint, ${cushionCur},
                  ${input.needsAmount ?? null}::bigint, ${input.wantsAmount ?? null}::bigint,
                  ${input.noLimit ?? false}::boolean,
                  ${m}::date, (${m}::date + INTERVAL '1 month' - INTERVAL '1 day'), ${input.actorUserId}::uuid)
        `);

      if (!S) {
        // No limit this month (a gap) → standalone single-month segment.
        await insertMonth(
          input.normalAmount,
          input.cushionAmount,
          input.normalCurrency,
          input.cushionCurrency,
        );
      } else if (S.is_exact) {
        // Already exactly this month → update in place.
        await tx.execute(sql`
          UPDATE budgeting.category_limits
          SET normal_amount = ${input.normalAmount}::bigint,
              normal_currency = ${input.normalCurrency},
              cushion_amount = ${input.cushionAmount}::bigint,
              cushion_currency = ${input.cushionCurrency},
              needs_amount = ${input.needsAmount ?? null}::bigint,
              wants_amount = ${input.wantsAmount ?? null}::bigint,
              no_limit = ${input.noLimit ?? false}::boolean,
              converted_from = NULL,
              actor_user_id = ${input.actorUserId}::uuid
          WHERE id = ${S.id}::uuid
        `);
      } else if (S.from_before) {
        // S starts before this month: shrink it to end the day before, resume
        // the old value the month after (if it extended beyond), insert the new.
        await tx.execute(sql`
          UPDATE budgeting.category_limits
          SET effective_to = ${m}::date - INTERVAL '1 day'
          WHERE id = ${S.id}::uuid
        `);
        if (S.extends_beyond) {
          if (S.eff_to === null) {
            await tx.execute(sql`
              INSERT INTO budgeting.category_limits
                (tenant_id, category_id, normal_amount, normal_currency,
                 cushion_amount, cushion_currency, needs_amount, wants_amount, no_limit,
                 effective_from, actor_user_id)
              VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                      ${S.normal_amount}::bigint, ${S.normal_currency},
                      ${S.cushion_amount}::bigint, ${S.cushion_currency},
                      ${S.needs_amount}::bigint, ${S.wants_amount}::bigint, ${S.no_limit}::boolean,
                      (${m}::date + INTERVAL '1 month'), ${input.actorUserId}::uuid)
            `);
          } else {
            await tx.execute(sql`
              INSERT INTO budgeting.category_limits
                (tenant_id, category_id, normal_amount, normal_currency,
                 cushion_amount, cushion_currency, needs_amount, wants_amount, no_limit,
                 effective_from, effective_to, actor_user_id)
              VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                      ${S.normal_amount}::bigint, ${S.normal_currency},
                      ${S.cushion_amount}::bigint, ${S.cushion_currency},
                      ${S.needs_amount}::bigint, ${S.wants_amount}::bigint, ${S.no_limit}::boolean,
                      (${m}::date + INTERVAL '1 month'), ${S.eff_to}::date, ${input.actorUserId}::uuid)
            `);
          }
        }
        await insertMonth(
          input.normalAmount,
          input.cushionAmount,
          input.normalCurrency,
          input.cushionCurrency,
        );
      } else {
        // S starts exactly at this month and extends beyond: push S to start the
        // month after (it resumes the old value) and insert the new single month.
        await tx.execute(sql`
          UPDATE budgeting.category_limits
          SET effective_from = (${m}::date + INTERVAL '1 month')
          WHERE id = ${S.id}::uuid
        `);
        await insertMonth(
          input.normalAmount,
          input.cushionAmount,
          input.normalCurrency,
          input.cushionCurrency,
        );
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category_limit",
        entityId: input.categoryId,
        action: "update",
        actorUserId: uid,
        before: S ?? null,
        after: {
          normalAmount: input.normalAmount,
          cushionAmount: input.cushionAmount,
          month: m,
          bounded: true,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async getEffectiveLimit(
    tenantId: string,
    categoryId: string,
    reportDate: string,
  ): Promise<CategoryLimitRow | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        category_id: string;
        normal_amount: string;
        normal_currency: string;
        cushion_amount: string;
        cushion_currency: string;
        effective_from: Date;
        effective_to: Date | null;
        actor_user_id: string;
        created_at: Date;
      }>(sql`
        SELECT id, tenant_id::text, category_id::text,
               normal_amount::text, normal_currency,
               cushion_amount::text, cushion_currency,
               needs_amount::text, wants_amount::text, no_limit,
               effective_from, effective_to,
               actor_user_id::text, created_at
        FROM budgeting.category_limits
        WHERE category_id = ${categoryId}::uuid
          AND effective_from <= ${reportDate}::date
          AND (effective_to IS NULL OR effective_to >= ${reportDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      `);
      return result.rows[0] ?? null;
    });

    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToDto(r.value);
  }

  /**
   * effectiveForMonth for many months, in ONE query and ONE transaction.
   *
   * The per-month version was called in a loop by the reserve replay — 35
   * months on a three-year budget, each its own transaction with two SET LOCAL
   * statements for the RLS GUCs. A single all-budgets request issued 424 of
   * these lookups and ~500 GUC statements, about a second of round-trip; the
   * queries themselves are ~0.1ms each against ~1.9ms of per-call overhead.
   *
   * The month list is passed as an array and joined against, so the SCD-2
   * predicate is evaluated per month by the database instead of per round trip.
   */
  async effectiveForMonths(
    tenantId: string,
    _budgetId: string,
    monthStarts: string[],
  ): Promise<
    Map<
      string,
      Map<
        string,
        EffectiveLimit
      >
    >
  > {
    const out = new Map<
      string,
      Map<
        string,
        EffectiveLimit
      >
    >();
    // Every requested month gets an entry, so a caller cannot tell a month with
    // no limits apart from a month that was never asked for.
    for (const m of monthStarts) out.set(m, new Map());
    if (monthStarts.length === 0) return out;

    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    // ONE bound parameter holding a Postgres array literal, not a JS array:
    // drizzle's sql`` expands an array inline as a record, which Postgres then
    // refuses to cast ("cannot cast type record to date[]").
    const monthsLiteral = `{${monthStarts.join(",")}}`;

    const r = await withTenantTx(tid, uid, async (tx) => {
      return tx.execute<{
        month_start: string;
        category_id: string;
        normal_amount: string;
        cushion_amount: string;
        needs_amount: string | null;
        wants_amount: string | null;
        no_limit: boolean;
        normal_currency: string;
        cushion_currency: string;
        converted_from: EffectiveLimit["convertedFrom"];
      }>(sql`
        SELECT m.month_start::text AS month_start,
               cl.category_id::text, cl.normal_amount::text,
               cl.cushion_amount::text, cl.needs_amount::text,
               cl.wants_amount::text, cl.no_limit,
               cl.normal_currency::text, cl.cushion_currency::text, cl.converted_from
          FROM unnest(${monthsLiteral}::date[]) AS m(month_start)
          JOIN budgeting.category_limits cl
            ON cl.tenant_id = ${tenantId}::uuid
           AND cl.effective_from <= m.month_start
           AND (cl.effective_to IS NULL OR cl.effective_to > m.month_start)
      `);
    });
    if (r.isErr()) throw r.error;

    for (const row of r.value.rows) {
      const month = out.get(row.month_start);
      if (!month) continue;
      month.set(row.category_id, {
        planned: BigInt(row.normal_amount),
        cushion: BigInt(row.cushion_amount),
        needs: row.needs_amount === null ? null : BigInt(row.needs_amount),
        wants: row.wants_amount === null ? null : BigInt(row.wants_amount),
        noLimit: row.no_limit,
        normalCurrency: row.normal_currency,
        cushionCurrency: row.cushion_currency,
        convertedFrom: row.converted_from ?? null,
      });
    }
    return out;
  }

  async effectiveForMonth(
    tenantId: string,
    _budgetId: string,
    monthStart: string,
  ): Promise<
    Map<
      string,
      EffectiveLimit
    >
  > {
    // v1.1 invariant: budget_id === tenant_id; category_limits are tenant-scoped
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        category_id: string;
        normal_amount: string;
        cushion_amount: string;
        needs_amount: string | null;
        wants_amount: string | null;
        no_limit: boolean;
        normal_currency: string;
        cushion_currency: string;
      }>(sql`
        SELECT category_id::text, normal_amount::text, cushion_amount::text,
               needs_amount::text, wants_amount::text, no_limit,
               normal_currency::text, cushion_currency::text, converted_from
          FROM budgeting.category_limits
         WHERE tenant_id = ${tenantId}::uuid
           AND effective_from <= ${monthStart}::date
           AND (effective_to IS NULL OR effective_to > ${monthStart}::date)
      `);
      return result.rows;
    });

    if (r.isErr()) throw r.error;
    const m = new Map<
      string,
      EffectiveLimit
    >();
    for (const row of r.value) {
      m.set(row.category_id, {
        planned: BigInt(row.normal_amount),
        cushion: BigInt(row.cushion_amount),
        needs: row.needs_amount == null ? null : BigInt(row.needs_amount),
        wants: row.wants_amount == null ? null : BigInt(row.wants_amount),
        noLimit: row.no_limit === true,
        normalCurrency: row.normal_currency,
        cushionCurrency: row.cushion_currency,
        convertedFrom: (row as { converted_from?: EffectiveLimit["convertedFrom"] }).converted_from ?? null,
      });
    }
    return m;
  }

  async listForCategory(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryLimitRow[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        category_id: string;
        normal_amount: string;
        normal_currency: string;
        cushion_amount: string;
        cushion_currency: string;
        effective_from: Date;
        effective_to: Date | null;
        actor_user_id: string;
        created_at: Date;
      }>(sql`
        SELECT id, tenant_id::text, category_id::text,
               normal_amount::text, normal_currency,
               cushion_amount::text, cushion_currency,
               needs_amount::text, wants_amount::text, no_limit,
               effective_from, effective_to,
               actor_user_id::text, created_at
        FROM budgeting.category_limits
        WHERE category_id = ${categoryId}::uuid
          AND tenant_id = ${tenantId}::uuid
        ORDER BY effective_from DESC
      `);
      return result.rows;
    });

    if (r.isErr()) throw r.error;
    return r.value.map(rowToDto);
  }
}
