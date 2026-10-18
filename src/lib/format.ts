/** Formatting helpers for INR, areas and dates (en-IN conventions). */

const inrGrouping = new Intl.NumberFormat("en-IN");

/** "Rs 3.25 Cr", "Rs 85 Lakh", or full digits under one lakh. */
export function formatInr(amount: number): string {
  if (amount >= 1e7) return `Rs ${trim(amount / 1e7)} Cr`;
  if (amount >= 1e5) return `Rs ${trim(amount / 1e5)} Lakh`;
  return `Rs ${inrGrouping.format(amount)}`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** "1,850 to 2,400 sq ft", "1,850 sq ft", or undefined when no values. */
export function formatSqftRange(min?: number, max?: number): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min !== max) {
    return `${inrGrouping.format(min)} to ${inrGrouping.format(max)} sq ft`;
  }
  return `${inrGrouping.format((min ?? max)!)} sq ft`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** ISO date "2026-10-18" to "18 Oct 2026". Returns the input unchanged if unparseable. */
export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : dateFmt.format(new Date(t));
}

/** "+919876543210" to "919876543210" for wa.me links. */
export function waDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}
