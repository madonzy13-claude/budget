import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import pl from "../messages/pl.json";
import uk from "../messages/uk.json";

const KEYS = [
  "aggregate.title",
  "aggregate.hero_label",
  "aggregate.investments",
  "aggregate.cash",
  "aggregate.reserves",
  "aggregate.composition_title",
  "aggregate.trend_title",
  "aggregate.attention_title",
  "aggregate.flow_title",
  "aggregate.spent",
  "aggregate.left",
  "aggregate.my_share",
  "aggregate.rate_unavailable",
  "aggregate.empty",
  "budget.aggregation.feature_label",
  "budget.aggregation.feature_help_text",
  "budget.aggregation.feature_on_toast",
  "budget.aggregation.feature_off_toast",
  "budget.aggregation.error_save",
  "budget.ownership.title",
  "budget.ownership.help_text",
  "budget.ownership.total_label",
  "budget.ownership.must_be_100",
  "budget.ownership.save",
  "budget.ownership.saved_toast",
  "budget.ownership.error_save",
];
const get = (o: any, path: string) =>
  path.split(".").reduce((a, k) => a?.[k], o);

describe("aggregate i18n keys", () => {
  for (const k of KEYS) {
    it(`present in en/pl/uk: ${k}`, () => {
      expect(get(en, k), `en ${k}`).toBeTruthy();
      expect(get(pl, k), `pl ${k}`).toBeTruthy();
      expect(get(uk, k), `uk ${k}`).toBeTruthy();
    });
  }
});
