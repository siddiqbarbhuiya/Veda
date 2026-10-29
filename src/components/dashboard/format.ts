const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

/** Paise (integer) to a rupee string with Indian digit grouping, for example 123456 -> "₹1,234.56". */
export function formatInr(paise: number): string {
  return inr.format(paise / 100);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateOnly.format(date);
}

/** Balance below this value (paise) shows the low-balance badge. */
export const LOW_BALANCE_PAISE = 1000;
