import { describe, it, expect } from "vitest";
import { LOW_BALANCE_PAISE, formatInr, formatRupees, isLowBalance } from "../money";
import { TOPUP_PACKS, creditForAmount, packCreditLabel, packForAmount } from "../razorpay/packs";

const nbsp = / /g;
const norm = (s: string) => s.replace(nbsp, " ");

describe("formatInr", () => {
  it("formats paise with Indian grouping and two decimals", () => {
    expect(norm(formatInr(123456))).toBe("₹1,234.56");
    expect(norm(formatInr(10900000))).toBe("₹1,09,000.00");
    expect(norm(formatInr(0))).toBe("₹0.00");
  });

  it("returns a dash for non-finite values", () => {
    expect(formatInr(NaN)).toBe("-");
    expect(formatInr(Infinity)).toBe("-");
    expect(formatInr(undefined as unknown as number)).toBe("-");
  });
});

describe("formatRupees", () => {
  it("drops decimals for whole rupees", () => {
    expect(norm(formatRupees(2900))).toBe("₹29");
    expect(norm(formatRupees(2950))).toBe("₹29.50");
    expect(norm(formatRupees(1090000))).toBe("₹10,900");
  });

  it("returns a dash for non-finite values", () => {
    expect(formatRupees(NaN)).toBe("-");
  });
});

describe("isLowBalance", () => {
  it("is true only below the threshold", () => {
    expect(isLowBalance(LOW_BALANCE_PAISE - 1)).toBe(true);
    expect(isLowBalance(LOW_BALANCE_PAISE)).toBe(false);
    expect(isLowBalance(null)).toBe(false);
    expect(isLowBalance(NaN)).toBe(false);
  });
});

describe("pack module", () => {
  it("maps amounts to credit", () => {
    expect(creditForAmount(2900)).toBe(2900);
    expect(creditForAmount(9900)).toBe(10900);
    expect(creditForAmount(5000)).toBeNull();
    expect(packForAmount(4900)?.name).toBe("Standard");
    expect(packForAmount("4900")).toBeUndefined();
  });

  it("labels packs without raw paise", () => {
    const value = TOPUP_PACKS.find((p) => p.name === "Value")!;
    expect(norm(packCreditLabel(value))).toBe("₹109 (includes ₹10 bonus)");
    expect(norm(packCreditLabel(TOPUP_PACKS[0]))).toBe("₹29");
  });
});
