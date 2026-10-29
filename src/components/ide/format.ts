const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an integer paise amount as an en-IN rupee string. */
export function formatPaise(paise: number): string {
  return rupee.format(paise / 100);
}
