/**
 * The spendings column header says WHAT was used against what (user, 261017):
 * "used (plan)" and "used (reserve)", not "limit used" / "reserves used".
 */
import { describe, it, expect } from "vitest";
import en from "../../../../messages/en.json";
import pl from "../../../../messages/pl.json";
import uk from "../../../../messages/uk.json";

describe("Spendings column header copy", () => {
  it("reads used (plan) / used (reserve) in every locale", () => {
    expect(en.grid.header.row2.limitUsed).toBe("used (plan)");
    expect(en.grid.header.row2.used).toBe("used");
    expect(en.grid.header.row4.reservesUsed).toBe("used (reserve)");
    expect(pl.grid.header.row2.limitUsed).toBe("wykorzystano (plan)");
    expect(pl.grid.header.row2.used).toBe("wykorzystano");
    expect(pl.grid.header.row4.reservesUsed).toBe("wykorzystano (rezerwa)");
    expect(uk.grid.header.row2.limitUsed).toBe("використано (план)");
    expect(uk.grid.header.row2.used).toBe("використано");
    expect(uk.grid.header.row4.reservesUsed).toBe("використано (резерв)");
  });
});
