/**
 * txn-mapper.ts — server/client-shared mapping from snake_case API DTO to
 * camelCase TxnDTO. No "use client" directive — safely callable from RSC
 * page.tsx and from client hooks.
 */

export interface TxnDTO {
  id: string;
  categoryId: string;
  amountConvertedCents: string;
  currencyConverted: string;
  amountOriginalCents?: string;
  currencyOriginal?: string;
  fxRate?: string;
  fxAsOf?: string;
  note?: string | null;
  transactionDate: string;
  confirmedAt: string | null;
  pending?: boolean;
  unsent?: boolean;
}

export interface TxnRowSnake {
  id: string;
  category_id: string;
  amount_converted_cents: string | number;
  currency_converted?: string;
  currency_original?: string;
  amount_original_cents?: string | number;
  fx_rate?: string;
  fx_as_of?: string;
  note?: string | null;
  date?: string;
  transaction_date?: string;
  confirmed_at: string | null;
  rule_name?: string;
}

export function mapTxnRowToDTO(row: TxnRowSnake): TxnDTO {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountConvertedCents: String(row.amount_converted_cents),
    currencyConverted: row.currency_converted ?? row.currency_original ?? "EUR",
    ...(row.amount_original_cents != null
      ? { amountOriginalCents: String(row.amount_original_cents) }
      : {}),
    ...(row.currency_original != null
      ? { currencyOriginal: row.currency_original }
      : {}),
    ...(row.fx_rate != null ? { fxRate: row.fx_rate } : {}),
    ...(row.fx_as_of != null ? { fxAsOf: row.fx_as_of } : {}),
    note: row.note ?? null,
    transactionDate: row.transaction_date ?? row.date ?? "",
    confirmedAt: row.confirmed_at,
  };
}
