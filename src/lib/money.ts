// One place for money formatting. Amounts are integer paise (1 INR = 100 paise).

/** Balance below this value (paise) shows the low-balance warning. New users start at 1000 paise. */
export const LOW_BALANCE_PAISE = 1000;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Paise to a rupee string with Indian digit grouping, for example 123456 -> "₹1,234.56". Non-finite input gives "-". */
export function formatInr(paise: number): string {
  if (typeof paise !== "number" || !Number.isFinite(paise)) return "-";
  return inr.format(paise / 100);
}

/** Compact form for price labels: whole rupees have no decimals ("₹29"), others have two ("₹29.50"). */
export function formatRupees(paise: number): string {
  if (typeof paise !== "number" || !Number.isFinite(paise)) return "-";
  return paise % 100 === 0 ? inrWhole.format(paise / 100) : inr.format(paise / 100);
}

/** True when the balance is a finite number below the low-balance threshold. */
export function isLowBalance(paise: number | null | undefined): boolean {
  return typeof paise === "number" && Number.isFinite(paise) && paise < LOW_BALANCE_PAISE;
}
