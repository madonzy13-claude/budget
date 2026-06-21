import { ok, err, type Result } from "neverthrow";
import type {
  InstrumentRepo,
  InstrumentSearchResult,
} from "../ports/instrument-repo";

/** INV-07 / D-04: local trigram search only — never calls a price provider. */
export function searchInstruments(deps: { instrumentRepo: InstrumentRepo }) {
  return async (
    query: string,
    assetClass?: string | null,
  ): Promise<Result<InstrumentSearchResult[], Error>> => {
    try {
      const q = (query ?? "").trim();
      if (q.length < 2) return ok([]);
      return ok(await deps.instrumentRepo.search(q, 20, assetClass ?? null));
    } catch (e) {
      return err(e as Error);
    }
  };
}
