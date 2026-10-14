import { describe, it, expect } from "vitest";
import { upgradeLegacyRowFields } from "./legacyRowFields";
import { validateBackupPayload } from "./backup";

describe("upgradeLegacyRowFields", () => {
  it("maps old gross/net keys to amount/expense and drops the old keys", () => {
    const out = upgradeLegacyRowFields({ id: "r1", gross: "1500", net: "1200" }) as Record<string, unknown>;
    expect(out.amount).toBe("1500");
    expect(out.expense).toBe("1200");
    expect("gross" in out).toBe(false);
    expect("net" in out).toBe(false);
  });

  it("returns rows already in the new format unchanged (same reference)", () => {
    const row = { id: "r1", amount: "1", expense: "2" };
    expect(upgradeLegacyRowFields(row)).toBe(row);
  });
});

describe("validateBackupPayload — old backups with gross/net still import", () => {
  it("accepts a backup whose rows use gross/net", () => {
    const now = 1;
    const result = validateBackupPayload({
      groups: [
        { id: "g1", name: "G", archived: false, defaultRate: 10, defaultSalary: 0, createdAt: now, updatedAt: now },
      ],
      periods: [
        { id: "p1", groupId: "g1", fromDate: null, toDate: null, paidWeeks: null, createdAt: now, updatedAt: now },
      ],
      clientRows: [
        { id: "r1", periodId: "p1", customer: "A", gross: "1000", net: "300", city: "", status: "none", comment: "", createdAt: now, updatedAt: now },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.clientRows[0].amount).toBe("1000");
      expect(result.data.clientRows[0].expense).toBe("300");
    }
  });
});
